import { useCallback, useEffect, useRef, useState } from 'react'
import type { Position } from '../brc/geo'

export type LocationStatus = 'idle' | 'locating' | 'tracking' | 'denied' | 'unavailable'

export interface Geolocation {
  position?: Position
  accuracy?: number
  lastFixAt?: number
  status: LocationStatus
  /** Begin watching. Safe to call repeatedly. */
  start: () => void
  stop: () => void
}

/**
 * Watches, rather than sampling once: the point of a heading is that it stays
 * true while you walk. Started on demand instead of at load, because a
 * permission prompt makes sense when someone asks to be taken somewhere and is
 * just an obstacle when they are only looking at the map.
 */
export function useGeolocation(): Geolocation {
  const [position, setPosition] = useState<Position>()
  const [accuracy, setAccuracy] = useState<number>()
  const [status, setStatus] = useState<LocationStatus>('idle')
  const [lastFixAt, setLastFixAt] = useState<number>()
  const watchId = useRef<number>(undefined)

  const stop = useCallback(() => {
    if (watchId.current !== undefined) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = undefined
    }
    setStatus((current) => (current === 'tracking' || current === 'locating' ? 'idle' : current))
    // The whole point of `position` is that it tracks where the user is
    // *right now*. Once nothing is watching any more, it can only get more
    // wrong as the person keeps moving — leaving it in state let it be read
    // indefinitely by DetailDrawer/EventDetail/navigation as a live "you"
    // fix that could in truth be minutes or hours stale (#50). Clearing it
    // here makes "stopped" behave exactly like "never located" for every
    // consumer that already treats `Boolean(position)` as "do I know where
    // they are", rather than needing each of those call sites to separately
    // reason about staleness.
    setPosition(undefined)
    setAccuracy(undefined)
    setLastFixAt(undefined)
  }, [])

  const start = useCallback(() => {
    if (watchId.current !== undefined) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable')
      return
    }
    // A fix from a previous session — possibly minutes old and from
    // somewhere else on the playa — must not be presented as the current
    // position while a fresh one is still being acquired. Clear it so
    // `position` stays undefined (and callers relying on `Boolean(position)`
    // correctly read "not located yet") until the new watch actually reports.
    setPosition(undefined)
    setAccuracy(undefined)
    setLastFixAt(undefined)
    setStatus('locating')
    watchId.current = navigator.geolocation.watchPosition(
      (fix) => {
        setPosition([fix.coords.longitude, fix.coords.latitude])
        setAccuracy(fix.coords.accuracy)
        setLastFixAt(fix.timestamp)
        setStatus('tracking')
      },
      (error) => {
        // Clear the watch explicitly rather than only dropping the ref to
        // it — otherwise a retry after a transient (non-permission) error
        // starts a second watch while the browser still owns the first,
        // and lifecycle ownership of it is lost.
        if (watchId.current !== undefined) {
          navigator.geolocation.clearWatch(watchId.current)
          watchId.current = undefined
        }
        setStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable')
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    )
  }, [])

  useEffect(() => stop, [stop])

  return { position, accuracy, lastFixAt, status, start, stop }
}
