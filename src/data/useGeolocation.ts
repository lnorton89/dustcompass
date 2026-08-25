import { useCallback, useEffect, useRef, useState } from 'react'
import type { Position } from '../brc/geo'

export type LocationStatus = 'idle' | 'locating' | 'tracking' | 'denied' | 'unavailable'

export interface Geolocation {
  position?: Position
  accuracy?: number
  lastFixAt?: number
  status: LocationStatus
  start: (initialFix?: GeolocationPosition) => void
  stop: () => void
}

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
    clearFix()
  }, [clearFix])

  const start = useCallback((initialFix?: GeolocationPosition) => {
    if (initialFix) {
      setPosition([initialFix.coords.longitude, initialFix.coords.latitude])
      setAccuracy(initialFix.coords.accuracy)
      setLastFixAt(initialFix.timestamp)
      setStatus('tracking')
    }
    if (watchId.current !== undefined) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable')
      return
    }
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
        if (error.code !== error.PERMISSION_DENIED) {
          clearFix()
          setStatus('locating')
          return
        }
        if (watchId.current !== undefined) {
          navigator.geolocation.clearWatch(watchId.current)
          watchId.current = undefined
        }
        // A terminal permission denial means this sample can never be refreshed.
        // Withdraw it immediately rather than letting navigation keep treating a
        // pre-denial coordinate and accuracy value as live forever (#102).
        clearFix()
        setStatus('denied')
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    )
  }, [clearFix])

  useEffect(() => stop, [stop])

  return { position, accuracy, lastFixAt, status, start, stop }
}
