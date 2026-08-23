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
  }, [])

  const start = useCallback(() => {
    if (watchId.current !== undefined) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable')
      return
    }
    setStatus('locating')
    watchId.current = navigator.geolocation.watchPosition(
      (fix) => {
        setPosition([fix.coords.longitude, fix.coords.latitude])
        setAccuracy(fix.coords.accuracy)
        setLastFixAt(fix.timestamp)
        setStatus('tracking')
      },
      (error) => {
        setStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable')
        watchId.current = undefined
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    )
  }, [])

  useEffect(() => stop, [stop])

  return { position, accuracy, lastFixAt, status, start, stop }
}
