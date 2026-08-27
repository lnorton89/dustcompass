import { useCallback, useRef, useState } from 'react'
import { DATA_YEAR } from '../config'
import type { EventItem } from './types'

const KEY = `playa-map.saved-events.v1.${DATA_YEAR}`

export interface SavedEvent {
  uid: string
  title: string
  savedAt: number
  /** Stable upstream numeric identity used to detect uid reuse after refresh. */
  eventId?: number
}

function isValidSavedEvent(candidate: Partial<SavedEvent>): candidate is SavedEvent {
  if (typeof candidate.uid !== 'string' || candidate.uid.trim().length === 0) return false
  // Titles are display metadata, not storage identity. Do not impose a
  // persistence-only length limit that upstream data does not share (#162).
  if (typeof candidate.title !== 'string' || candidate.title.trim().length === 0) return false
  if (typeof candidate.savedAt !== 'number' || !Number.isFinite(candidate.savedAt)) return false
  return candidate.eventId === undefined || (typeof candidate.eventId === 'number' && Number.isFinite(candidate.eventId))
}

export function parseSavedEvents(raw: string | null): SavedEvent[] {
  if (!raw) return []
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return [] }
  if (!Array.isArray(parsed)) return []
  const seenUids = new Set<string>()
  return parsed.filter((entry): entry is SavedEvent => {
    if (typeof entry !== 'object' || entry === null) return false
    const candidate = entry as Partial<SavedEvent>
    if (!isValidSavedEvent(candidate) || seenUids.has(candidate.uid)) return false
    seenUids.add(candidate.uid)
    return true
  })
}

/**
 * Reconcile a persisted bookmark with live data without letting a reused uid
 * silently transfer user intent to another event (#164). New saves carry the
 * stable numeric event_id. Legacy saves fall back to exact title continuity;
 * ambiguity degrades to the existing stale row rather than guessing.
 */
export function savedEventMatches(saved: SavedEvent, event: EventItem): boolean {
  if (saved.uid !== event.uid) return false
  return saved.eventId !== undefined ? saved.eventId === event.event_id : saved.title === event.title
}

function read(): SavedEvent[] {
  try { return parseSavedEvents(localStorage.getItem(KEY)) } catch { return [] }
}

function persist(events: SavedEvent[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(events))
    return true
  } catch {
    return false
  }
}

/** Keep the in-memory mutation even when durable storage fails, but report it. */
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
      : [{ uid: event.uid, title: event.title, eventId: event.event_id, savedAt: Date.now() }, ...savedEventsRef.current]
    return commit(next)
  }, [commit])

  const remove = useCallback((uid: string): boolean => {
    return commit(savedEventsRef.current.filter((item) => item.uid !== uid))
  }, [commit])

  const isSaved = useCallback((uid: string) => savedEvents.some((item) => item.uid === uid), [savedEvents])
  return { savedEvents, isSaved, save, remove }
}
