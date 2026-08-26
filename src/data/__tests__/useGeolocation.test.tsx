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
   * POSITION_UNAVAILABLE/TIMEOUT must be visible to request-level consumers so
   * Directions can stop saying "Finding your location…" forever and fall back
   * to The Man (#143). The browser watch itself remains alive because these
   * failures are recoverable; a later callback promotes the same watch back to
   * tracking without starting a second one (#82).
   */
  it('reports a transient failure while keeping the same watch available for recovery', () => {
    const { result } = renderHook(() => useGeolocation())
    act(() => result.current.start())
    act(() => calls[0].success(fix(-119.2, 40.78)))
    act(() => calls[0].error(error(2)))

    expect(clearWatch).not.toHaveBeenCalled()
    expect(result.current.status).toBe('unavailable')
    expect(result.current.position).toBeUndefined()
    expect(result.current.accuracy).toBeUndefined()
    expect(result.current.lastFixAt).toBeUndefined()

    act(() => calls[0].success(fix(-119.21, 40.79)))
    expect(result.current.position).toEqual([-119.21, 40.79])
    expect(result.current.status).toBe('tracking')
    expect(watchPosition).toHaveBeenCalledTimes(1)
  })

  it('reports timeout as unavailable without destroying the recoverable watch', () => {
    const { result } = renderHook(() => useGeolocation())
    act(() => result.current.start())
    act(() => calls[0].error(error(3)))
    expect(result.current.status).toBe('unavailable')
    expect(clearWatch).not.toHaveBeenCalled()
    expect(watchPosition).toHaveBeenCalledTimes(1)
  })

  it('distinguishes permission denial from other failures', () => {
    const { result } = renderHook(() => useGeolocation())
    act(() => result.current.start())
    act(() => calls[0].error(error(1)))
    expect(result.current.status).toBe('denied')

    expect(clearWatch).toHaveBeenCalledWith(1)
    act(() => result.current.start())
    expect(watchPosition).toHaveBeenCalledTimes(2)
  })
})
