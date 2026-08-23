/**
 * Black Rock City is not a place that exists year-round, so it cannot be
 * fetched from OpenStreetMap. It is re-surveyed and rebuilt annually, and the
 * whole city is described by a single declarative spec: a centre point (the
 * Man), a rotation, a set of annular "C" streets at fixed radii, and a set of
 * radial "T" streets named by clock position.
 *
 * This is the same layout format used by iBurn's BlackRockCityPlanner, so a
 * new year is a data drop, never a code change.
 */

/** All distances in the layout spec are in feet from the Man. */
export type Feet = number

/** A radius, given either literally in feet or as an annular street ref. */
export type RadiusRef = Feet | string

export interface AnnularStreet {
  /** Stable key, e.g. "esplanade", "a", "k". */
  ref: string
  /** Display name, e.g. "Esplanade", "Atwood". */
  name: string
  distance: Feet
  width?: Feet
  /** Arc spans this street actually occupies, as ["2:00", "10:00"] pairs. */
  segments: [string, string][]
}

export interface RadialStreet {
  /** Clock positions this definition applies to, e.g. ["3:00", "9:00"]. */
  refs: string[]
  segments: [RadiusRef, RadiusRef][]
}

export interface Plaza {
  name: string
  time: string
  distance: RadiusRef
  diameter: Feet
}

export interface Portal {
  name: string
  ref: string
  time: string
  distance: RadiusRef
  angle: number
}

export interface CityLayout {
  center: GeoJSON.Feature<GeoJSON.Point>
  /** Compass bearing, in degrees, of the 12:00 radial. */
  bearing: number
  fence_distance: Feet
  road_width: Feet
  entrance_road?: { distance: Feet; angle: number }
  dmz?: { distance: Feet; depth: Feet; segments: [string, string][] }
  center_camp?: {
    distance: Feet
    cafe_plaza_radius: Feet
    cafe_radius: Feet
    frontage_arc?: { distance: Feet; start_angle: number; end_angle: number }
  }
  cStreets: AnnularStreet[]
  tStreets: RadialStreet[]
  plazas: Plaza[]
  portals: Portal[]
  runway?: unknown
}

/** Resolve a radius that may be a street ref ("esplanade") or literal feet. */
export function resolveRadius(layout: CityLayout, r: RadiusRef): Feet {
  if (typeof r === 'number') return r
  const street = layout.cStreets.find((s) => s.ref === r.toLowerCase())
  if (!street) throw new Error(`Unknown annular street ref: ${r}`)
  return street.distance
}

/** Look up an annular street by ref or by display name, case-insensitively. */
export function findAnnular(layout: CityLayout, token: string): AnnularStreet | undefined {
  const t = token.trim().toLowerCase()
  return layout.cStreets.find(
    (s) => s.ref === t || s.name.toLowerCase() === t || s.name.toLowerCase().startsWith(t + ' '),
  )
}
