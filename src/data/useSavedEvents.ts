import { useCallback, useRef, useState } from 'react'
import { DATA_YEAR } from '../config'
import type { EventItem } from './types'

const KEY = `playa-map.saved-events.v1.${DATA_YEAR}`

export interface SavedEvent {
  uid: string
  title: string
  savedAt: number
}

const MAX_TITLE_LENGTH = 300

function isValidSavedEvent(candidate: Partial<SavedEvent>): candidate is SavedEvent {
  if (typeof candidate.uid !== 'string' || candidate.uid.trim().length === 0) return false
  if (
    typeof candidate.title !== 'string' ||
    candidate.title.trim().length === 0 ||
    candidate.title.length > MAX_TITLE_LENGTH
  ) {
    return false
  }
  if (typeof candidate.savedAt !== 'number' || !Number.isFinite(candidate.savedAt)) return false
  return true
}

export function parseSavedEvents(raw: string | null): SavedEvent[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  const seenUids = new Set<string>()
  return parsed.filter((entry): entry is SavedEvent => {
    if (typeof entry !== 'object' || entry === null) return false
    const candidate = entry as Partial<SavedEvent>
    if (!isValidSavedEvent(candidate)) return false
    if (seenUids.has(candidate.uid)) return false
    seenUids.add(candidate.uid)
    return true
  })
}

function read(): SavedEvent[] {
  try {
    return parseSavedEvents(localStorage.getItem(KEY))
  } catch {
    return []
  }
}

function persist(events: SavedEvent[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(events))
    return true
  } catch {
    return false
  }
}

/**
 * Mutations synchronously attempt their durable write and return its result.
 * State still changes when storage is unavailable so the current session can
 * keep working, but callers can no longer present that fallback as durable.
 */
export function useSavedEvents() {
  const [savedEvents, setSavedEvents] = useState<SavedEvent[]>(read)
  const savedEventsRef = useRef(savedEvents)

  const commit = useCallback((next: SavedEvent[]): boolean => {
    const persisted = persist(next)
    savedEventsRef.current = next
    setSavedEvents(next)
    return persisted
  }, [])

  const save = useCallback((event: EventItem): boolean => {
    const next = savedEventsRef.current.some((item) => item.uid === event.uid)
      ? savedEventsRef.current
      : [{ uid: event.uid, title: event.title, savedAt: Date.now() }, ...savedEventsRef.current]
    return commit(next)
  }, [commit])

  const remove = useCallback((uid: string): boolean => {
    return commit(savedEventsRef.current.filter((item) => item.uid !== uid))
  }, [commit])

  const isSaved = useCallback(
    (uid: string) => savedEvents.some((item) => item.uid === uid),
    [savedEvents],
  )

  return { savedEvents, isSaved, save, remove }
}
