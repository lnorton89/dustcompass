/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCompassHeading } from '../useCompassHeading'
import { useWakeLock } from '../useWakeLock'

function dispatchOrientation(alpha: number) {
  window.dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha, absolute: true }))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

describe('compass sample lifecycle (#165)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('keeps permission but hides the old sample until a fresh event arrives after restart', async () => {
    class NoGateDeviceOrientationEvent {}
    vi.stubGlobal('DeviceOrientationEvent', NoGateDeviceOrientationEvent)
    const { result, rerender } = renderHook(({ active }) => useCompassHeading(active), {
      initialProps: { active: true },
    })

    await act(async () => result.current.requestPermission())
    act(() => dispatchOrientation(10))
    expect(result.current.support).toBe('active')
    expect(result.current.heading).toBe(350)

    rerender({ active: false })
    await act(async () => {})
    expect(result.current.support).toBe('active')
    expect(result.current.heading).toBeUndefined()
    expect(result.current.accuracy).toBeUndefined()

    // Device movement while inactive is not observed.
    act(() => dispatchOrientation(180))
    rerender({ active: true })
    await act(async () => {})
    expect(result.current.heading).toBeUndefined()

    act(() => dispatchOrientation(90))
    expect(result.current.heading).toBe(270)
  })
})

describe('wake-lock acquisition ownership (#166)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    // @ts-expect-error test-only API cleanup
    delete navigator.wakeLock
  })

  it('does not start a second request while the first acquisition is pending', async () => {
    const pending = deferred<WakeLockSentinel>()
    const release = vi.fn(() => Promise.resolve())
    const sentinel = { release, addEventListener: vi.fn() } as unknown as WakeLockSentinel
    const request = vi.fn(() => pending.promise)
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })

    const { rerender } = renderHook(({ active }) => useWakeLock(active), {
      initialProps: { active: true },
    })
    expect(request).toHaveBeenCalledTimes(1)

    act(() => document.dispatchEvent(new Event('visibilitychange')))
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(request).toHaveBeenCalledTimes(1)

    await act(async () => pending.resolve(sentinel))
    rerender({ active: false })
    await act(async () => {})
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('releases a sentinel that resolves after navigation already stopped', async () => {
    const pending = deferred<WakeLockSentinel>()
    const release = vi.fn(() => Promise.resolve())
    const sentinel = { release, addEventListener: vi.fn() } as unknown as WakeLockSentinel
    const request = vi.fn(() => pending.promise)
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })

    const { rerender } = renderHook(({ active }) => useWakeLock(active), {
      initialProps: { active: true },
    })
    rerender({ active: false })
    await act(async () => pending.resolve(sentinel))
    expect(release).toHaveBeenCalledTimes(1)
  })
})
