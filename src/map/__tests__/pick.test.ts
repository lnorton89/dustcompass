import { describe, expect, it } from 'vitest'
import type { MapGeoJSONFeature } from 'maplibre-gl'
import { nearestFeature } from '../pick'

/**
 * A tap is roughly a finger wide, so the map is asked about a box and answers
 * with everything in it. Which of those the person meant is this function's
 * whole job — get it wrong and the drawer opens on the camp next door.
 */
const at = (x: number, y: number, uid?: string) =>
  ({
    properties: uid ? { uid } : {},
    geometry: { type: 'Point', coordinates: [x, y] },
  }) as unknown as MapGeoJSONFeature

/** The test's fixtures are already in screen space, so projection is identity. */
const project = ([x, y]: [number, number]) => ({ x, y })

describe('choosing what a tap meant', () => {
  it('takes the closest anchor, not the first answer', () => {
    const far = at(40, 0, 'far')
    const near = at(3, 4, 'near')
    expect(nearestFeature([far, near], { x: 0, y: 0 }, project)?.properties.uid).toBe('near')
  })

  it('ignores anything it could not open afterwards', () => {
    const unnamed = at(0, 0)
    const line = {
      properties: { uid: 'street' },
      geometry: { type: 'LineString', coordinates: [] },
    } as unknown as MapGeoJSONFeature
    const listed = at(30, 30, 'listed')
    expect(nearestFeature([unnamed, line, listed], { x: 0, y: 0 }, project)?.properties.uid).toBe(
      'listed',
    )
  })

  it('says so when the tap landed on bare playa', () => {
    expect(nearestFeature([], { x: 0, y: 0 }, project)).toBeUndefined()
    expect(nearestFeature([at(0, 0)], { x: 0, y: 0 }, project)).toBeUndefined()
  })
})
