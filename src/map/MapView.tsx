import { useCallback, useMemo, useState } from 'react'
import {
  GeolocateControl,
  Map as MapGL,
  NavigationControl,
  Marker,
  type MapLayerMouseEvent,
  type MapRef,
} from '@vis.gl/react-maplibre'
import type { GeoJSONSource } from 'maplibre-gl'
import type { PlayaData } from '../data/usePlayaData'
import type { Poi, PoiKind } from '../data/types'
import type { SavedPlace } from '../data/useSavedPlaces'
import { reverseGeocode } from '../brc/geocode'
import type { Position } from '../brc/geo'
import { cityOutlinePoints, frameFor } from '../brc/frame'
import { CityLayers, LANDMARK_LAYER_ID } from './CityLayers'
import { POI_CLUSTER_LAYER_ID, POI_LABEL_LAYER_ID, POI_LAYER_ID, PoiLayers } from './PoiLayers'

/** How far from the tap to look for the label that names what was tapped. */
const LABEL_HIT_RADIUS = 18
/** The same allowance for the survey's dots, which carry no label to aim at. */
const DOT_HIT_RADIUS = 12
import { RouteLayer } from './RouteLayer'
import { SAVED_LAYER_ID, SavedPlacesLayer } from './SavedPlacesLayer'
import { SERVICE_LAYER_ID, ServiceLayers, TOILET_LAYER_ID } from './ServiceLayers'
import { nearestFeature } from './pick'
import { baseStyle, paletteFor, type ThemeMode } from './style'
import { FocusMarker } from './FocusMarker'
import { PlayaScene } from './PlayaScene'
import { assetUrl } from '../config'

interface Props {
  data: PlayaData
  mode: ThemeMode
  visible: Set<PoiKind>
  showServices: boolean
  showToilets: boolean
  /** True to rotate the map so 12:00 points up, which is how the city reads. */
  cityUp: boolean
  onSelect: (poi: Poi | undefined) => void
  onProbe: (address: string, position: Position) => void
  /** Fires when the browser reports the user's position. */
  onLocate: (position: Position) => void
  /** A dropped or shared location to mark, if any. */
  pin?: { position: Position; address: string }
  /**
   * Where a shared link wants the camera. Framing the whole city on load would
   * otherwise race this and win, dropping the visitor on the city view instead
   * of the place they were sent to.
   */
  initialTarget?: Position
  /** Straight line drawn to the place being navigated to. */
  route?: { from: Position; to: Position }
  /** The listing whose detail drawer is open. */
  selected?: Poi
  /** Kept visible after the detail drawer closes and navigation begins. */
  destination?: { name: string; position: Position; address?: string; approximate?: boolean }
  savedPlaces: SavedPlace[]
  onSelectPlace: (id: string) => void
  mapRef: React.RefObject<MapRef | null>
}

const GLYPHS = assetUrl('fonts/{fontstack}/{range}.pbf')

/**
 * Ranger stations, medical, ice, toilets, the Man and the portals. They come
 * from the survey rather than the listings API, but a tap on one asks the same
 * question a tap on a camp does, and gets the same answer.
 */
const CIVIC_LAYER_IDS = [SERVICE_LAYER_ID, TOILET_LAYER_ID, LANDMARK_LAYER_ID]

/** Everything a tap can land on, so the cursor knows where it is worth one. */
const INTERACTIVE_LAYER_IDS = [
  POI_CLUSTER_LAYER_ID,
  POI_LAYER_ID,
  SAVED_LAYER_ID,
  ...CIVIC_LAYER_IDS,
]

export function MapView({
  data,
  mode,
  visible,
  showServices,
  showToilets,
  cityUp,
  onSelect,
  onProbe,
  onLocate,
  pin,
  initialTarget,
  route,
  selected,
  destination,
  savedPlaces,
  onSelectPlace,
  mapRef,
}: Props) {
  const palette = paletteFor(mode)
  const style = useMemo(() => baseStyle(palette, GLYPHS), [palette])
  const [cursor, setCursor] = useState<string>()
  const poiIndex = useMemo(
    () => new globalThis.Map(data.pois.map((poi) => [poi.uid, poi])),
    [data.pois],
  )

  // Frame the whole city rather than guessing a zoom. A fixed zoom that suits a
  // desktop window crops the city badly on a tall phone screen.
  const outline = useMemo(() => cityOutlinePoints(data.city.streets), [data.city])

  const handleClick = useCallback(
    (event: MapLayerMouseEvent) => {
      const hit = event.features?.[0]
      if (hit?.layer?.id === SAVED_LAYER_ID && hit.properties?.id) {
        onSelectPlace(String(hit.properties.id))
        return
      }
      if (hit?.layer?.id === POI_CLUSTER_LAYER_ID && hit.properties?.cluster_id) {
        const source = event.target.getSource('pois') as GeoJSONSource
        const center = (hit.geometry as GeoJSON.Point).coordinates as Position
        void source.getClusterExpansionZoom(Number(hit.properties.cluster_id)).then((zoom) => {
          event.target.easeTo({ center, zoom: Math.max(zoom, event.target.getZoom() + 1), duration: 500 })
        })
        return
      }
      const { x, y } = event.point
      const nearestIn = (layers: string[], radius: number) =>
        nearestFeature(
          event.target.queryRenderedFeatures(
            [
              [x - radius, y - radius],
              [x + radius, y + radius],
            ],
            { layers },
          ),
          event.point,
          (position) => event.target.project(position),
        )
      const listed = (feature: ReturnType<typeof nearestIn>) =>
        feature && poiIndex.get(String(feature.properties.uid))

      // The city's own places first. Each is one dot standing alone, so the
      // nearest one to the tap is unambiguously the one meant — unlike the
      // camps below, which pile up on a shared intersection. Their own dots
      // are small, and a thumb is not, so they are given a little room.
      const civic = listed(nearestIn(CIVIC_LAYER_IDS, DOT_HIT_RADIUS))
      if (civic) {
        onSelect(civic)
        return
      }

      // A playa address names an intersection, so several camps genuinely sit
      // on one point. Only one of them wins the label, and that is the name the
      // person just tapped — take theirs rather than whichever the renderer
      // happened to return first.
      // The label is drawn below its dot, so the exact click pixel is never
      // inside it. Look in a small box instead, and among whatever is labelled
      // there take the one anchored nearest the tap.
      const labelled = nearestIn([POI_LABEL_LAYER_ID], LABEL_HIT_RADIUS)
      const chosen = labelled ?? event.features?.find((feature) => feature.properties?.uid)
      if (chosen?.properties?.uid) {
        onSelect(poiIndex.get(String(chosen.properties.uid)))
        return
      }
      // Clicking bare playa answers "where am I?" in the only vocabulary that
      // works out here — a clock position and a street.
      const position: Position = [event.lngLat.lng, event.lngLat.lat]
      onProbe(reverseGeocode(position, data.layout).label, position)
      onSelect(undefined)
    },
    [data.layout, onProbe, onSelect, onSelectPlace, poiIndex],
  )

  return (
    <MapGL
      ref={mapRef}
      initialViewState={{
        longitude: data.layout.center.geometry.coordinates[0],
        latitude: data.layout.center.geometry.coordinates[1],
        zoom: 13,
        // 12:00 sits at compass bearing 45°, so rotating the map by that much
        // puts the Man at the centre with 12:00 straight up.
        bearing: cityUp ? data.layout.bearing : 0,
      }}
      mapStyle={style}
      interactiveLayerIds={INTERACTIVE_LAYER_IDS}
      onClick={handleClick}
      onError={(event) => console.error('Map rendering error:', event.error)}
      onMouseMove={(event) => setCursor(event.features?.length ? 'pointer' : undefined)}
      onMouseLeave={() => setCursor(undefined)}
      cursor={cursor}
      onLoad={(event) => {
        const map = event.target
        const bearing = cityUp ? data.layout.bearing : 0

        if (initialTarget) {
          map.jumpTo({ center: initialTarget, zoom: 16.5, bearing })
        } else {
          // Frame the city for the viewport actually in front of the user.
          const canvas = map.getCanvas()
          const frame = frameFor(
            outline,
            data.layout.center.geometry.coordinates as Position,
            bearing,
            { width: canvas.clientWidth, height: canvas.clientHeight, padding: 40 },
          )
          if (frame) map.jumpTo({ center: frame.center, zoom: frame.zoom, bearing })
        }
        // A readiness flag end-to-end tests can wait on in any build. The map
        // handle itself is only exposed in development.
        document.documentElement.dataset.mapReady = 'true'
        if (process.env.NEXT_PUBLIC_E2E === '1') {
          ;(window as unknown as Record<string, unknown>).__map = event.target
        }
      }}
      maxPitch={60}
      /*
       * The credit is not gone, it has moved: it reads in the footnote at the
       * corner of the map, alongside the non-affiliation line it belongs next
       * to. MapLibre's own control put a second white pill in the middle of a
       * phone screen saying almost the same thing, and there is no basemap
       * here to attribute — the city is drawn from Burning Man's survey, which
       * is exactly what the footnote now credits.
       */
      attributionControl={false}
      style={{ position: 'absolute', inset: 0 }}
    >
      <NavigationControl position="bottom-right" visualizePitch showCompass />
      <GeolocateControl
        position="bottom-right"
        trackUserLocation
        positionOptions={{ enableHighAccuracy: true }}
        onGeolocate={(event) => onLocate([event.coords.longitude, event.coords.latitude])}
      />
      {pin && (
        <Marker longitude={pin.position[0]} latitude={pin.position[1]} anchor="bottom">
          <div
            title={pin.address}
            aria-label={`Marked location: ${pin.address}`}
            style={{
              width: 16,
              height: 16,
              borderRadius: '50% 50% 50% 0',
              transform: 'rotate(-45deg)',
              background: palette.art,
              border: `2px solid ${palette.playa}`,
              boxShadow: '0 1px 4px rgba(0,0,0,0.6)',
            }}
          />
        </Marker>
      )}

      {selected && !destination && (
        <FocusMarker
          position={selected.position}
          name={selected.name}
          address={selected.address}
          palette={palette}
        />
      )}
      {destination && (
        <FocusMarker
          position={destination.position}
          name={destination.name}
          address={destination.address}
          navigating
          approximate={destination.approximate}
          palette={palette}
        />
      )}

      {/* The drawn desert, under everything the survey put on it. */}
      <PlayaScene layout={data.layout} palette={palette} />
      <CityLayers city={data.city} campOutlines={data.campOutlines} palette={palette} />
      <RouteLayer from={route?.from} to={route?.to} palette={palette} />
      <SavedPlacesLayer places={savedPlaces} palette={palette} />
      <ServiceLayers
        services={data.services}
        toilets={data.toilets}
        showServices={showServices}
        showToilets={showToilets}
        palette={palette}
      />
      <PoiLayers
        pois={data.pois}
        visible={visible}
        palette={palette}
        focusPosition={destination?.position ?? selected?.position}
      />
    </MapGL>
  )
}
