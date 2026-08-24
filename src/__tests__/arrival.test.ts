import { describe, expect, it } from 'vitest'
import { canConfirmArrival, liveAddressMessage, locationWatchHasFailed } from '../App'

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
