import { useMemo } from 'react'
import { Layer, Source } from '@vis.gl/react-maplibre'
import type { CityLayout } from '../brc/layout'
import { buildPlaya } from '../brc/playa'
import type { PlayaPalette } from './style'

interface Props {
  layout: CityLayout
  palette: PlayaPalette
}

/**
 * The desert under the city, generated and drawn as vectors.
 *
 * Zoomed out, a single flat colour leaves the city floating in a void with no
 * basin around it and no sense of which way the open playa runs. This draws
 * that ground: the alkali pan, the tonal mottling a playa actually has from
 * above, the vehicle tracks worn across it, and the ranges standing round the
 * rim with the south left open toward Gerlach.
 *
 * Vectors rather than an image, for the same reason the city is generated
 * rather than tiled — it stays sharp at every zoom, costs a few kilobytes of
 * geometry instead of megabytes of raster in the offline cache, and recolours
 * with the theme instead of needing one baked file per palette.
 *
 * It is scenery and it behaves like scenery: it fades out as the city fills the
 * screen, because at street level the only things worth looking at are the ones
 * that were surveyed.
 */
export function PlayaScene({ layout, palette }: Props) {
  const scene = useMemo(() => buildPlaya(layout), [layout])

  // Detail earns its place as you zoom out; close in it is texture competing
  // with streets and camps for the same pixels.
  const sceneryOpacity = (max: number) =>
    ['interpolate', ['linear'], ['zoom'], 11, max, 14.5, max, 16.5, 0] as unknown as number

  return (
    <>
      <Source id="playa-basin" type="geojson" data={scene.basin}>
        <Layer
          id="playa-basin"
          type="fill"
          paint={{ 'fill-color': palette.basin, 'fill-opacity': 1 }}
        />
      </Source>

      <Source id="playa-patches" type="geojson" data={scene.patches}>
        <Layer
          id="playa-patches"
          type="fill"
          paint={{
            'fill-color': [
              'match',
              ['get', 'tone'],
              'pale',
              palette.patchPale,
              palette.patchShade,
            ],
            'fill-opacity': sceneryOpacity(0.55),
          }}
        />
      </Source>

      <Source id="playa-tracks" type="geojson" data={scene.tracks}>
        <Layer
          id="playa-tracks"
          type="line"
          paint={{
            'line-color': palette.track,
            'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.2, 15, 3],
            'line-opacity': sceneryOpacity(0.7),
          }}
        />
      </Source>

      <Source id="playa-ranges" type="geojson" data={scene.ranges}>
        <Layer
          id="playa-ranges"
          type="fill"
          paint={{ 'fill-color': palette.range, 'fill-opacity': 1 }}
        />
      </Source>
    </>
  )
}
