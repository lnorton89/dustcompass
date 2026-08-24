import type { CityLayout } from './layout'
import { clockToMinutes, polarToPosition } from './geo'
import type { Position } from './geo'
import { geocode } from './geocode'

/**
 * A playa address names an intersection, not a plot, so 87% of placed camps
 * share one with somebody — up to fourteen of them on a single corner. Left at
 * the intersection they stack into one pin: the map looks half empty, the
 * labels fight, and tapping the pile selects whichever camp the renderer
 * happened to return.
 *
 * The listings say which side of the street each camp is on, and the wording
 * describes which way the camp *looks*, not where it sits. A camp "facing man"
 * has its frontage toward the Man, so it stands on the far side of its street
 * looking inward across the road. The published data settles it: 57 of the 63
 * Esplanade camps face the Man, and nothing camps between Esplanade and the Man
 * — that is open playa. Read the other way round, this put all 57 of them in
 * the empty ground inside Esplanade.
 *
 * The same listings also name a clock, and that clock is not a street: at
 * "8:00 & B" a camp reads "Corner - facing man & 6:00", and 6:00 is roughly
 * perpendicular to the 8:00 radial it fronts. It says which side of that radial
 * the camp stands on, and it is the only thing that does. Without it every camp
 * fronting a radial sat on the centreline of the road: all 377 of them landed
 * outside every surveyed city block, which is to say in the street.
 *
 * What is deliberately not invented is position *along* the street. Mid-block
 * camps only say they are mid-block, not which way from the corner, so they
 * keep the clock position their address gives them, give or take the half-road
 * that takes them out of it. That leaves 56 camps — mid-block on a radial, with
 * no man or mountain to say which way — still standing on the annular street
 * their address names. Half a road either way would put 51 of them inside a
 * block, but the survey cannot say which way: a road has blocks on both sides,
 * so it scores the two directions identically. A guess that reads as certainty
 * would put them a whole block out, which is a great deal worse than the
 * approximate pin the app already tells the reader it is showing.
 */

/** How far past the street centreline the camp's own block begins. */
const SETBACK_FEET = 20

export type Facing = 'man' | 'mountain' | undefined

/**
 * The clock a listing's frontage looks toward, in minutes, when it names one.
 *
 * Every form the API uses puts it last — "Mid-block facing 6:00", "Corner -
 * facing man & 10:00" — so the last clock in the string is the one meant. A
 * camp whose facing clock is its own street learns nothing from it and is left
 * where its address puts it.
 */
export function parseClockFacing(exactLocation: string | undefined): number | undefined {
  if (!exactLocation) return undefined
  const found = exactLocation.match(/\d{1,2}[:.]\d{2}/g)
  return found ? clockToMinutes(found[found.length - 1]) : undefined
}

export function parseFacing(exactLocation: string | undefined): Facing {
  if (!exactLocation) return undefined
  const text = exactLocation.toLowerCase()
  if (text.includes('facing man')) return 'man'
  if (text.includes('facing mountain')) return 'mountain'
  return undefined
}

/**
 * The position of a camp's frontage, given its address and which way it faces.
 * Falls back to the plain address when the listing does not say.
 */
export function frontagePosition(
  layout: CityLayout,
  address: string,
  exactLocation: string | undefined,
): Position | undefined {
  const hit = geocode(address, layout)
  if (!hit) return undefined

  // Only an address that resolves to a street has sides to be on. Open playa
  // and portals do not — and a plaza address already carries a position on the
  // plaza rim, which is more specific than anything a street offset could say,
  // so it is left alone even though it names a street too.
  if (hit.plaza || !hit.street || hit.distanceFeet === undefined) return hit.position

  let radiusFeet = hit.distanceFeet
  const facing = parseFacing(exactLocation)
  if (facing) {
    const street = layout.cStreets.find((s) => s.ref === hit.street)
    if (street) {
      const offset = (street.width ?? layout.road_width) / 2 + SETBACK_FEET
      radiusFeet += facing === 'man' ? offset : -offset
    }
  }

  let minutes = clockToMinutes(hit.clock)
  const facingClock = parseClockFacing(exactLocation)
  if (facingClock !== undefined && radiusFeet > 0) {
    // Whichever way round the dial is shorter. The frontage looks that way, so
    // the camp itself stands on the other side of the road from it.
    let delta = facingClock - minutes
    if (delta > 360) delta -= 720
    if (delta < -360) delta += 720
    if (delta !== 0) {
      const offset = layout.road_width / 2 + SETBACK_FEET
      // Arc length to minutes: a full turn is 720 minutes of clock.
      const step = ((offset / radiusFeet) * 720) / (2 * Math.PI)
      minutes += delta < 0 ? step : -step
    }
  }

  return polarToPosition(layout, minutes, radiusFeet)
}
