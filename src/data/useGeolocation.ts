import { useCallback, useEffect, useRef, useState } from 'react'
import type { Position } from '../brc/geo'

export type LocationStatus = 'idle' | 'locating' | 'tracking' | 'denied' | 'unavailable'

export interface Geolocation {
  position?: Position
  accuracy?: number
  lastFixAt?: number
  status: LocationStatus
  /** Begin watching. Safe to call repeatedly. */
  start: (initialFix?: GeolocationPosition) => void
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

  const clearFix = useCallback(() => {
    setPosition(undefined)
    setAccuracy(undefined)
    setLastFixAt(undefined)
  }, [])

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
    // fix that could in truth be minutes or hours stale (#50).
    clearFix()
  }, [clearFix])

  const start = useCallback((initialFix?: GeolocationPosition) => {
    // The map control has already paid for a one-shot fix by the time its
    // geolocate event fires. Seed the shared watch with that exact reading so
    // hiding MapLibre's duplicate dot never creates a gap with no visible
    // location while watchPosition obtains its first callback.
    if (initialFix) {
      setPosition([initialFix.coords.longitude, initialFix.coords.latitude])
      setAccuracy(initialFix.coords.accuracy)
      setLastFixAt(initialFix.timestamp)
      setStatus('tracking')
    }
    if (watchId.current !== undefined) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      clearFix()
      setStatus('unavailable')
      return
    }
    // A fix from a previous session — possibly minutes old and from
    // somewhere else on the playa — must not be presented as the current
    // position while a fresh one is still being acquired.
    if (!initialFix) {
      clearFix()
      setStatus('locating')
    }
    watchId.current = navigator.geolocation.watchPosition(
      (fix) => {
        setPosition([fix.coords.longitude, fix.coords.latitude])
        setAccuracy(fix.coords.accuracy)
        setLastFixAt(fix.timestamp)
        setStatus('tracking')
      },
      (error) => {
        // Permission denial is terminal — the browser will never call this
        // watch back again, so tear it down and withdraw the old fix just as
        // `stop()` does. A denial can happen after successful samples if the
        // user revokes permission while the app is open; retaining that sample
        // would leave navigation trusting a coordinate that can never refresh.
        if (error.code !== error.PERMISSION_DENIED) {
          clearFix()
          setStatus('locating')
          return
        }
        if (watchId.current !== undefined) {
          navigator.geolocation.clearWatch(watchId.current)
          watchId.current = undefined
        }
        clearFix()
        setStatus('denied')
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    )
  }, [clearFix])

  useEffect(() => stop, [stop])

  return { position, accuracy, lastFixAt, status, start, stop }
}
