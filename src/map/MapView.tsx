import { useCallback, useMemo, useState } from 'react'
import {
  GeolocateControl,
  Map as MapGL,
  NavigationControl,
  Marker,
  ScaleControl,
  type MapLayerMouseEvent,
  type MapRef,
} from '@vis.gl/react-maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { PlayaData } from '../data/usePlayaData'
import type { Poi, PoiKind } from '../data/types'
import { reverseGeocode } from '../brc/geocode'
import type { Position } from '../brc/geo'
import { cityOutlinePoints, frameFor } from '../brc/frame'
import { CityLayers } from './CityLayers'
import { POI_LAYER_ID, PoiLayers } from './PoiLayers'
import { ServiceLayers } from './ServiceLayers'
import { baseStyle, DARK, LIGHT } from './style'

interface Props {
  data: PlayaData
  mode: 'dark' | 'light'
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
  mapRef: React.RefObject<MapRef | null>
}

const GLYPHS = `${import.meta.env.BASE_URL}fonts/{fontstack}/{range}.pbf`

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
  mapRef,
}: Props) {
  const palette = mode === 'dark' ? DARK : LIGHT
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
      if (hit?.properties?.uid) {
        onSelect(poiIndex.get(String(hit.properties.uid)))
        return
      }
      // Clicking bare playa answers "where am I?" in the only vocabulary that
      // works out here — a clock position and a street.
      const position: Position = [event.lngLat.lng, event.lngLat.lat]
      onProbe(reverseGeocode(position, data.layout).label, position)
      onSelect(undefined)
    },
    [data.layout, onProbe, onSelect, poiIndex],
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
      interactiveLayerIds={[POI_LAYER_ID]}
      onClick={handleClick}
      onMouseEnter={() => setCursor('pointer')}
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
        if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__map = event.target
      }}
      maxPitch={60}
      attributionControl={{ compact: true, customAttribution: 'Layout & listings: iBurn (MPL-2.0), Burning Man Project' }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <NavigationControl position="bottom-right" visualizePitch showCompass />
      <GeolocateControl
        position="bottom-right"
        trackUserLocation
        positionOptions={{ enableHighAccuracy: true }}
        onGeolocate={(event) => onLocate([event.coords.longitude, event.coords.latitude])}
      />
      <ScaleControl position="bottom-left" unit="imperial" />
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

      <CityLayers city={data.city} palette={palette} />
      <ServiceLayers
        services={data.services}
        toilets={data.toilets}
        showServices={showServices}
        showToilets={showToilets}
        palette={palette}
      />
      <PoiLayers pois={data.pois} visible={visible} palette={palette} />
    </MapGL>
  )
}
