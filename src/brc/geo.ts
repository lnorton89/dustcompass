import type { CityLayout, Feet } from './layout'

export const FEET_PER_METER = 3.280839895013123
export const feetToMeters = (ft: Feet) => ft / FEET_PER_METER
export const metersToFeet = (m: number) => m * FEET_PER_METER

/** [lon, lat] — GeoJSON order, which is also MapLibre's order. */
export type Position = [number, number]

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

// WGS84, the datum the survey and every GPS receiver already report in.
//
// A sphere is the usual shortcut here and it is not good enough for this map.
// At Black Rock City's latitude a mean-radius sphere misplaces a point 1.5 km
// out by up to 3.7 m, and the error changes sign either side of the 6:00 axis,
// so it cannot be calibrated away. Checked against Burning Man's own surveyed
// plaza markers, the sphere put them 12 ft off their design radius; the local
// ellipsoidal radii below put them within one.
const A = 6378137
const F = 1 / 298.257223563
const E2 = F * (2 - F)

/**
 * Metres per radian at a latitude, north and east. The city spans ten
 * kilometres, so a plane using these is exact far beyond the survey's own
 * precision — and cheaper than a geodesic the map would recompute constantly.
 */
function localScale(latitude: number): { north: number; east: number } {
  const sin = Math.sin(rad(latitude))
  const w = Math.sqrt(1 - E2 * sin * sin)
  return { north: (A * (1 - E2)) / (w * w * w), east: (A / w) * Math.cos(rad(latitude)) }
}

/** Destination from `origin`, `meters` away along `bearing`. */
export function destination(origin: Position, meters: number, bearing: number): Position {
  const north = meters * Math.cos(rad(bearing))
  const east = meters * Math.sin(rad(bearing))
  // Evaluate the scale at the midpoint latitude: the northing shifts the
  // latitude, which shifts the scale that northing should have been measured at.
  const first = localScale(origin[1])
  const midpoint = origin[1] + deg(north / first.north) / 2
  const scale = localScale(midpoint)
  return [origin[0] + deg(east / scale.east), origin[1] + deg(north / scale.north)]
}

export function bearingBetween(from: Position, to: Position): number {
  const [p1, p2] = [rad(from[1]), rad(to[1])]
  const dl = rad(to[0] - from[0])
  const y = Math.sin(dl) * Math.cos(p2)
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)
  return (deg(Math.atan2(y, x)) + 360) % 360
}

export function distanceBetween(from: Position, to: Position): number {
  const scale = localScale((from[1] + to[1]) / 2)
  return Math.hypot(rad(to[0] - from[0]) * scale.east, rad(to[1] - from[1]) * scale.north)
}

/* ---------------------------------------------------------------- clock ---- */

/** Minutes past 12:00, going clockwise. "3:00" -> 180, "12:00" -> 0. */
export function clockToMinutes(clock: string): number {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(clock.trim())
  if (!m) throw new Error(`Not a clock position: "${clock}"`)
  const hour = Number(m[1]) % 12
  const minute = Number(m[2])
  if (minute > 59) throw new Error(`Not a clock position: "${clock}"`)
  return hour * 60 + minute
}

export function minutesToClock(minutes: number): string {
  // Round once, before splitting. Flooring the hour on the unrounded value and
  // rounding the minute separately emitted "11:60" — an invalid clock, and
  // wrong in both digits — for anything from x:59.5 up. That is 0.8% of
  // bearings, including the ones either side of 12:00.
  const t = ((Math.round(minutes) % 720) + 720) % 720
  const hour = Math.floor(t / 60) || 12
  return `${hour}:${String(t % 60).padStart(2, '0')}`
}

/**
 * Compass bearing of a clock position. The city is rotated so that the 12:00
 * radial points along `layout.bearing` (45° in recent years), and the clock
 * runs clockwise from there over a full 12-hour turn.
 *
 * Verified against Burning Man's own surveyed control points: every surveyed
 * plaza lands within a foot of the street this puts it on.
 */
export function clockToBearing(layout: CityLayout, clock: string | number): number {
  const minutes = typeof clock === 'number' ? clock : clockToMinutes(clock)
  return (layout.bearing + (minutes / 720) * 360) % 360
}

export function bearingToClock(layout: CityLayout, bearing: number): string {
  const rel = (((bearing - layout.bearing) % 360) + 360) % 360
  return minutesToClock((rel / 360) * 720)
}

/** Point at a clock position and a radius in feet from the Man. */
export function polarToPosition(
  layout: CityLayout,
  clock: string | number,
  radiusFeet: Feet,
): Position {
  const center = layout.center.geometry.coordinates as Position
  return destination(center, feetToMeters(radiusFeet), clockToBearing(layout, clock))
}

/** Inverse of {@link polarToPosition}. */
export function positionToPolar(
  layout: CityLayout,
  position: Position,
): { clock: string; minutes: number; distanceFeet: Feet } {
  const center = layout.center.geometry.coordinates as Position
  const bearing = bearingBetween(center, position)
  const rel = (((bearing - layout.bearing) % 360) + 360) % 360
  const minutes = (rel / 360) * 720
  return {
    clock: minutesToClock(minutes),
    minutes,
    distanceFeet: metersToFeet(distanceBetween(center, position)),
  }
}

/** Arc of positions along an annular street, for drawing. */
export function arc(
  layout: CityLayout,
  radiusFeet: Feet,
  fromClock: string,
  toClock: string,
  stepMinutes = 2,
): Position[] {
  const start = clockToMinutes(fromClock)
  let end = clockToMinutes(toClock)
  if (end <= start) end += 720
  const out: Position[] = []
  for (let t = start; t < end; t += stepMinutes) out.push(polarToPosition(layout, t, radiusFeet))
  out.push(polarToPosition(layout, end, radiusFeet))
  return out
}

/**
 * How far from the Man a GPS fix can be and still be worth navigating from.
 *
 * The trash fence is about 2.5km out and Gerlach is 20 minutes up the road, so
 * this is generous on purpose — someone on the approach is still arriving. What
 * it excludes is the person who opens the app at home in another state, whose
 * fix is real and hundreds of miles away.
 */
export const NAVIGABLE_RADIUS_METERS = 20_000

/**
 * Whether a fix is close enough to route from.
 *
 * Without this the app took the fix at face value and drew a line off the edge
 * of the map, quoting a walk of 157 hours. The honest answer that far out is
 * not a bearing, it is that you are not there yet — so the distance falls back
 * to being measured from the Man, which is what the readout says it is doing.
 */
export function isNearCity(
  layout: CityLayout,
  position: Position,
  limitMeters = NAVIGABLE_RADIUS_METERS,
): boolean {
  return distanceBetween(layout.center.geometry.coordinates as Position, position) <= limitMeters
}
