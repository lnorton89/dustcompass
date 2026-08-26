import { describe, expect, it } from 'vitest'
import type { CityLayout } from '../layout'
import { destination, distanceBetween, polarToPosition } from '../geo'
import { buildStreetGraph, routeBetween } from '../routing'

const layout: CityLayout = {
  center: {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates: [-119.2, 40.78] },
  },
  bearing: 45,
  fence_distance: 10000,
  road_width: 40,
  cStreets: [
    { ref: 'a', name: 'A', distance: 1000, segments: [['2:00', '10:00']] },
    { ref: 'b', name: 'B', distance: 1300, segments: [['2:00', '10:00']] },
    { ref: 'c', name: 'C', distance: 1600, segments: [['2:00', '10:00']] },
  ],
  tStreets: [
    { refs: ['3:00', '4:00', '5:00'], segments: [['a', 'c']] },
    { refs: ['7:00', '8:00', '9:00'], segments: [['a', 'c']] },
  ],
  plazas: [],
  portals: [],
}

const sparseLayout: CityLayout = {
  ...layout,
  cStreets: [
    { ref: 'a', name: 'A', distance: 1000, segments: [['5:00', '7:00']] },
    { ref: 'b', name: 'B', distance: 2000, segments: [['5:00', '7:00']] },
    { ref: 'c', name: 'C', distance: 3000, segments: [['5:00', '7:00']] },
  ],
  tStreets: [
    { refs: ['5:00', '7:00'], segments: [['a', 'c']] },
  ],
}

describe('offline surveyed street routing', () => {
  it('builds edges only from surveyed radial/annular intersections', () => {
    const graph = buildStreetGraph(layout)
    expect(graph.size).toBe(18)
    expect(graph.get('a@3:00')?.edges.some((edge) => edge.to === 'b@3:00')).toBe(true)
    expect(graph.get('a@3:00')?.edges.some((edge) => edge.to === 'a@4:00')).toBe(true)
  })

  it('detours a dense-city diagonal along streets instead of presenting the direct chord', () => {
    const from = polarToPosition(layout, '3:00', 1000)
    const to = polarToPosition(layout, '5:00', 1600)
    const route = routeBetween(layout, from, to)

    expect(route.kind).toBe('street')
    expect(route.coordinates.length).toBeGreaterThan(2)
    expect(route.meters).toBeGreaterThan(distanceBetween(from, to))
    expect(route.coordinates[0]).toEqual(from)
    expect(route.coordinates.at(-1)).toEqual(to)
  })

  it('snaps a frontage point to the middle of a real annular edge rather than requiring an intersection', () => {
    const from = polarToPosition(sparseLayout, '6:00', 2000)
    const to = polarToPosition(sparseLayout, '5:00', 2000)
    const route = routeBetween(sparseLayout, from, to)

    expect(route.kind).toBe('street')
    expect(route.coordinates[0]).toEqual(from)
    expect(route.coordinates.at(-1)).toEqual(to)
    expect(route.coordinates.length).toBeGreaterThan(2)
  })

  it('returns zero distance for identical and sub-meter endpoints before street snapping', () => {
    const from = polarToPosition(layout, '4:00', 1300)
    const identical = routeBetween(layout, from, from)
    expect(identical.kind).toBe('direct')
    expect(identical.meters).toBe(0)
    expect(identical.coordinates).toEqual([from, from])

    const lessThanOneMeterAway = destination(from, 0.5, 90)
    const roundedSamePlace = routeBetween(layout, from, lessThanOneMeterAway)
    expect(roundedSamePlace.kind).toBe('direct')
    expect(roundedSamePlace.meters).toBe(0)
  })

  it('keeps open-playa travel as direct bearing guidance', () => {
    const from = polarToPosition(layout, '3:00', 300)
    const to = polarToPosition(layout, '6:00', 700)
    const route = routeBetween(layout, from, to)

    expect(route.kind).toBe('direct')
    expect(route.coordinates).toEqual([from, to])
    expect(route.meters).toBeCloseTo(distanceBetween(from, to), 6)
  })

  it('falls back to explicit direct guidance when a city point cannot safely snap to any surveyed street', () => {
    const from = polarToPosition(sparseLayout, '6:00', 2500)
    const to = polarToPosition(sparseLayout, '5:00', 2000)
    const route = routeBetween(sparseLayout, from, to)

    expect(route.kind).toBe('direct')
    expect(route.coordinates).toEqual([from, to])
  })
})
