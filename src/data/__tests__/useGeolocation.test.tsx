/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGeolocation } from '../useGeolocation'

type Success = (position: GeolocationPosition) => void
type Failure = (error: GeolocationPositionError) => void

describe('useGeolocation', () => {
  let calls: { success: Success; error: Failure }[]
  let nextWatchId: number
  let watchPosition: ReturnType<typeof vi.fn>
  let clearWatch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    calls = []
    nextWatchId = 0
    watchPosition = vi.fn((success: Success, error: Failure) => {
      calls.push({ success, error })
      nextWatchId += 1
      return nextWatchId
    })
    clearWatch = vi.fn()
    // jsdom does not implement Geolocation; stand in with a test double whose
    // watchPosition/clearWatch calls the hook is responsible for pairing up.
    Object.defineProperty(navigator, 'geolocation', {
      value: { watchPosition, clearWatch },
      configurable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const fix = (lng: number, lat: number): GeolocationPosition =>
    ({ coords: { longitude: lng, latitude: lat, accuracy: 5 }, timestamp: 1000 }) as GeolocationPosition

  const error = (code: number): GeolocationPositionError =>
    ({ code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }) as GeolocationPositionError

  /**
   * A fix from a previous navigation session is minutes old and possibly from
   * somewhere else entirely. Restarting must show a locating state, not
   * immediately resolve to that stale fix as though it were current.
   */
  it('does not resolve to a stale fix immediately after stop -> start', () => {
    const { result } = renderHook(() => useGeolocation())

    act(() => result.current.start())
    act(() => calls[0].success(fix(-119.2, 40.78)))
    expect(result.current.position).toEqual([-119.2, 40.78])
    expect(result.current.status).toBe('tracking')

    act(() => result.current.stop())
    act(() => result.current.start())

    expect(result.current.position).toBeUndefined()
    expect(result.current.accuracy).toBeUndefined()
    expect(result.current.status).toBe('locating')

    act(() => calls[1].success(fix(-119.21, 40.79)))
    expect(result.current.position).toEqual([-119.21, 40.79])
    expect(result.current.status).toBe('tracking')
  })

  /**
   * #50: `stop()` used to leave `position`/`accuracy`/`lastFixAt` in state
   * indefinitely once the last owner released the watch, so a detail panel
   * opened later could present a fix from minutes (or hours) earlier as the
   * user's current location with no indication tracking had actually
   * stopped. `stop()` alone — not just the stop-then-start pairing already
   * covered above — must clear the fix.
   */
  it('clears the retained fix once stopped, even without an immediate restart', () => {
    const { result } = renderHook(() => useGeolocation())

    act(() => result.current.start())
    act(() => calls[0].success(fix(-119.2, 40.78)))
    expect(result.current.position).toEqual([-119.2, 40.78])

    act(() => result.current.stop())

    expect(result.current.position).toBeUndefined()
    expect(result.current.accuracy).toBeUndefined()
    expect(result.current.lastFixAt).toBeUndefined()
    expect(result.current.status).toBe('idle')
  })

  it('starts exactly one watch per start() call and pairs each with a clearWatch', () => {
    const { result } = renderHook(() => useGeolocation())
    act(() => result.current.start())
    expect(watchPosition).toHaveBeenCalledTimes(1)
    // Calling start again while already watching must not start a second one.
    act(() => result.current.start())
    expect(watchPosition).toHaveBeenCalledTimes(1)

    act(() => result.current.stop())
    expect(clearWatch).toHaveBeenCalledWith(1)
  })

  it('seeds the shared watch from the map control\'s one-shot fix', () => {
    const { result } = renderHook(() => useGeolocation())

    act(() => result.current.start(fix(-119.2, 40.78)))

    expect(result.current.position).toEqual([-119.2, 40.78])
    expect(result.current.accuracy).toBe(5)
    expect(result.current.status).toBe('tracking')
    expect(watchPosition).toHaveBeenCalledTimes(1)
  })

  /**
   * A transient (non-permission) error — POSITION_UNAVAILABLE or TIMEOUT —
   * used to clear the watch outright, silently ending tracking for good on
   * a single blip with nothing left to restart it, since `start()` no-ops
   * while a (now-stale) `watchId` still looks active. Real devices throw
   * these transiently — a moment of lost signal, a slow first fix — while
   * the browser's own watch keeps running and calls back again once a fix
   * is available, exactly like Chromium's mocked geolocation does when a
   * test moves the override mid-watch. The watch must survive it.
   *
   * Status must land on 'locating', not 'unavailable': the latter drives
   * NavBar's "Retry device location" button, whose handler is `start()`
   * with no args — a guaranteed no-op here since `watchId` is deliberately
   * left set so this same watch can recover. Reporting 'unavailable' left
   * real phones stuck on an unresponsive Retry button on every routine GPS
   * blip; 'locating' shows "finding you…" instead, which matches what's
   * actually happening.
   */
  it('keeps the same watch alive through a transient error rather than ending tracking', () => {
    const { result } = renderHook(() => useGeolocation())
    act(() => result.current.start())
    act(() => calls[0].success(fix(-119.2, 40.78)))
    act(() => calls[0].error(error(2)))

    expect(clearWatch).not.toHaveBeenCalled()
    expect(result.current.status).toBe('locating')
    // The browser watch survives, but the old sample is no longer eligible
    // for arrival, nearest-service math or a live "you are here" marker.
    expect(result.current.position).toBeUndefined()
    expect(result.current.accuracy).toBeUndefined()
    expect(result.current.lastFixAt).toBeUndefined()

    // The same watch recovering on its own, as the real browser's would.
    act(() => calls[0].success(fix(-119.21, 40.79)))
    expect(result.current.position).toEqual([-119.21, 40.79])
    expect(result.current.status).toBe('tracking')
    expect(watchPosition).toHaveBeenCalledTimes(1)
  })

  it('distinguishes permission denial from other failures', () => {
    const { result } = renderHook(() => useGeolocation())
    act(() => result.current.start())
    act(() => calls[0].error(error(1)))
    expect(result.current.status).toBe('denied')

    // Permission denial is terminal — the browser will never call this watch
    // back again, so it is torn down the same way stop() does, and a retry
    // starts a genuinely fresh one rather than accumulating.
    expect(clearWatch).toHaveBeenCalledWith(1)
    act(() => result.current.start())
    expect(watchPosition).toHaveBeenCalledTimes(2)
  })
})
