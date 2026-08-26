import { useCallback, useEffect, useState } from 'react'
import { DATA_YEAR } from '../config'

const KEY = `playa-map.favorites.v1.${DATA_YEAR}`

export function parseFavorites(raw: string | null): Set<string> {
  if (!raw) return new Set()
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))
  } catch {
    return new Set()
  }
}

function read(): Set<string> {
  try {
    return parseFavorites(localStorage.getItem(KEY))
  } catch {
    // Private windows and blocked site data both throw here. Favourites are a
    // convenience, so degrade to in-memory rather than breaking the map.
    return new Set()
  }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(read)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify([...favorites]))
    } catch {
      /* nothing to do — see read() */
    }
  }, [favorites])

  const toggle = useCallback((uid: string) => {
    setFavorites((current) => {
      const next = new Set(current)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })
  }, [])

  return { favorites, toggle, isFavorite: (uid: string) => favorites.has(uid) }
}
