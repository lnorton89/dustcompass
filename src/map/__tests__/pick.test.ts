import { describe, expect, it } from 'vitest'
import type { MapGeoJSONFeature } from 'maplibre-gl'
import { nearestFeature, pickByPriority } from '../pick'

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

/** Same shape, but keyed like a saved spot (`id`) instead of a listing (`uid`). */
const savedAt = (x: number, y: number, id: string) =>
  ({
    properties: { id },
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

  it('can key off a saved spot\'s `id` instead of a listing\'s `uid`', () => {
    const saved = savedAt(0, 0, 'spot-1')
    expect(nearestFeature([saved], { x: 0, y: 0 }, project, 'id')?.properties.id).toBe('spot-1')
    // Without the matching idKey it's invisible, same as any other feature
    // that lacks the property being asked about.
    expect(nearestFeature([saved], { x: 0, y: 0 }, project)).toBeUndefined()
  })
})

/**
 * Issue #26: a saved spot's own `handleClick` special case only fired when it
 * happened to be MapLibre's `event.features[0]`, which follows paint order,
 * not intent — so a saved spot drawn under a camp/service/landmark it
 * visually overlapped was untappable. `pickByPriority` is the fix, pulled out
 * as pure logic per its own doc comment so this can be exercised with a
 * constructed fixture instead of a real MapLibre `Map` (jsdom has no WebGL).
 */
describe('arbitrating a tap across priority-ordered layers', () => {
  it('picks a saved spot over a coincident camp/POI at the same point', () => {
    const saved = savedAt(0, 0, 'spot-1')
    const poi = at(0, 0, 'camp-1')
    const picked = pickByPriority(
      [
        { id: 'saved', idKey: 'id', features: [saved] },
        { id: 'poi-label', features: [poi] },
      ],
      { x: 0, y: 0 },
      project,
    )
    expect(picked).toEqual({ groupId: 'saved', feature: saved })
  })

  it('prefers an earlier group even when a later group is anchored closer', () => {
    const saved = savedAt(5, 0, 'spot-1') // 5px from the tap
    const poi = at(1, 0, 'camp-1') // 1px from the tap, but a lower-priority group
    const picked = pickByPriority(
      [
        { id: 'saved', idKey: 'id', features: [saved] },
        { id: 'poi-label', features: [poi] },
      ],
      { x: 0, y: 0 },
      project,
    )
    expect(picked?.groupId).toBe('saved')
    expect(picked?.feature).toBe(saved)
  })

  it('falls through to the next group when the higher-priority one has nothing near the tap', () => {
    const poi = at(0, 0, 'camp-1')
    const picked = pickByPriority(
      [
        { id: 'saved', idKey: 'id', features: [] },
        { id: 'poi-label', features: [poi] },
      ],
      { x: 0, y: 0 },
      project,
    )
    expect(picked).toEqual({ groupId: 'poi-label', feature: poi })
  })

  it('returns undefined when nothing in any group is near the tap', () => {
    expect(
      pickByPriority(
        [
          { id: 'saved', idKey: 'id', features: [] },
          { id: 'poi-label', features: [] },
        ],
        { x: 0, y: 0 },
        project,
      ),
    ).toBeUndefined()
  })
})
