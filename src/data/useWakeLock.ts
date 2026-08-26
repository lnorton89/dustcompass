import { useEffect, useRef, useState } from 'react'

export type WakeLockState = 'unsupported' | 'inactive' | 'active'

/**
 * Keeps the screen from dimming/locking while `active` is true — active
 * navigation, so distance and heading stay readable hands-free instead of
 * the screen going dark mid-route (#65). Feature-detects `navigator.
 * wakeLock` and never throws or blocks navigation if it's unavailable or a
 * request is refused (low power mode, a backgrounded tab): this is a
 * nicety layered on top of navigation, not something navigation depends on.
 */
export function useWakeLock(active: boolean): WakeLockState {
  const lock = useRef<WakeLockSentinel | null>(null)
  const [state, setState] = useState<WakeLockState>(() =>
    typeof navigator === 'undefined' || !('wakeLock' in navigator) ? 'unsupported' : 'inactive',
  )

  useEffect(() => {
    if (state === 'unsupported' || !active) return
    let cancelled = false
    let acquiring = false

    const acquire = async () => {
      // `lock.current` is populated only after request() resolves. Without a
      // separate in-flight guard, a visibility event can start request B while
      // request A is pending and orphan A when B later overwrites the ref (#166).
      if (cancelled || acquiring || lock.current) return
      acquiring = true
      try {
        const sentinel = await navigator.wakeLock.request('screen')
        if (cancelled) {
          void sentinel.release()
          return
        }
        // Defensive: if the platform somehow resolved another sentinel while
        // this request was pending, never replace it without releasing this one.
        if (lock.current) {
          void sentinel.release()
          return
        }
        lock.current = sentinel
        setState('active')
        sentinel.addEventListener('release', () => {
          if (lock.current === sentinel) lock.current = null
          if (!cancelled) setState('inactive')
        })
      } catch {
        if (!cancelled) setState('inactive')
      } finally {
        acquiring = false
      }
    }
    void acquire()

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void acquire()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      const sentinel = lock.current
      lock.current = null
      queueMicrotask(() => setState('inactive'))
      if (sentinel) void sentinel.release()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `state` is only read to bail out on 'unsupported'; including it would tear the lock down every time this effect itself flips it to 'active'.
  }, [active])

  return state
}
