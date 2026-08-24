/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWakeLock } from '../useWakeLock'

/**
 * #65: active navigation is meant to be read hands-free — the screen
 * dimming mid-route defeats that. `useWakeLock` requests a Screen Wake Lock
 * while `active` is true, releases it once `active` goes false, and must
 * never make navigation depend on a lock actually being granted.
 */
describe('useWakeLock', () => {
  let request: ReturnType<typeof vi.fn>
  let sentinel: { release: ReturnType<typeof vi.fn>; addEventListener: ReturnType<typeof vi.fn> }
  let releaseListeners: (() => void)[]

  beforeEach(() => {
    releaseListeners = []
    sentinel = {
      release: vi.fn(() => {
        for (const listener of releaseListeners) listener()
        return Promise.resolve()
      }),
      addEventListener: vi.fn((type: string, listener: () => void) => {
        if (type === 'release') releaseListeners.push(listener)
      }),
    }
    request = vi.fn(() => Promise.resolve(sentinel))
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request },
      configurable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // @ts-expect-error -- test-only cleanup of a property this suite defines itself
    delete navigator.wakeLock
  })

  it('does not request a lock while inactive', () => {
    const { result } = renderHook(() => useWakeLock(false))
    expect(result.current).toBe('inactive')
    expect(request).not.toHaveBeenCalled()
  })

  it('requests a lock once active becomes true and reports it as active', async () => {
    const { result, rerender } = renderHook(({ active }) => useWakeLock(active), {
      initialProps: { active: false },
    })
    rerender({ active: true })
    await act(async () => {})

    expect(request).toHaveBeenCalledWith('screen')
    expect(result.current).toBe('active')
  })

  it('releases the lock once active goes back to false', async () => {
    const { result, rerender } = renderHook(({ active }) => useWakeLock(active), {
      initialProps: { active: true },
    })
    await act(async () => {})
    expect(result.current).toBe('active')

    rerender({ active: false })
    expect(sentinel.release).toHaveBeenCalledTimes(1)
  })

  it('releases the lock on unmount', async () => {
    const { unmount } = renderHook(() => useWakeLock(true))
    await act(async () => {})

    unmount()
    expect(sentinel.release).toHaveBeenCalledTimes(1)
  })

  it('reacquires when the tab becomes visible again while still active', async () => {
    const { result } = renderHook(() => useWakeLock(true))
    await act(async () => {})
    expect(request).toHaveBeenCalledTimes(1)

    // The OS revokes the lock the moment the tab is hidden — simulated here
    // by firing the sentinel's own 'release' event, the same signal a real
    // OS-driven revocation would send.
    await act(async () => {
      for (const listener of releaseListeners) listener()
    })
    expect(result.current).toBe('inactive')

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('does not throw and leaves state as inactive when the request is rejected', async () => {
    request.mockRejectedValueOnce(new Error('not allowed'))
    const { result } = renderHook(() => useWakeLock(true))
    await act(async () => {})
    expect(result.current).toBe('inactive')
  })

  it('reports unsupported and never calls request when navigator.wakeLock is absent', async () => {
    // @ts-expect-error -- deliberately removing the API for this case
    delete navigator.wakeLock
    const { result } = renderHook(() => useWakeLock(true))
    await act(async () => {})
    expect(result.current).toBe('unsupported')
    expect(request).not.toHaveBeenCalled()
  })
})
