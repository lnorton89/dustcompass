import { useCallback, useEffect, useState } from 'react'
import type { Position } from '../brc/geo'
import { DATA_YEAR } from '../config'

// Storage is scoped per data year: each year's survey moves the city centre,
// bearing, and street geometry by enough that a prior year's coordinates are
// not safe to draw as current. Keying by year means a build for a new
// DATA_YEAR simply never sees last year's spots instead of drawing them on
// the wrong city.
const KEY_PREFIX = 'playa-map.places.v1'
const KEY = `${KEY_PREFIX}.${DATA_YEAR}`

// Builds before this fix wrote to one unversioned key with no year attached.
// Those coordinates can't be assumed to match any particular year's survey,
// so they are archived under their own key (never merged into a year's data)
// and the unversioned key is cleared so it can't be picked up again. Losing
// that old data silently is safe; drawing it as current-year would not be.
const LEGACY_ARCHIVE_KEY = `${KEY_PREFIX}.legacy-unversioned`

function migrateLegacyUnversionedStorage(): void {
  const legacy = localStorage.getItem(KEY_PREFIX)
  if (legacy === null) return
  if (localStorage.getItem(LEGACY_ARCHIVE_KEY) === null) {
    localStorage.setItem(LEGACY_ARCHIVE_KEY, legacy)
  }
  localStorage.removeItem(KEY_PREFIX)
}

export interface SavedPlace {
  id: string
  name: string
  position: Position
  address: string
  savedAt: number
}

// Generous cap, not a UI limit — it exists so a corrupted write can't turn
// into an unbounded string that has to be carried through storage and render.
const MAX_NAME_LENGTH = 200

function isValidPlace(candidate: Partial<SavedPlace>): candidate is SavedPlace {
  if (typeof candidate.id !== 'string' || candidate.id.trim().length === 0) return false
  if (
    typeof candidate.name !== 'string' ||
    candidate.name.trim().length === 0 ||
    candidate.name.length > MAX_NAME_LENGTH
  ) {
    return false
  }
  if (typeof candidate.address !== 'string') return false
  if (typeof candidate.savedAt !== 'number' || !Number.isFinite(candidate.savedAt)) return false
  if (!Array.isArray(candidate.position) || candidate.position.length !== 2) return false
  const [lng, lat] = candidate.position
  if (typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180) return false
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) return false
  return true
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

  const seenIds = new Set<string>()
  return parsed.filter((place): place is SavedPlace => {
    if (typeof place !== 'object' || place === null) return false
    const candidate = place as Partial<SavedPlace>
    if (!isValidPlace(candidate)) return false
    // First entry wins a duplicate id — later ones lose the collision
    // deterministically instead of clobbering whichever the array visits last.
    if (seenIds.has(candidate.id)) return false
    seenIds.add(candidate.id)
    return true
  })
}

function read(): SavedPlace[] {
  try {
    migrateLegacyUnversionedStorage()
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
