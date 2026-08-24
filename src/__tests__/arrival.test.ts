import { describe, expect, it } from 'vitest'
import { boundsCenteredOn, boundsOf, canConfirmArrival, liveAddressMessage, locationWatchHasFailed } from '../App'

/**
 * #49: `origin` (and so `navigation.travel.meters`) falls back to the Man's
 * own coordinates once `isNearCity()` rejects a fix as unusable for
 * navigation. Gating the arrival buzz on "any fix exists" instead of "the
 * fix navigation is actually using" let a destination near the Man arm a
 * false arrival from a real GPS fix hundreds of miles away.
 */
describe('canConfirmArrival (#49)', () => {
  it('never confirms arrival without a usable (in-city) fix, however close the computed travel is', () => {
    // The exact false-positive path: origin fell back to the Man, so travel
    // to a Man-adjacent target reads as ~0m with a tight accuracy — but the
    // fix behind it was rejected by isNearCity() as unusable.
    expect(canConfirmArrival(0, false, 5)).toBe(false)
    expect(canConfirmArrival(10, false, undefined)).toBe(false)
  })

  it('confirms arrival for a usable fix inside the accuracy-aware threshold', () => {
    expect(canConfirmArrival(10, true, 10)).toBe(true)
    expect(canConfirmArrival(25, true, 0)).toBe(true)
  })

  it('rejects a usable fix outside the threshold even before accuracy is added', () => {
    expect(canConfirmArrival(30, true, 0)).toBe(false)
  })

  it('treats missing accuracy as unbounded, not zero, for a usable fix', () => {
    expect(canConfirmArrival(0, true, undefined)).toBe(false)
  })
})

/**
 * #56: a denied/unavailable acquisition — most often the map locate
 * control, which has no explicit release action on success by design —
 * used to leave a phantom owner in `locationOwners` forever, so the set
 * never returned to empty and `location.stop()` stopped firing even once
 * every real, successful consumer had released.
 */
describe('locationWatchHasFailed (#56)', () => {
  it('reports a terminal failure for denied and unavailable', () => {
    expect(locationWatchHasFailed('denied')).toBe(true)
    expect(locationWatchHasFailed('unavailable')).toBe(true)
  })

  it('does not report a failure for idle, locating, or tracking', () => {
    expect(locationWatchHasFailed('idle')).toBe(false)
    expect(locationWatchHasFailed('locating')).toBe(false)
    expect(locationWatchHasFailed('tracking')).toBe(false)
  })
})

/**
 * #62: the live-address snackbar's own text, tested in isolation so a lost
 * fix mid-display (walking out of GPS range, the watch stopping) is
 * provably handled without needing to drive App's whole render tree.
 */
describe('liveAddressMessage (#62)', () => {
  it('reports the address when one is available', () => {
    expect(liveAddressMessage('6:30 & B')).toBe('You are near 6:30 & B')
  })

  it('falls back to a finding-you message rather than freezing on stale text', () => {
    expect(liveAddressMessage(undefined)).toBe('Finding you…')
  })
})

/**
 * `map.fitBounds()` reads its two-point array as `[southwest, northeast]`,
 * not "any two corners" — the reader's own live position and a destination
 * are two arbitrary points with no guaranteed relative order, and handing
 * them straight through backwards (the reader east or north of the
 * destination) makes MapLibre wrap the bounding box the long way around the
 * globe instead of framing the two points, landing the camera at a
 * near-global zoom on the opposite side of the world. This is the exact
 * shape a real Black Rock City fix and a real camp address take relative to
 * each other about as often as not.
 */
describe('boundsOf', () => {
  it('sorts into [southwest, northeast] when the first point is already sw of the second', () => {
    expect(boundsOf([-119.22, 40.77], [-119.19, 40.79])).toEqual([
      [-119.22, 40.77],
      [-119.19, 40.79],
    ])
  })

  it('sorts into [southwest, northeast] when the first point is east of the second', () => {
    // The exact regression shape: a live fix east of the destination it's
    // navigating to, which fed straight through as [a, b] produced an
    // inverted (west > east) bounding box.
    expect(boundsOf([-119.1893, 40.7772], [-119.2188, 40.7769])).toEqual([
      [-119.2188, 40.7769],
      [-119.1893, 40.7772],
    ])
  })

  it('sorts latitude independently of longitude', () => {
    expect(boundsOf([-119.19, 40.79], [-119.22, 40.77])).toEqual([
      [-119.22, 40.77],
      [-119.19, 40.79],
    ])
  })
})

/**
 * A plain two-point `boundsOf()` box puts the destination at a corner
 * rather than the middle once fit — real, off-screen-outside-the-drawer
 * territory for a marker at, say, x=32 on a 1440-wide viewport, when the
 * destination is the one thing navigation is actually about. `fitBounds()`
 * centers on its own box's midpoint, so mirroring the included point
 * across the anchor keeps that midpoint exactly at the anchor by
 * construction, whatever direction the included point sits in.
 */
describe('boundsCenteredOn', () => {
  it('produces a box whose midpoint is exactly the anchor', () => {
    const anchor: [number, number] = [-119.205, 40.782]
    const include: [number, number] = [-119.189, 40.777]
    const [sw, ne] = boundsCenteredOn(anchor, include)
    expect((sw[0] + ne[0]) / 2).toBeCloseTo(anchor[0])
    expect((sw[1] + ne[1]) / 2).toBeCloseTo(anchor[1])
  })

  it('keeps the included point exactly on the box, not just inside it', () => {
    const anchor: [number, number] = [-119.205, 40.782]
    const include: [number, number] = [-119.189, 40.777]
    const [sw, ne] = boundsCenteredOn(anchor, include)
    expect(include[0] === sw[0] || include[0] === ne[0]).toBe(true)
    expect(include[1] === sw[1] || include[1] === ne[1]).toBe(true)
  })

  it('still sorts into [southwest, northeast] regardless of which side the included point is on', () => {
    const expected = [
      [-119.221, 40.774],
      [-119.189, 40.79],
    ]
    // The included point northeast of the anchor.
    const fromNortheast = boundsCenteredOn([-119.205, 40.782], [-119.189, 40.79])
    // The included point southwest of the anchor.
    const fromSouthwest = boundsCenteredOn([-119.205, 40.782], [-119.221, 40.774])
    for (const result of [fromNortheast, fromSouthwest]) {
      expect(result[0][0]).toBeCloseTo(expected[0][0])
      expect(result[0][1]).toBeCloseTo(expected[0][1])
      expect(result[1][0]).toBeCloseTo(expected[1][0])
      expect(result[1][1]).toBeCloseTo(expected[1][1])
    }
  })
})
