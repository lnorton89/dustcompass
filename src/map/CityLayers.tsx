import { Layer, Source } from '@vis.gl/react-maplibre'
import type { CityGeometry } from '../brc/city'
import { labelRamp, type PlayaPalette } from './style'

interface Props {
  city: CityGeometry
  /** Surveyed camp block footprints. */
  campOutlines: GeoJSON.FeatureCollection
  palette: PlayaPalette
  /** How much bigger the reader has asked the map's labels to be drawn. */
  labelScale: number
  /**
   * The layout's own `road_width` — the survey's typical/fallback street
   * width — used as the baseline every drawn street's own surveyed `width`
   * (set on every street feature by `annularStreets()`/`radialStreets()` in
   * `city.ts`) is scaled against. See `roadWidth()`.
   */
  baseRoadWidth: number
}

/** The Man and the portals: labelled dots, and a tap lands on the dot. */
export const LANDMARK_LAYER_ID = 'landmark-dot'

/**
 * The city itself: fence, plazas, streets, landmarks. All of it comes from
 * client-generated GeoJSON, so there is nothing to fetch and nothing to cache.
 */
export function CityLayers({ city, campOutlines, palette, labelScale, baseRoadWidth }: Props) {
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
        The DMZ: a no-camping buffer band, present only in years whose survey
        draws one. An empty FeatureCollection here paints nothing, so absent
        years need no extra guard. Styled like the fence — a boundary, not a
        street — but filled rather than just outlined, since it's an area.
      */}
      <Source id="dmz" type="geojson" data={city.dmz}>
        <Layer
          id="dmz-fill"
          type="fill"
          paint={{ 'fill-color': palette.fence, 'fill-opacity': 0.12 }}
        />
        <Layer
          id="dmz-outline"
          type="line"
          paint={{
            'line-color': palette.fence,
            'line-width': 1,
            'line-dasharray': [2, 3],
            'line-opacity': 0.7,
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
            'line-width': roadWidth(1.6, baseRoadWidth),
          }}
        />
        <Layer
          id="street-fill"
          type="line"
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': palette.street, 'line-width': roadWidth(1, baseRoadWidth) }}
        />
        <Layer
          id="street-label"
          type="symbol"
          minzoom={12.75}
          layout={{
            'symbol-placement': 'line',
            'text-field': ['get', 'name'],
            'text-font': ['Open Sans Regular'],
            'text-size': labelRamp(labelScale, [
              [12.75, 10],
              [15, 13],
            ]),
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

      {/*
        Where the gate road crosses into the city — present only in years
        whose survey draws it. Dashed and thin like the fence, but in its own
        colour so it doesn't get read as an ordinary street.
      */}
      <Source id="entrance-road" type="geojson" data={city.entranceRoad}>
        <Layer
          id="entrance-road-line"
          type="line"
          layout={{ 'line-cap': 'round' }}
          paint={{
            'line-color': palette.entranceRoad,
            'line-width': 3,
            'line-dasharray': [1, 1.5],
            'line-opacity': 0.85,
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
            'text-size': labelRamp(labelScale, [
              [13, 13],
              [17, 17],
            ]),
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
 *
 * The zoom ramp alone drew every street — a 50 ft K, a 30 ft J, a 40 ft
 * radial avenue, a 20 ft radial path — at the same physical width, even
 * though `city.ts` already carries each feature's own surveyed `width`
 * (#51). Multiplying the ramp by that feature's width relative to
 * `baseRoadWidth` (the layout's own typical/fallback width) keeps the
 * zoom-driven screen scaling and adds the surveyed proportion on top, so a
 * 50 ft street still renders visibly wider than a 30 ft one at every zoom
 * rather than the difference collapsing to one line width.
 */
// Exported for a focused unit test proving a feature's surveyed `width`
// actually reaches the compiled expression (#51), rather than exercising it
// through a full MapLibre render.
export function roadWidth(multiplier: number, baseRoadWidth: number) {
  const ramp = [
    'interpolate',
    ['exponential', 2],
    ['zoom'],
    12,
    0.7 * multiplier,
    16,
    3 * multiplier,
    19,
    22 * multiplier,
  ]
  // Coalesce guards a feature that somehow carries no width (city.ts always
  // sets one, but an expression evaluated by MapLibre itself has no type
  // system to lean on) — falling back to the baseline gives a 1:1 ratio,
  // the same width the ramp alone used to draw everything at.
  const ratio = ['/', ['coalesce', ['get', 'width'], baseRoadWidth], baseRoadWidth]
  return ['*', ramp, ratio] as unknown as number
}
