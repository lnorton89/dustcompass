import { useCallback, useEffect, useState } from 'react'

const KEY = 'playa-map.favorites.v1'

function read(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
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
