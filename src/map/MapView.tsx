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
import {
  POI_CLUSTER_LAYER_ID,
  POI_LABEL_LAYER_ID,
  POI_LAYER_ID,
  PoiLayers,
  stackKey,
} from './PoiLayers'

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
  /**
   * Label sizes, scaled by the reader's size preference. Unlike the interface,
   * the map's labels have room to grow into.
   */
  labelScale: number
  visible: Set<PoiKind>
  showServices: boolean
  showToilets: boolean
  /** True to rotate the map so 12:00 points up, which is how the city reads. */
  cityUp: boolean
  onSelect: (poi: Poi | undefined) => void
  /**
   * A tap that lands on several listings at once. Until the survey publishes
   * coordinates every listing is placed from its address, so most points on
   * the map carry more than one camp and picking one of them for the reader
   * is a guess. They get the list instead.
   */
  onSelectStack: (pois: Poi[]) => void
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
  labelScale,
  visible,
  showServices,
  showToilets,
  cityUp,
  onSelect,
  onSelectStack,
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

  /**
   * Everything sharing each point, by the same key the dots are drawn by — and
   * over the same listings, so the list a tap opens holds exactly what the map
   * is showing. Counting hidden kinds here offered the reader a camp they had
   * just filtered out, under a dot with no count on it.
   */
  const stacks = useMemo(() => {
    const out = new globalThis.Map<string, Poi[]>()
    for (const poi of data.pois.filter((candidate) => visible.has(candidate.kind))) {
      const key = stackKey(poi.position)
      const found = out.get(key)
      if (found) found.push(poi)
      else out.set(key, [poi])
    }
    return out
  }, [data.pois, visible])

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

      // A dot the tap landed on is the least ambiguous thing there is, so it
      // goes first. Labels used to win instead, because when several camps sat
      // on one point only one of them was named and that name was the one the
      // reader had aimed at. But the box a label is hunted in is 18px wide, so
      // a neighbouring camp's label could take a tap that was squarely on
      // someone else's dot — aiming at Jelly Dance opened Stoop, two hundred
      // feet away. Coincident camps no longer need the label to disambiguate
      // them: they all share a point, so they all open the same list.
      //
      // The label search stays as the fallback. The label is drawn below its
      // dot, so a reader aiming at the name lands on no dot at all, and among
      // whatever is labelled nearby the one anchored nearest the tap is theirs.
      const onDot = event.features?.find((feature) => feature.properties?.uid)
      const chosen = onDot ?? nearestIn([POI_LABEL_LAYER_ID], LABEL_HIT_RADIUS)
      if (chosen?.properties?.uid) {
        const poi = poiIndex.get(String(chosen.properties.uid))
        // Whichever of the nine the renderer happened to hand back was the one
        // the reader got, and the other eight were unreachable — the map had no
        // way of admitting they existed. Hand over the whole point instead and
        // let them say which one they meant.
        const sharing = poi ? (stacks.get(stackKey(poi.position)) ?? [poi]) : []
        if (sharing.length > 1) {
          onSelectStack(sharing)
          return
        }
        onSelect(poi)
        return
      }
      // Clicking bare playa answers "where am I?" in the only vocabulary that
      // works out here — a clock position and a street.
      const position: Position = [event.lngLat.lng, event.lngLat.lat]
      onProbe(reverseGeocode(position, data.layout).label, position)
      onSelect(undefined)
    },
    [data.layout, onProbe, onSelect, onSelectPlace, onSelectStack, poiIndex, stacks],
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
       * No attribution control. There is no basemap to attribute — the city is
       * drawn from the survey, and the survey is credited in the footnote, next
       * to the non-affiliation line it belongs beside. A second floating pill
       * saying nearly the same thing sat in the middle of the map on a phone.
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
        <FocusMarker position={selected.position} name={selected.name} address={selected.address} />
      )}
      {destination && (
        <FocusMarker
          position={destination.position}
          name={destination.name}
          address={destination.address}
          navigating
          approximate={destination.approximate}
        />
      )}

      {/* The drawn desert, under everything the survey put on it. */}
      <PlayaScene layout={data.layout} palette={palette} />
      <CityLayers
        city={data.city}
        campOutlines={data.campOutlines}
        palette={palette}
        labelScale={labelScale}
      />
      <RouteLayer from={route?.from} to={route?.to} palette={palette} />
      <SavedPlacesLayer places={savedPlaces} palette={palette} labelScale={labelScale} />
      <ServiceLayers
        services={data.services}
        toilets={data.toilets}
        showServices={showServices}
        showToilets={showToilets}
        palette={palette}
        labelScale={labelScale}
      />
      <PoiLayers
        pois={data.pois}
        visible={visible}
        palette={palette}
        labelScale={labelScale}
        focusPosition={destination?.position ?? selected?.position}
      />
    </MapGL>
  )
}
