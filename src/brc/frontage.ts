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
 * The listings say which side of the street each camp is on. "Facing man" is
 * the frontage on the Man side of that street, "facing mountain" the far side,
 * and they are genuinely different places — opposite sides of a forty-foot
 * road, in different blocks. Using that is not a guess; ignoring it was.
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
  // outside. Open playa, plazas and portals do not.
  if (!facing || !hit.street || hit.distanceFeet === undefined) return hit.position

  const street = layout.cStreets.find((s) => s.ref === hit.street)
  if (!street) return hit.position

  const halfRoad = (street.width ?? layout.road_width) / 2
  const offset = halfRoad + SETBACK_FEET
  return polarToPosition(layout, hit.clock, hit.distanceFeet + (facing === 'man' ? -offset : offset))
}
