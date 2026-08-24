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

    const acquire = async () => {
      try {
        const sentinel = await navigator.wakeLock.request('screen')
        if (cancelled) {
          // `active` already went false, or this effect re-ran, while the
          // request was in flight — release immediately rather than leaving
          // a lock nothing here still references.
          void sentinel.release()
          return
        }
        lock.current = sentinel
        setState('active')
        sentinel.addEventListener('release', () => {
          lock.current = null
          if (!cancelled) setState('inactive')
        })
      } catch {
        // Rejected — battery saver, a hidden tab, no user activation yet.
        // Navigation keeps working exactly as it did before this existed.
        setState('inactive')
      }
    }
    void acquire()

    // The OS/browser revokes the lock the moment the tab is hidden, with no
    // "still wants it" signal beyond that revocation — so this reacquires
    // whenever the tab becomes visible again while navigation is still active.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !lock.current) void acquire()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      const sentinel = lock.current
      lock.current = null
      setState('inactive')
      if (sentinel) void sentinel.release()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `state` is only read to bail out on 'unsupported'; including it would tear the lock down every time this effect itself flips it to 'active'.
  }, [active])

  return state
}
