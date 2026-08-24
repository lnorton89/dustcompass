import type { CityLayout, Feet, RadiusRef } from './layout'
import { resolveRadius } from './layout'
import { arc, clockToMinutes, destination, feetToMeters, polarToPosition, type Position } from './geo'

/**
 * The Man and the portals are generated here rather than fetched, so they need
 * an id minted the same way the survey's places do — see `SERVICE_UID`.
 */
export const LANDMARK_UID = 'landmark:'

export interface CityGeometry {
  streets: GeoJSON.FeatureCollection<GeoJSON.LineString>
  plazas: GeoJSON.FeatureCollection<GeoJSON.Polygon>
  fence: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.LineString>
  landmarks: GeoJSON.FeatureCollection<GeoJSON.Point>
  /** The no-camping buffer band just inside the fence. Only some years' surveys draw one. */
  dmz: GeoJSON.FeatureCollection<GeoJSON.Polygon>
  /** Where the gate road crosses into the city. Only some years' surveys draw one. */
  entranceRoad: GeoJSON.FeatureCollection<GeoJSON.LineString>
}

/**
 * Build the whole city from its layout spec. Burning Man publishes the survey
 * as polylines; generating the city from the polar spec behind them means a new
 * year only needs a new layout.json — no tile build, no CLI, no release.
 */
export function buildCity(layout: CityLayout): CityGeometry {
  return {
    streets: fc([...annularStreets(layout), ...radialStreets(layout)]),
    plazas: fc(plazas(layout)),
    fence: fc([fence(layout)]),
    landmarks: fc(landmarks(layout)),
    dmz: fc(dmz(layout)),
    entranceRoad: fc(entranceRoad(layout)),
  }
}

function annularStreets(layout: CityLayout): GeoJSON.Feature<GeoJSON.LineString>[] {
  return layout.cStreets.flatMap((street) =>
    street.segments.map((segment, i) =>
      line(arc(layout, street.distance, segment[0], segment[1]), {
        kind: 'street',
        orientation: 'annular',
        ref: street.ref,
        name: street.name,
        width: street.width ?? layout.road_width,
        id: `${street.ref}-${i}`,
      }),
    ),
  )
}

function radialStreets(layout: CityLayout): GeoJSON.Feature<GeoJSON.LineString>[] {
  const out: GeoJSON.Feature<GeoJSON.LineString>[] = []
  for (const radial of layout.tStreets) {
    for (const clock of radial.refs) {
      radial.segments.forEach((segment, i) => {
        const from = radius(layout, segment[0])
        const to = radius(layout, segment[1])
        out.push(
          line([polarToPosition(layout, clock, from), polarToPosition(layout, clock, to)], {
            kind: 'street',
            orientation: 'radial',
            ref: clock,
            name: clock,
            width: radial.width ?? layout.road_width,
            id: `${clock}-${i}`,
          }),
        )
      })
    }
  }
  return out
}

function plazas(layout: CityLayout): GeoJSON.Feature<GeoJSON.Polygon>[] {
  const features = layout.plazas.map((plaza) =>
    circle(
      polarToPosition(layout, plaza.time, resolveRadius(layout, plaza.distance)),
      feetToMeters(plaza.diameter / 2),
      { kind: 'plaza', name: plaza.name },
    ),
  )
  const cc = layout.center_camp
  if (cc) {
    const center = polarToPosition(layout, '6:00', cc.distance)
    features.push(circle(center, feetToMeters(cc.cafe_plaza_radius), { kind: 'plaza', name: 'Center Camp' }))
    // Only some years' surveys draw an inner cafe ring; do not invent one.
    if (cc.cafe_radius !== undefined) {
      features.push(circle(center, feetToMeters(cc.cafe_radius), { kind: 'plaza', name: 'Center Camp Cafe' }))
    }
  }
  return features
}

/** The trash fence: a pentagon inscribed at `fence_distance` from the Man. */
function fence(layout: CityLayout): GeoJSON.Feature<GeoJSON.Polygon> {
  const corners: Position[] = []
  for (let i = 0; i < 5; i++) {
    corners.push(polarToPosition(layout, (i * 720) / 5, layout.fence_distance))
  }
  corners.push(corners[0])
  return {
    type: 'Feature',
    properties: { kind: 'fence', name: 'Trash Fence' },
    geometry: { type: 'Polygon', coordinates: [corners] },
  }
}

/**
 * The DMZ: a no-camping buffer band running from `distance` out to
 * `distance + depth`, over the same clock-arc spans an annular street uses.
 * Only some years' surveys draw one — do not invent one when absent.
 */
function dmz(layout: CityLayout): GeoJSON.Feature<GeoJSON.Polygon>[] {
  const spec = layout.dmz
  if (!spec) return []
  const outer = spec.distance + spec.depth
  return spec.segments.map((segment, i) => {
    // Walk the inner edge forward, then the outer edge backward, so the ring
    // closes without crossing itself instead of jumping straight across the band.
    const inner = arc(layout, spec.distance, segment[0], segment[1])
    const outerEdge = arc(layout, outer, segment[0], segment[1]).reverse()
    const ring = [...inner, ...outerEdge, inner[0]]
    return {
      type: 'Feature',
      properties: { kind: 'dmz', name: 'DMZ', id: `dmz-${i}` },
      geometry: { type: 'Polygon', coordinates: [ring] },
    }
  })
}

/** How far either side of the gate road's marked point to draw its line. */
const ENTRANCE_ROAD_HALF_LENGTH: Feet = 300

/**
 * The gate road's crossing point: the survey gives it as a compass bearing
 * and radius from the Man, not a clock position, so it's placed with
 * `destination()` directly rather than `polarToPosition()`'s clock lookup.
 * Only some years' surveys draw one — do not invent one when absent.
 */
function entranceRoad(layout: CityLayout): GeoJSON.Feature<GeoJSON.LineString>[] {
  const spec = layout.entrance_road
  if (!spec) return []
  const center = layout.center.geometry.coordinates as Position
  const from = destination(
    center,
    feetToMeters(spec.distance - ENTRANCE_ROAD_HALF_LENGTH),
    spec.angle,
  )
  const to = destination(
    center,
    feetToMeters(spec.distance + ENTRANCE_ROAD_HALF_LENGTH),
    spec.angle,
  )
  return [line([from, to], { kind: 'entrance-road', name: 'Entrance Road' })]
}

function landmarks(layout: CityLayout): GeoJSON.Feature<GeoJSON.Point>[] {
  const out: GeoJSON.Feature<GeoJSON.Point>[] = [
    {
      type: 'Feature',
      properties: { kind: 'landmark', uid: `${LANDMARK_UID}man`, name: 'The Man', ref: 'man' },
      geometry: { type: 'Point', coordinates: layout.center.geometry.coordinates },
    },
  ]
  for (const portal of layout.portals) {
    out.push({
      type: 'Feature',
      properties: {
        kind: 'portal',
        uid: `${LANDMARK_UID}${portal.ref}`,
        name: portal.name,
        ref: portal.ref,
      },
      geometry: {
        type: 'Point',
        coordinates: polarToPosition(layout, portal.time, resolveRadius(layout, portal.distance)),
      },
    })
  }
  return out
}

/* ------------------------------------------------------------- helpers ---- */

function radius(layout: CityLayout, r: RadiusRef): Feet {
  return typeof r === 'number' ? r : resolveRadius(layout, r)
}

function circle(
  center: Position,
  radiusMeters: number,
  properties: GeoJSON.GeoJsonProperties,
  steps = 48,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const ring: Position[] = []
  for (let i = 0; i <= steps; i++) {
    const bearing = (i / steps) * 360
    const rad = (bearing * Math.PI) / 180
    const dLat = (radiusMeters * Math.cos(rad)) / 111320
    const dLon = (radiusMeters * Math.sin(rad)) / (111320 * Math.cos((center[1] * Math.PI) / 180))
    ring.push([center[0] + dLon, center[1] + dLat])
  }
  return { type: 'Feature', properties, geometry: { type: 'Polygon', coordinates: [ring] } }
}

function line(
  coordinates: Position[],
  properties: GeoJSON.GeoJsonProperties,
): GeoJSON.Feature<GeoJSON.LineString> {
  return { type: 'Feature', properties, geometry: { type: 'LineString', coordinates } }
}

function fc<T extends GeoJSON.Geometry>(
  features: GeoJSON.Feature<T>[],
): GeoJSON.FeatureCollection<T> {
  return { type: 'FeatureCollection', features }
}

export { clockToMinutes }

/**
 * Bounding box of the built city — the streets, not the trash fence. The fence
 * sits roughly half again as far out as the outermost street, so framing it
 * wastes most of a phone screen on empty playa.
 */
export function cityBounds(geometry: CityGeometry): [number, number, number, number] {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity

  for (const street of geometry.streets.features) {
    for (const [lon, lat] of street.geometry.coordinates) {
      west = Math.min(west, lon)
      east = Math.max(east, lon)
      south = Math.min(south, lat)
      north = Math.max(north, lat)
    }
  }
  return [west, south, east, north]
}
