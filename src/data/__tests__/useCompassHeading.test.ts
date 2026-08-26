/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCompassHeading } from '../useCompassHeading'

function dispatchOrientation(
  name: 'deviceorientation' | 'deviceorientationabsolute',
  props: { alpha?: number; absolute?: boolean; webkitCompassHeading?: number; webkitCompassAccuracy?: number },
) {
  const event = Object.assign(new Event(name), props)
  window.dispatchEvent(event)
}

describe('useCompassHeading (#63)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports unsupported when the browser has no DeviceOrientationEvent at all, and stays working (no throw)', async () => {
    vi.stubGlobal('DeviceOrientationEvent', undefined)
    const { result } = renderHook(() => useCompassHeading(true))
    expect(result.current.support).toBe('unsupported')
    expect(result.current.heading).toBeUndefined()
    await act(async () => {
      await result.current.requestPermission()
    })
    expect(result.current.support).toBe('unsupported')
  })

  it('starts at idle (no permission gate) on a platform like Android, and does not listen until requestPermission is called', () => {
    class NoGateDeviceOrientationEvent {}
    vi.stubGlobal('DeviceOrientationEvent', NoGateDeviceOrientationEvent)
    const { result } = renderHook(() => useCompassHeading(true))
    expect(result.current.support).toBe('idle')
    act(() => {
      dispatchOrientation('deviceorientation', { alpha: 90, absolute: true })
    })
    expect(result.current.heading).toBeUndefined()
  })

  it('activates and starts receiving heading once requestPermission is called on a no-gate platform', async () => {
    class NoGateDeviceOrientationEvent {}
    vi.stubGlobal('DeviceOrientationEvent', NoGateDeviceOrientationEvent)
    const { result } = renderHook(() => useCompassHeading(true))
    await act(async () => {
      await result.current.requestPermission()
    })
    expect(result.current.support).toBe('active')
    act(() => {
      dispatchOrientation('deviceorientation', { alpha: 90, absolute: true })
    })
    expect(result.current.heading).toBeCloseTo(270)
    expect(result.current.accuracy).toBeUndefined()
  })

  it('starts at needs-permission on an iOS-Safari-like platform', () => {
    class GatedDeviceOrientationEvent {
      static requestPermission = vi.fn().mockResolvedValue('granted')
    }
    vi.stubGlobal('DeviceOrientationEvent', GatedDeviceOrientationEvent)
    const { result } = renderHook(() => useCompassHeading(true))
    expect(result.current.support).toBe('needs-permission')
  })

  it('degrades cleanly to denied when the permission prompt is refused, without throwing', async () => {
    class GatedDeviceOrientationEvent {
      static requestPermission = vi.fn().mockResolvedValue('denied')
    }
    vi.stubGlobal('DeviceOrientationEvent', GatedDeviceOrientationEvent)
    const { result } = renderHook(() => useCompassHeading(true))
    await act(async () => {
      await result.current.requestPermission()
    })
    expect(result.current.support).toBe('denied')
    expect(result.current.heading).toBeUndefined()
  })

  it('requests absolute orientation when the permission API supports it', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted')
    class GatedDeviceOrientationEvent {
      static requestPermission = requestPermission
    }
    vi.stubGlobal('DeviceOrientationEvent', GatedDeviceOrientationEvent)
    const { result } = renderHook(() => useCompassHeading(true))
    await act(async () => result.current.requestPermission())
    expect(requestPermission).toHaveBeenCalledWith(true)
  })

  it('never presents relative alpha as a compass heading', async () => {
    class NoGateDeviceOrientationEvent {}
    vi.stubGlobal('DeviceOrientationEvent', NoGateDeviceOrientationEvent)
    const { result } = renderHook(() => useCompassHeading(true))
    await act(async () => result.current.requestPermission())
    act(() => dispatchOrientation('deviceorientation', { alpha: 90, absolute: false }))
    expect(result.current.heading).toBeUndefined()
  })

  it('degrades to denied, not a throw, if requestPermission itself rejects', async () => {
    class GatedDeviceOrientationEvent {
      static requestPermission = vi.fn().mockRejectedValue(new Error('not a user gesture'))
    }
    vi.stubGlobal('DeviceOrientationEvent', GatedDeviceOrientationEvent)
    const { result } = renderHook(() => useCompassHeading(true))
    await act(async () => {
      await result.current.requestPermission()
    })
    expect(result.current.support).toBe('denied')
  })

  it('reads iOS webkitCompassHeading/webkitCompassAccuracy directly, once granted, in preference to alpha', async () => {
    class GatedDeviceOrientationEvent {
      static requestPermission = vi.fn().mockResolvedValue('granted')
    }
    vi.stubGlobal('DeviceOrientationEvent', GatedDeviceOrientationEvent)
    const { result } = renderHook(() => useCompassHeading(true))
    await act(async () => {
      await result.current.requestPermission()
    })
    act(() => {
      dispatchOrientation('deviceorientation', { alpha: 12, webkitCompassHeading: 271.4, webkitCompassAccuracy: 5 })
    })
    expect(result.current.heading).toBeCloseTo(271.4)
    expect(result.current.accuracy).toBe(5)
  })

  it('does not fabricate an accuracy when webkitCompassAccuracy is negative (uncalibrated)', async () => {
    class GatedDeviceOrientationEvent {
      static requestPermission = vi.fn().mockResolvedValue('granted')
    }
    vi.stubGlobal('DeviceOrientationEvent', GatedDeviceOrientationEvent)
    const { result } = renderHook(() => useCompassHeading(true))
    await act(async () => {
      await result.current.requestPermission()
    })
    act(() => {
      dispatchOrientation('deviceorientation', { webkitCompassHeading: 90, webkitCompassAccuracy: -1 })
    })
    expect(result.current.heading).toBe(90)
    expect(result.current.accuracy).toBeUndefined()
  })

  it('prefers deviceorientationabsolute when the platform exposes it', async () => {
    class NoGateDeviceOrientationEvent {}
    vi.stubGlobal('DeviceOrientationEvent', NoGateDeviceOrientationEvent)
    Object.defineProperty(window, 'ondeviceorientationabsolute', { value: null, configurable: true })
    const { result } = renderHook(() => useCompassHeading(true))
    await act(async () => {
      await result.current.requestPermission()
    })
    act(() => {
      dispatchOrientation('deviceorientationabsolute', { alpha: 45, absolute: true })
    })
    expect(result.current.heading).toBeCloseTo(315)
    Reflect.deleteProperty(window, 'ondeviceorientationabsolute')
  })

  it('stops listening and invalidates the previous navigation sample when `active` goes false (#165)', async () => {
    class NoGateDeviceOrientationEvent {}
    vi.stubGlobal('DeviceOrientationEvent', NoGateDeviceOrientationEvent)
    const { result, rerender } = renderHook(({ active }) => useCompassHeading(active), {
      initialProps: { active: true },
    })
    await act(async () => {
      await result.current.requestPermission()
    })
    act(() => {
      dispatchOrientation('deviceorientation', { alpha: 0, absolute: true })
    })
    expect(result.current.heading).toBeCloseTo(0)

    rerender({ active: false })
    await act(async () => {})
    expect(result.current.support).toBe('active')
    expect(result.current.heading).toBeUndefined()
    expect(result.current.accuracy).toBeUndefined()

    act(() => {
      dispatchOrientation('deviceorientation', { alpha: 180, absolute: true })
    })
    expect(result.current.heading).toBeUndefined()

    rerender({ active: true })
    await act(async () => {})
    expect(result.current.heading).toBeUndefined()
    act(() => {
      dispatchOrientation('deviceorientation', { alpha: 90, absolute: true })
    })
    expect(result.current.heading).toBeCloseTo(270)
  })
})
