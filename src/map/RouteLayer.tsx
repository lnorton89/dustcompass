import { useMemo } from 'react'
import { Layer, Source } from '@vis.gl/react-maplibre'
import type { Position } from '../brc/geo'
import type { PlayaPalette } from './style'

interface Props {
  from: Position | undefined
  to: Position | undefined
  palette: PlayaPalette
}

const EMPTY: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
  type: 'FeatureCollection',
  features: [],
}

/**
 * A direct bearing to where you are heading, deliberately styled as dashed
 * guidance rather than a routed path. It may cross occupied city blocks; the
 * navigation UI labels that limitation instead of implying it is walkable.
 */
export function RouteLayer({ from, to, palette }: Props) {
  const data = useMemo<GeoJSON.FeatureCollection<GeoJSON.LineString>>(() => {
    if (!from || !to) return EMPTY
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { guidance: 'straight-line' },
          geometry: { type: 'LineString', coordinates: [from, to] },
        },
      ],
    }
  }, [from, to])

  return (
    <Source id="route" type="geojson" data={data}>
      <Layer
        id="route-line"
        type="line"
        layout={{ 'line-cap': 'round' }}
        paint={{
          'line-color': palette.art,
          'line-width': 3,
          'line-opacity': 0.85,
          'line-dasharray': [2, 1.5],
        }}
      />
      <Layer
        id="route-end"
        type="circle"
        filter={['==', ['geometry-type'], 'LineString']}
        paint={{ 'circle-radius': 0 }}
      />
    </Source>
  )
}
