import { useMemo } from 'react'
import { Layer, Source } from '@vis.gl/react-maplibre'
import type { Poi, PoiKind } from '../data/types'
import type { Position } from '../brc/geo'
import type { PlayaPalette } from './style'

interface Props {
  pois: Poi[]
  visible: Set<PoiKind>
  palette: PlayaPalette
  /** Hide labels that would compete with the explicit selected/destination callout. */
  focusPosition?: Position
}

export const POI_LAYER_ID = 'poi-dot'
export const POI_CLUSTER_LAYER_ID = 'poi-cluster'

/**
 * Camps and art as a single clustered source. ~1,700 points is well inside what
 * MapLibre's own GeoJSON clustering handles on a phone — deck.gl only starts to
 * earn its weight an order of magnitude above this.
 */
export function PoiLayers({ pois, visible, palette, focusPosition }: Props) {
  const data = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(
    () => ({
      type: 'FeatureCollection',
      features: pois
        .filter((poi) => visible.has(poi.kind))
        .map((poi) => ({
          type: 'Feature',
          id: poi.uid,
          properties: {
            uid: poi.uid,
            kind: poi.kind,
            name: poi.name,
            address: poi.address ?? '',
            focusOverlap: Boolean(
              focusPosition &&
                Math.abs(poi.position[0] - focusPosition[0]) < 1e-7 &&
                Math.abs(poi.position[1] - focusPosition[1]) < 1e-7,
            ),
          },
          geometry: { type: 'Point', coordinates: poi.position },
        })),
    }),
    [focusPosition, pois, visible],
  )

  const colorByKind = ['match', ['get', 'kind'], 'art', palette.art, palette.camp] as const

  return (
    <Source id="pois" type="geojson" data={data} cluster clusterRadius={44} clusterMaxZoom={15}>
      <Layer
        id={POI_CLUSTER_LAYER_ID}
        type="circle"
        filter={['has', 'point_count']}
        paint={{
          'circle-color': palette.camp,
          'circle-opacity': 0.85,
          'circle-radius': ['step', ['get', 'point_count'], 13, 20, 18, 60, 24],
          'circle-stroke-color': palette.playa,
          'circle-stroke-width': 2,
        }}
      />
      <Layer
        id="poi-cluster-count"
        type="symbol"
        filter={['has', 'point_count']}
        layout={{
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Open Sans Regular'],
          'text-size': 12,
        }}
        paint={{ 'text-color': palette.playa }}
      />
      <Layer
        id={POI_LAYER_ID}
        type="circle"
        filter={['!', ['has', 'point_count']]}
        paint={{
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 3, 17, 7],
          'circle-color': colorByKind as unknown as string,
          'circle-stroke-color': palette.playa,
          'circle-stroke-width': 1.5,
        }}
      />
      <Layer
        id="poi-label"
        type="symbol"
        minzoom={15.5}
        filter={[
          'all',
          ['!', ['has', 'point_count']],
          ['!=', ['get', 'focusOverlap'], true],
        ]}
        layout={{
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Regular'],
          'text-size': 13,
          'text-offset': [0, 0.9],
          'text-anchor': 'top',
          'text-optional': true,
        }}
        paint={{
          'text-color': palette.label,
          'text-halo-color': palette.labelHalo,
          'text-halo-width': 1.8,
        }}
      />
    </Source>
  )
}
