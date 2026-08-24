import { useMemo } from 'react'
import { Layer, Source } from '@vis.gl/react-maplibre'
import type { Poi, PoiKind } from '../data/types'
import type { Position } from '../brc/geo'
import { labelRamp, labelSize, type PlayaPalette } from './style'

interface Props {
  pois: Poi[]
  visible: Set<PoiKind>
  /**
   * Everything sharing each point, computed once by the map and used for both
   * jobs — the count drawn on a dot and the list a tap opens. Passed in rather
   * than recomputed here, so the number on a dot is a promise the list keeps.
   */
  stacks: Map<string, Poi[]>
  palette: PlayaPalette
  /** How much bigger the reader has asked the map's labels to be drawn. */
  labelScale: number
  /** Hide labels that would compete with the explicit selected/destination callout. */
  focusPosition?: Position
}

/**
 * Two listings are on the same point when they round to the same spot at the
 * precision the geocoder works to. Exported so the map picks stacks by the
 * same rule this layer draws them by.
 */
export const stackKey = (position: Position) =>
  `${position[0].toFixed(7)},${position[1].toFixed(7)}`

export const POI_LAYER_ID = 'poi-dot'
export const POI_CLUSTER_LAYER_ID = 'poi-cluster'
/** The label layer decides which of several coincident camps is named. */
export const POI_LABEL_LAYER_ID = 'poi-label'
/** How many listings share a dot, drawn on the dot itself. */
export const POI_STACK_COUNT_LAYER_ID = 'poi-stack-count'

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ]
}

/**
 * The filter bar uses palette.art/palette.camp as a legend — turning a toggle
 * on paints the map in that color. A cluster containing both kinds can't
 * honestly claim either legend color, so it gets an even blend instead of
 * silently defaulting to camp (the bug in issue #35). It's computed from the
 * live palette rather than a fixed hex so it stays correct across dark,
 * light and night themes without a third palette entry.
 */
function mixColors(a: string, b: string): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  const mix = (x: number, y: number) => Math.round((x + y) / 2)
  return `#${[mix(ar, br), mix(ag, bg), mix(ab, bb)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`
}

/**
 * clusterProperties (see the <Source> below) sums an `artCount` per cluster.
 * A cluster is all-art when that count equals the cluster's total, all-camp
 * when it's zero, and mixed otherwise — mixed gets a deliberate blended
 * color rather than falling through to camp.
 */
export function clusterColor(palette: PlayaPalette) {
  return [
    'case',
    ['==', ['get', 'artCount'], ['get', 'point_count']],
    palette.art,
    ['==', ['get', 'artCount'], 0],
    palette.camp,
    mixColors(palette.art, palette.camp),
  ] as const
}

/**
 * Camps and art as a single clustered source. ~1,700 points is well inside what
 * MapLibre's own GeoJSON clustering handles on a phone — deck.gl only starts to
 * earn its weight an order of magnitude above this.
 */
export function PoiLayers({ pois, visible, stacks, palette, labelScale, focusPosition }: Props) {
  const data = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => {
    /*
     * A playa address names an intersection, not a plot, and until the survey
     * publishes coordinates every listing is placed from its address — so most
     * of the city arrives as stacks. Three quarters of the camps share a point
     * with at least one other, the deepest six deep. Drawn as plain dots those
     * stacks are a lie of omission: five of those six camps cannot be tapped,
     * and nothing on the map admits they are there.
     */
    const shown = pois.filter((poi) => visible.has(poi.kind))
    return {
      type: 'FeatureCollection',
      features: shown.map((poi) => ({
        type: 'Feature',
        id: poi.uid,
        properties: {
          uid: poi.uid,
          kind: poi.kind,
          name: poi.name,
          address: poi.address ?? '',
          stack: stacks.get(stackKey(poi.position))?.length ?? 1,
          focusOverlap: Boolean(
            focusPosition &&
              Math.abs(poi.position[0] - focusPosition[0]) < 1e-7 &&
              Math.abs(poi.position[1] - focusPosition[1]) < 1e-7,
          ),
        },
        geometry: { type: 'Point', coordinates: poi.position },
      })),
    }
  }, [focusPosition, pois, stacks, visible])

  const colorByKind = ['match', ['get', 'kind'], 'art', palette.art, palette.camp] as const

  return (
    <Source
      id="pois"
      type="geojson"
      data={data}
      cluster
      clusterRadius={44}
      clusterMaxZoom={15}
      // Counts art members per cluster so the circle layer below can tell a
      // pure-art cluster from a pure-camp one from a mixed one, instead of
      // the fixed camp color every cluster used to get regardless of what
      // was actually inside it (issue #35). Camp count is implied by
      // point_count - artCount, since visible.has() upstream only ever lets
      // art/camp through this source.
      clusterProperties={{
        artCount: ['+', ['case', ['==', ['get', 'kind'], 'art'], 1, 0]],
      }}
    >
      <Layer
        id={POI_CLUSTER_LAYER_ID}
        type="circle"
        filter={['has', 'point_count']}
        paint={{
          'circle-color': clusterColor(palette) as unknown as string,
          // A cluster is scaffolding — it says "there is a lot here", and it
          // disappears the moment you look closer. At 0.85 with a full-strength
          // count on it, "160" was reading louder than "Center Camp": the city
          // came across as a field of numbered bubbles with place names lost
          // between them. It steps back so the named places can come forward.
          'circle-opacity': 0.62,
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
          'text-size': labelSize(labelScale, 11),
        }}
        paint={{ 'text-color': palette.playa, 'text-opacity': 0.85 }}
      />
      <Layer
        id={POI_LAYER_ID}
        type="circle"
        filter={['!', ['has', 'point_count']]}
        paint={{
          // A stacked dot is drawn bigger so its count has somewhere to sit,
          // and so a thumb aiming at nine camps has more than seven pixels of
          // target. The size difference is itself the signal that there is more
          // here than one place.
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            13,
            ['case', ['>', ['get', 'stack'], 1], 4, 3],
            17,
            ['case', ['>', ['get', 'stack'], 1], 11, 7],
          ],
          'circle-color': colorByKind as unknown as string,
          'circle-stroke-color': palette.playa,
          'circle-stroke-width': 1.5,
        }}
      />
      <Layer
        id={POI_STACK_COUNT_LAYER_ID}
        type="symbol"
        minzoom={15.5}
        filter={['all', ['!', ['has', 'point_count']], ['>', ['get', 'stack'], 1]]}
        layout={{
          'text-field': ['to-string', ['get', 'stack']],
          'text-font': ['Open Sans Regular'],
          'text-size': labelSize(labelScale, 10),
          // Part of the dot, not a label: it must never be collided away, and
          // it must never push a place name out of the way either.
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        }}
        paint={{ 'text-color': palette.playa }}
      />
      <Layer
        id={POI_LABEL_LAYER_ID}
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
          // Read at arm's length, on a screen with dust on it, in daylight.
          // Grows with zoom, because at close range there is room for it and
          // the name is the whole reason you zoomed in.
          'text-size': labelRamp(labelScale, [
            [15.5, 13],
            [18, 16],
          ]),
          'text-offset': [0, 0.9],
          'text-anchor': 'top',
          // Camps are the most numerous thing on the map and the least likely
          // to be what you are looking for right now, so they are the labels
          // that give way when something has to. Landmarks, saved spots and
          // services are all placed before this layer and therefore win.
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
