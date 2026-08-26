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
  requestPermission?: (absolute?: boolean) => Promise<'granted' | 'denied'>
}

interface IOSOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number
  webkitCompassAccuracy?: number
}

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
        const result = await ctor.requestPermission(true)
        setSupport(result === 'granted' ? 'active' : 'denied')
      } catch {
        setSupport('denied')
      }
      return
    }
    setSupport('active')
  }, [support])

  // A compass sample is valid only for the navigation/listening session that
  // produced it. Keep permission state, but invalidate sensor data as soon as
  // navigation stops so a later route cannot paint the old needle before a
  // fresh orientation event arrives (#165). Queueing avoids a synchronous
  // setState cascade inside the effect body while still clearing before paint.
  useEffect(() => {
    if (active) return
    queueMicrotask(() => {
      setHeading(undefined)
      setAccuracy(undefined)
    })
  }, [active])

  useEffect(() => {
    if (support !== 'active' || !active) return
    if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') return
    let cancelled = false

    const eventName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation'

    const onOrientation = (event: DeviceOrientationEvent) => {
      if (cancelled) return
      const ios = event as IOSOrientationEvent
      if (typeof ios.webkitCompassHeading === 'number') {
        setHeading(ios.webkitCompassHeading)
        setAccuracy(typeof ios.webkitCompassAccuracy === 'number' && ios.webkitCompassAccuracy >= 0 ? ios.webkitCompassAccuracy : undefined)
        return
      }
      if (event.alpha != null && (eventName === 'deviceorientationabsolute' || event.absolute === true)) {
        setHeading((360 - event.alpha) % 360)
        setAccuracy(undefined)
      } else {
        setHeading(undefined)
        setAccuracy(undefined)
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
