import { describe, expect, it } from 'vitest'
import type { PlayaRoute } from '../../brc/routing'
import type { CityLayout } from '../../brc/layout'
import { ROUTE_CARD_HEIGHT, ROUTE_CARD_WIDTH, routeCardCityGeometry, routeCardLayout } from '../routeCard'

const route: PlayaRoute = {
  kind: 'street',
  meters: 500,
  coordinates: [
    [-119.205, 40.775],
    [-119.2, 40.78],
    [-119.19, 40.785],
  ],
}

describe('route card layout', () => {
  it('uses a broadly shareable 1200x630 social-card frame', () => {
    const layout = routeCardLayout(route)
    expect(layout.width).toBe(ROUTE_CARD_WIDTH)
    expect(layout.height).toBe(ROUTE_CARD_HEIGHT)
    expect(layout.width).toBe(1200)
    expect(layout.height).toBe(630)
  })

  it('keeps every route point inside the dedicated map region with visible padding', () => {
    const layout = routeCardLayout(route)
    for (const point of layout.routePoints) {
      expect(point.x).toBeGreaterThan(layout.map.x)
      expect(point.x).toBeLessThan(layout.map.x + layout.map.width)
      expect(point.y).toBeGreaterThan(layout.map.y)
      expect(point.y).toBeLessThan(layout.map.y + layout.map.height)
    }
  })

  it('preserves distinct start and destination points for the A/B markers', () => {
    const layout = routeCardLayout(route)
    expect(layout.routePoints).toHaveLength(route.coordinates.length)
    expect(layout.routePoints[0]).not.toEqual(layout.routePoints.at(-1))
  })

  it('frames a two-point direct-bearing fallback without inventing intermediate geometry', () => {
    const direct: PlayaRoute = {
      kind: 'direct',
      meters: 300,
      coordinates: [
        [-119.2, 40.78],
        [-119.197, 40.782],
      ],
    }
    const layout = routeCardLayout(direct)
    expect(layout.routePoints).toHaveLength(2)
    expect(layout.routePoints[0]).not.toEqual(layout.routePoints[1])
  })


  it('projects actual surveyed annular/radial geometry and the Man into the route crop (#135)', () => {
    const city: CityLayout = {
      center: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [-119.2, 40.78] } },
      bearing: 45, fence_distance: 6000, road_width: 40,
      cStreets: [{ ref: 'esplanade', name: 'Esplanade', distance: 2500, segments: [['2:00', '10:00']] }],
      tStreets: [{ refs: ['6:00'], segments: [[0, 'esplanade']] }],
      plazas: [], portals: [],
    }
    const geometry = routeCardCityGeometry(city, route)
    expect(geometry.annulars).toHaveLength(1)
    expect(geometry.annulars[0].name).toBe('Esplanade')
    expect(geometry.annulars[0].points.length).toBeGreaterThan(2)
    expect(geometry.radials).toHaveLength(1)
    expect(geometry.radials[0].ref).toBe('6:00')
    expect(geometry.radials[0].points).toHaveLength(2)
    expect(Number.isFinite(geometry.man.x)).toBe(true)
    expect(Number.isFinite(geometry.man.y)).toBe(true)
    expect(geometry.annulars[0].points).not.toEqual(geometry.radials[0].points)
  })

  it('keeps map and text summary in separate non-overlapping regions', () => {
    const layout = routeCardLayout(route)
    expect(layout.map.x + layout.map.width).toBeLessThan(layout.summary.x)
    expect(layout.summary.x + layout.summary.width).toBeLessThanOrEqual(layout.width)
    expect(layout.summary.y + layout.summary.height).toBeLessThanOrEqual(layout.height)
  })
})
