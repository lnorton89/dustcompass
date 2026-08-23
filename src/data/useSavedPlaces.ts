import { useCallback, useEffect, useState } from 'react'
import type { Position } from '../brc/geo'

const KEY = 'playa-map.places.v1'

export interface SavedPlace {
  id: string
  name: string
  position: Position
  address: string
  savedAt: number
}

/**
 * Anything written by an older build, hand-edited, or truncated mid-write is
 * dropped rather than allowed to crash the map on the one night someone needs
 * to find their tent. Exported so the salvage behaviour can be tested directly.
 */
export function parsePlaces(raw: string | null): SavedPlace[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  return parsed.filter((place): place is SavedPlace => {
    if (typeof place !== 'object' || place === null) return false
    const candidate = place as Partial<SavedPlace>
    return (
      typeof candidate.id === 'string' &&
      typeof candidate.name === 'string' &&
      Array.isArray(candidate.position) &&
      candidate.position.length === 2 &&
      candidate.position.every((n) => typeof n === 'number' && Number.isFinite(n))
    )
  })
}

function read(): SavedPlace[] {
  try {
    return parsePlaces(localStorage.getItem(KEY))
  } catch {
    // Reading site data can throw outright in a private window.
    return []
  }
}

/**
 * Where your tent is, where you left the bike, where you agreed to meet. This
 * is the thing people reach for at 4am, so it is stored on the device and never
 * needs the network — and it survives the app being closed, which favourites
 * alone would not cover because these places are not listings.
 */
export function useSavedPlaces() {
  const [places, setPlaces] = useState<SavedPlace[]>(read)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(places))
    } catch {
      /* private window or blocked site data — keep working in memory */
    }
  }, [places])

  const save = useCallback((name: string, position: Position, address: string) => {
    const place: SavedPlace = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      position,
      address,
      savedAt: Date.now(),
    }
    setPlaces((current) => [place, ...current])
    return place
  }, [])

  const remove = useCallback((id: string) => {
    setPlaces((current) => current.filter((place) => place.id !== id))
  }, [])

  const restore = useCallback((place: SavedPlace) => {
    setPlaces((current) => current.some((item) => item.id === place.id) ? current : [place, ...current])
  }, [])

  const rename = useCallback((id: string, name: string) => {
    setPlaces((current) => current.map((place) => (place.id === id ? { ...place, name } : place)))
  }, [])

  return { places, save, remove, restore, rename }
}
