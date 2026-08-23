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
 * A straight line to where you are heading. Deliberately not a routed path:
 * the playa is an open plane crossed by a street grid, people cut across it
 * constantly, and pretending to know a route would be both wrong and slower to
 * read than the direction and the distance.
 */
export function RouteLayer({ from, to, palette }: Props) {
  const data = useMemo<GeoJSON.FeatureCollection<GeoJSON.LineString>>(() => {
    if (!from || !to) return EMPTY
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
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
