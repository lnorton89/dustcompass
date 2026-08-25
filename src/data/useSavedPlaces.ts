import { useCallback, useRef, useState } from 'react'
import type { Position } from '../brc/geo'
import { DATA_YEAR } from '../config'

const KEY_PREFIX = 'playa-map.places.v1'
const KEY = `${KEY_PREFIX}.${DATA_YEAR}`
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

export interface SavedPlaceResult {
  place: SavedPlace
  persisted: boolean
}

const MAX_NAME_LENGTH = 200

function isValidPlace(candidate: Partial<SavedPlace>): candidate is SavedPlace {
  if (typeof candidate.id !== 'string' || candidate.id.trim().length === 0) return false
  if (
    typeof candidate.name !== 'string' ||
    candidate.name.trim().length === 0 ||
    candidate.name.length > MAX_NAME_LENGTH
  ) return false
  if (typeof candidate.address !== 'string') return false
  if (typeof candidate.savedAt !== 'number' || !Number.isFinite(candidate.savedAt)) return false
  if (!Array.isArray(candidate.position) || candidate.position.length !== 2) return false
  const [lng, lat] = candidate.position
  if (typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180) return false
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) return false
  return true
}

export function parsePlaces(raw: string | null): SavedPlace[] {
  if (!raw) return []
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return [] }
  if (!Array.isArray(parsed)) return []
  const seenIds = new Set<string>()
  return parsed.filter((place): place is SavedPlace => {
    if (typeof place !== 'object' || place === null) return false
    const candidate = place as Partial<SavedPlace>
    if (!isValidPlace(candidate) || seenIds.has(candidate.id)) return false
    seenIds.add(candidate.id)
    return true
  })
}

function read(): SavedPlace[] {
  try {
    migrateLegacyUnversionedStorage()
    return parsePlaces(localStorage.getItem(KEY))
  } catch {
    return []
  }
}

function persist(places: SavedPlace[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(places))
    return true
  } catch {
    return false
  }
}

export function useSavedPlaces() {
  const [places, setPlaces] = useState<SavedPlace[]>(read)
  const placesRef = useRef(places)

  const commit = useCallback((next: SavedPlace[]): boolean => {
    const persisted = persist(next)
    placesRef.current = next
    setPlaces(next)
    return persisted
  }, [])

  const save = useCallback((name: string, position: Position, address: string): SavedPlaceResult => {
    const place: SavedPlace = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      position,
      address,
      savedAt: Date.now(),
    }
    return { place, persisted: commit([place, ...placesRef.current]) }
  }, [commit])

  const remove = useCallback((id: string): boolean => {
    return commit(placesRef.current.filter((place) => place.id !== id))
  }, [commit])

  const restore = useCallback((place: SavedPlace): boolean => {
    const next = placesRef.current.some((item) => item.id === place.id)
      ? placesRef.current
      : [place, ...placesRef.current]
    return commit(next)
  }, [commit])

  const rename = useCallback((id: string, name: string): boolean => {
    return commit(placesRef.current.map((place) => (place.id === id ? { ...place, name } : place)))
  }, [commit])

  return { places, save, remove, restore, rename }
}
