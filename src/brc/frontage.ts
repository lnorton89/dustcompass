import type { CityLayout } from './layout'
import { polarToPosition } from './geo'
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
 * What is deliberately not invented is position *along* the street. Mid-block
 * camps only say they are mid-block, not which way from the corner, so they
 * keep the clock position their address gives them.
 */

/** How far past the street centreline the camp's own block begins. */
const SETBACK_FEET = 20

export type Facing = 'man' | 'mountain' | undefined

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

  const facing = parseFacing(exactLocation)
  // Only an address that resolves to an annular street has an inside and an
  // outside. Open playa and portals do not — and a plaza address already
  // carries a position on the plaza rim, which is more specific than anything
  // a street offset could say, so it is left alone even though it names a
  // street too.
  if (!facing || hit.plaza || !hit.street || hit.distanceFeet === undefined) {
    return hit.position
  }

  const street = layout.cStreets.find((s) => s.ref === hit.street)
  if (!street) return hit.position

  const halfRoad = (street.width ?? layout.road_width) / 2
  const offset = halfRoad + SETBACK_FEET
  return polarToPosition(layout, hit.clock, hit.distanceFeet + (facing === 'man' ? offset : -offset))
}
