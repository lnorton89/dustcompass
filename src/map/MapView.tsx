import { useCallback, useMemo, useState } from 'react'
import {
  GeolocateControl,
  Map as MapGL,
  NavigationControl,
  ScaleControl,
  type MapLayerMouseEvent,
  type MapRef,
} from '@vis.gl/react-maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { PlayaData } from '../data/usePlayaData'
import type { Poi, PoiKind } from '../data/types'
import { reverseGeocode } from '../brc/geocode'
import type { Position } from '../brc/geo'
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
  mapRef,
}: Props) {
  const palette = mode === 'dark' ? DARK : LIGHT
  const style = useMemo(() => baseStyle(palette, GLYPHS), [palette])
  const [cursor, setCursor] = useState<string>()
  const poiIndex = useMemo(
    () => new globalThis.Map(data.pois.map((poi) => [poi.uid, poi])),
    [data.pois],
  )

  const [lon, lat] = data.layout.center.geometry.coordinates

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
        longitude: lon,
        latitude: lat,
        zoom: 13.6,
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
