import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { toPois } from '../../data/usePlayaData'
import { DATA_YEAR } from '../../config'
import type { CityLayout } from '../layout'
import type { CampItem } from '../../data/types'

const dir = `public/data/${DATA_YEAR}`
const read = (name: string) => JSON.parse(readFileSync(`${dir}/${name}`, 'utf8'))
const have = ['layout.json', 'camp.json', 'city_blocks.geojson'].every((n) =>
  existsSync(`${dir}/${n}`),
)

/**
 * Ray casting in lon/lat. A city block is a couple of hundred feet across, so
 * treating it as flat costs nothing that could change which side of an edge a
 * point falls on.
 */
function inside(point: [number, number], ring: number[][]): boolean {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) {
      hit = !hit
    }
  }
  return hit
}

/**
 * The survey publishes the city's blocks, and a camp belongs in one — not in
 * the road between them. That makes this the one check on the frontage rules
 * that is not the app marking its own homework: the polygons come from Burning
 * Man, and nothing in `frontage.ts` has ever seen them.
 *
 * It caught the real thing. Every camp fronting a radial street — 377 of them —
 * was landing on that road's centreline, because only the man/mountain wording
 * was being read and those camps are placed by the clock they face instead.
 * Reading it took the city from 604 camps in a block to 913.
 *
 * The floor is deliberately well under that. Blocks move each year and the
 * listings are edited all week; this is here to catch a rule that has stopped
 * working, not to pin a number.
 */
describe.skipIf(!have)('camps land in the city, not in the road', () => {
  it('places most camps inside a surveyed block', () => {
    const layout = read('layout.json') as CityLayout
    const blocks = (
      read('city_blocks.geojson') as { features: { geometry: { coordinates: number[][][] } }[] }
    ).features.map((feature) => feature.geometry.coordinates[0])
    const { pois } = toPois(layout, [], read('camp.json') as CampItem[], {
      campsReleased: true,
      artReleased: true,
    } as never)

    expect(pois.length).toBeGreaterThan(100)
    const placed = pois.filter((poi) => blocks.some((ring) => inside(poi.position, ring)))
    const share = placed.length / pois.length
    // Named in the failure message, because "0.61 is not greater than 0.7" is
    // not a thing anyone can act on.
    expect({ inBlock: placed.length, of: pois.length, ok: share > 0.7 }).toMatchObject({
      ok: true,
    })
  })
})
