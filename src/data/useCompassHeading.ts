import { useCallback, useEffect, useState } from 'react'

export type CompassSupport = 'unsupported' | 'idle' | 'needs-permission' | 'denied' | 'active'

export interface CompassHeading {
  support: CompassSupport
  /** Degrees, 0-360. The device's current compass heading, per whatever the
   * browser reports (magnetic on most platforms, true where the OS corrects
   * for declination). Undefined until the first orientation event arrives. */
  heading?: number
  /** Degrees of uncertainty, when the platform reports one — iOS's
   * `webkitCompassAccuracy`. Undefined everywhere else: the generic
   * `DeviceOrientationEvent` has no standard accuracy field, and a missing
   * number is reported as missing rather than fabricated. */
  accuracy?: number
  /**
   * Must be called from inside a real user-gesture handler (a click) — iOS
   * Safari's `DeviceOrientationEvent.requestPermission()` throws outside one.
   * A safe no-op on platforms that need no such prompt (it just starts
   * listening) and on unsupported devices (nothing to do).
   */
  requestPermission: () => Promise<void>
}

interface RequestPermissionCtor {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

interface IOSOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number
  webkitCompassAccuracy?: number
}

/**
 * Reads the device's physical compass heading — not the MapLibre camera
 * bearing, which is a separate, unrelated rotation the map already handles
 * via its own "12:00 up"/"North up" controls (#63). This is the sensor a
 * needle points with.
 *
 * Mirrors `useWakeLock`'s shape: feature-detection lives in `useState`'s
 * lazy initializer, the listener is added/removed by an effect gated on
 * `active`, and it never throws — an unsupported browser or a denied prompt
 * degrades to "no needle", not a broken screen.
 *
 * iOS Safari gates orientation events behind a permission prompt that must
 * be triggered by a tap (`DeviceOrientationEvent.requestPermission`).
 * Android and everything else has no such gate — events just start firing
 * once a listener exists — so `support` starts at `'idle'` there instead of
 * `'needs-permission'`, but the listener still only attaches once
 * `requestPermission()` has been called at least once, so the same
 * "tap the compass on" affordance works uniformly on every platform.
 */
export function useCompassHeading(active: boolean): CompassHeading {
  const [support, setSupport] = useState<CompassSupport>(() => {
    if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') {
      return 'unsupported'
    }
    const ctor = DeviceOrientationEvent as unknown as RequestPermissionCtor
    return typeof ctor.requestPermission === 'function' ? 'needs-permission' : 'idle'
  })
  const [heading, setHeading] = useState<number>()
  const [accuracy, setAccuracy] = useState<number>()

  const requestPermission = useCallback(async () => {
    if (support === 'unsupported' || support === 'active') return
    const ctor = DeviceOrientationEvent as unknown as RequestPermissionCtor
    if (typeof ctor.requestPermission === 'function') {
      try {
        const result = await ctor.requestPermission()
        setSupport(result === 'granted' ? 'active' : 'denied')
      } catch {
        // Denied, or asked outside a user gesture — either way, degrade to
        // the existing text/route navigation rather than a broken control.
        setSupport('denied')
      }
      return
    }
    // No permission gate on this platform — "turning the compass on" just
    // means the listener effect below is now allowed to attach.
    setSupport('active')
  }, [support])

  useEffect(() => {
    if (support !== 'active' || !active) return
    if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') return
    let cancelled = false

    // Plain `deviceorientation` is not guaranteed to be earth-relative on
    // every platform — `deviceorientationabsolute` is, where it exists.
    const eventName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation'

    const onOrientation = (event: DeviceOrientationEvent) => {
      if (cancelled) return
      const ios = event as IOSOrientationEvent
      if (typeof ios.webkitCompassHeading === 'number') {
        setHeading(ios.webkitCompassHeading)
        setAccuracy(typeof ios.webkitCompassAccuracy === 'number' && ios.webkitCompassAccuracy >= 0 ? ios.webkitCompassAccuracy : undefined)
        return
      }
      if (event.alpha != null) {
        setHeading((360 - event.alpha) % 360)
      }
    }

    window.addEventListener(eventName, onOrientation)

    return () => {
      cancelled = true
      window.removeEventListener(eventName, onOrientation)
    }
  }, [support, active])

  return { support, heading, accuracy, requestPermission }
}
