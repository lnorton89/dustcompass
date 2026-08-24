import { Layer, Source } from '@vis.gl/react-maplibre'
import type { CityGeometry } from '../brc/city'
import type { PlayaPalette } from './style'

interface Props {
  city: CityGeometry
  /** Surveyed camp block footprints. */
  campOutlines: GeoJSON.FeatureCollection
  palette: PlayaPalette
}

/** The Man and the portals: labelled dots, and a tap lands on the dot. */
export const LANDMARK_LAYER_ID = 'landmark-dot'

/**
 * The city itself: fence, plazas, streets, landmarks. All of it comes from
 * client-generated GeoJSON, so there is nothing to fetch and nothing to cache.
 */
export function CityLayers({ city, campOutlines, palette }: Props) {
  return (
    <>
      <Source id="fence" type="geojson" data={city.fence}>
        <Layer
          id="fence-line"
          type="line"
          paint={{
            'line-color': palette.fence,
            'line-width': 2,
            'line-dasharray': [3, 2],
            'line-opacity': 0.9,
          }}
        />
      </Source>

      {/*
        The surveyed footprints of the camp blocks. Only from z15 up: below
        that they are finer than a pixel and just muddy the streets.
      */}
      <Source id="camp-outlines" type="geojson" data={campOutlines}>
        <Layer
          id="camp-outline-line"
          type="line"
          minzoom={15}
          paint={{
            'line-color': palette.streetCasing,
            'line-width': ['interpolate', ['linear'], ['zoom'], 15, 0.4, 19, 1.6],
            'line-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0, 16, 0.8],
          }}
        />
      </Source>

      <Source id="plazas" type="geojson" data={city.plazas}>
        <Layer id="plaza-fill" type="fill" paint={{ 'fill-color': palette.plaza }} />
      </Source>

      <Source id="streets" type="geojson" data={city.streets}>
        <Layer
          id="street-casing"
          type="line"
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{
            'line-color': palette.streetCasing,
            'line-width': roadWidth(1.6),
          }}
        />
        <Layer
          id="street-fill"
          type="line"
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': palette.street, 'line-width': roadWidth(1) }}
        />
        <Layer
          id="street-label"
          type="symbol"
          minzoom={12.75}
          layout={{
            'symbol-placement': 'line',
            'text-field': ['get', 'name'],
            'text-font': ['Open Sans Regular'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 12.75, 10, 15, 13] as unknown as number,
            'text-letter-spacing': 0.08,
            'text-max-angle': 30,
          }}
          paint={{
            'text-color': palette.label,
            'text-halo-color': palette.labelHalo,
            'text-halo-width': 1.4,
          }}
        />
      </Source>

      <Source id="landmarks" type="geojson" data={city.landmarks}>
        <Layer
          id="landmark-label"
          type="symbol"
          layout={{
            'text-field': ['get', 'name'],
            'text-font': ['Open Sans Regular'],
            // The city's fixed points, and the ones everybody navigates by.
            // Placed before every other label layer, so they win collisions.
            'text-size': ['interpolate', ['linear'], ['zoom'], 13, 13, 17, 17] as unknown as number,
            'text-offset': [0, 1.1],
            'text-anchor': 'top',
          }}
          paint={{
            'text-color': palette.label,
            'text-halo-color': palette.labelHalo,
            'text-halo-width': 1.4,
          }}
        />
        <Layer
          id={LANDMARK_LAYER_ID}
          type="circle"
          paint={{
            'circle-radius': 4,
            'circle-color': palette.label,
            'circle-stroke-color': palette.playa,
            'circle-stroke-width': 1.5,
          }}
        />
      </Source>
    </>
  )
}

/**
 * Streets are a fixed width on the ground, not on the screen, so they have to
 * scale with zoom to stay truthful. Roughly 1px per 2m at z16.
 */
function roadWidth(multiplier: number) {
  return [
    'interpolate',
    ['exponential', 2],
    ['zoom'],
    12,
    0.7 * multiplier,
    16,
    3 * multiplier,
    19,
    22 * multiplier,
  ] as unknown as number
}
