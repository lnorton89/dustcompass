import { describe, expect, it } from 'vitest'
import type { CityLayout } from '../layout'
import { buildCity } from '../city'
import { destination, distanceBetween, feetToMeters, metersToFeet, type Position } from '../geo'

/**
 * A minimal synthetic layout — not the real survey — just enough shape to
 * exercise buildCity() without depending on a fetched year's data.
 */
function baseLayout(): CityLayout {
  return {
    center: {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [-119.2, 40.78] },
    },
    bearing: 45,
    fence_distance: 10000,
    road_width: 40,
    cStreets: [
      { ref: 'esplanade', name: 'Esplanade', distance: 2500, segments: [['2:00', '10:00']] },
    ],
    tStreets: [],
    plazas: [],
    portals: [],
  }
}

describe('dmz', () => {
  it('renders a band of features at roughly the right radius when the survey supplies one', () => {
    const layout: CityLayout = {
      ...baseLayout(),
      dmz: { distance: 2400, depth: 100, segments: [['2:00', '4:00'], ['8:00', '10:00']] },
    }
    const city = buildCity(layout)
    expect(city.dmz.features).toHaveLength(2)

    const center = layout.center.geometry.coordinates as Position
    for (const feature of city.dmz.features) {
      expect(feature.geometry.type).toBe('Polygon')
      const ring = feature.geometry.coordinates[0]
      // Every vertex of the band should sit between the inner and outer radii.
      for (const point of ring) {
        const feet = metersToFeet(distanceBetween(center, point as Position))
        expect(feet).toBeGreaterThanOrEqual(2400 - 1)
        expect(feet).toBeLessThanOrEqual(2500 + 1)
      }
      // And it should actually span the band, not collapse to the inner edge.
      const farthest = Math.max(
        ...ring.map((point) => metersToFeet(distanceBetween(center, point as Position))),
      )
      expect(farthest).toBeGreaterThan(2490)
    }
  })

  it('produces no features when the survey has no DMZ', () => {
    const city = buildCity(baseLayout())
    expect(city.dmz.features).toEqual([])
  })
})

describe('entranceRoad', () => {
  it('renders a line at the surveyed compass bearing when the survey supplies one', () => {
    const layout: CityLayout = {
      ...baseLayout(),
      entrance_road: { distance: 9000, angle: 315 },
    }
    const city = buildCity(layout)
    expect(city.entranceRoad.features).toHaveLength(1)

    const [feature] = city.entranceRoad.features
    expect(feature.geometry.type).toBe('LineString')
    const [from, to] = feature.geometry.coordinates as Position[]
    const center = layout.center.geometry.coordinates as Position

    // Both ends should sit close to the marked distance, straddling it.
    const feetFrom = metersToFeet(distanceBetween(center, from))
    const feetTo = metersToFeet(distanceBetween(center, to))
    expect(Math.min(feetFrom, feetTo)).toBeLessThan(9000)
    expect(Math.max(feetFrom, feetTo)).toBeGreaterThan(9000)

    // And it should sit on the given compass bearing, not on a clock position
    // rotated by layout.bearing — a point straight out along 315 should match.
    const expected = destination(center, feetToMeters(9000), 315)
    expect(distanceBetween(to, expected)).toBeLessThan(feetToMeters(310))
  })

  it('produces no features when the survey has no entrance road', () => {
    const city = buildCity(baseLayout())
    expect(city.entranceRoad.features).toEqual([])
  })
})
