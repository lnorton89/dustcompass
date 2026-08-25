import { useMemo } from 'react'
import { Layer, Source } from '@vis.gl/react-maplibre'
import type { PlayaRoute } from '../brc/routing'
import type { PlayaPalette } from './style'

interface Props {
  route?: PlayaRoute
  palette: PlayaPalette
}

const EMPTY: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
  type: 'FeatureCollection',
  features: [],
}

/**
 * City routes follow the annual surveyed street graph. Pure open-playa/fallback
 * guidance remains dashed so a straight bearing can never masquerade as a
 * walkable road. Hybrid routes are solid because their direct leg exists only
 * across the genuinely open playa inside Esplanade.
 */
export function RouteLayer({ route, palette }: Props) {
  const data = useMemo<GeoJSON.FeatureCollection<GeoJSON.LineString>>(() => {
    if (!route) return EMPTY
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { guidance: route.kind },
          geometry: { type: 'LineString', coordinates: route.coordinates },
        },
      ],
    }
  }, [route])

  return (
    <Source id="route" type="geojson" data={data}>
      <Layer
        id="route-line"
        type="line"
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{
          'line-color': palette.art,
          'line-width': 3.5,
          'line-opacity': 0.9,
          ...(route?.kind === 'direct' ? { 'line-dasharray': [2, 1.5] } : {}),
        }}
      />
    </Source>
  )
}
