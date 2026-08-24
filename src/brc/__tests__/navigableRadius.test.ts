import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { isNearCity, destination, NAVIGABLE_RADIUS_METERS } from '../geo'
import type { CityLayout } from '../layout'
import { DATA_YEAR } from '../../config'

const layout = JSON.parse(
  readFileSync(`public/data/${DATA_YEAR}/layout.json`, 'utf8'),
) as CityLayout
const man = layout.center.geometry.coordinates as [number, number]

/**
 * A real GPS fix from far away used to be taken at face value: the app drew a
 * route line off the edge of the map and offered a walk measured in days.
 */
describe('navigable radius', () => {
  it('accepts a fix at the Man', () => {
    expect(isNearCity(layout, man)).toBe(true)
  })

  it('accepts the whole city and the road in', () => {
    // The trash fence is roughly 2.5km out; Gerlach is about 20km up the road.
    for (const km of [2.5, 5, 15]) {
      expect(isNearCity(layout, destination(man, km * 1000, 0))).toBe(true)
    }
  })

  it('rejects a fix from another state', () => {
    // 404 miles, the number from the bug report.
    expect(isNearCity(layout, destination(man, 404 * 1609.34, 220))).toBe(false)
  })

  it('cuts over at the stated radius, in every direction', () => {
    for (let bearing = 0; bearing < 360; bearing += 45) {
      expect(isNearCity(layout, destination(man, NAVIGABLE_RADIUS_METERS - 500, bearing))).toBe(true)
      expect(isNearCity(layout, destination(man, NAVIGABLE_RADIUS_METERS + 500, bearing))).toBe(false)
    }
  })
})
