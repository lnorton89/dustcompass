import type { CityLayout, Feet } from './layout'

export const FEET_PER_METER = 3.280839895013123
export const feetToMeters = (ft: Feet) => ft / FEET_PER_METER
export const metersToFeet = (m: number) => m * FEET_PER_METER

/** [lon, lat] — GeoJSON order, which is also MapLibre's order. */
export type Position = [number, number]

const R = 6371008.8 // IUGG mean earth radius, metres
const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

/** Great-circle destination from `origin`, `meters` away along `bearing`. */
export function destination(origin: Position, meters: number, bearing: number): Position {
  const d = meters / R
  const b = rad(bearing)
  const [lon, lat] = [rad(origin[0]), rad(origin[1])]
  const lat2 = Math.asin(Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(b))
  const lon2 =
    lon +
    Math.atan2(
      Math.sin(b) * Math.sin(d) * Math.cos(lat),
      Math.cos(d) - Math.sin(lat) * Math.sin(lat2),
    )
  return [deg(lon2), deg(lat2)]
}

export function bearingBetween(from: Position, to: Position): number {
  const [p1, p2] = [rad(from[1]), rad(to[1])]
  const dl = rad(to[0] - from[0])
  const y = Math.sin(dl) * Math.cos(p2)
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)
  return (deg(Math.atan2(y, x)) + 360) % 360
}

export function distanceBetween(from: Position, to: Position): number {
  const [p1, p2] = [rad(from[1]), rad(to[1])]
  const dp = rad(to[1] - from[1])
  const dl = rad(to[0] - from[0])
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
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
  const t = ((minutes % 720) + 720) % 720
  const hour = Math.floor(t / 60) || 12
  return `${hour}:${String(Math.round(t % 60)).padStart(2, '0')}`
}

/**
 * Compass bearing of a clock position. The city is rotated so that the 12:00
 * radial points along `layout.bearing` (45° in recent years), and the clock
 * runs clockwise from there over a full 12-hour turn.
 *
 * Verified against iBurn's own geocoded camp GPS to sub-metre agreement.
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
