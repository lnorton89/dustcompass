import { useCallback, useEffect, useState } from 'react'
import { DATA_YEAR } from '../config'
import type { EventItem } from './types'

// Storage is scoped per data year, same reasoning as useSavedPlaces: a saved
// uid from a prior year's listings API is not safe to assume still means the
// same event, or to render against this year's `data.events` at all. Keying
// by year means a build for a new DATA_YEAR simply starts with an empty
// saved schedule instead of showing last year's uids as this year's events.
const KEY = `playa-map.saved-events.v1.${DATA_YEAR}`

export interface SavedEvent {
  /** EventItem.uid. Saved semantics are whole-event, not per-occurrence —
   *  see the comment on `useSavedEvents` below. */
  uid: string
  /**
   * Snapshotted at save time, not looked up live, so a saved-schedule row can
   * still show a name if the event later disappears from `data.events`
   * entirely (deleted, cancelled, or replaced in a data refresh).
   */
  title: string
  savedAt: number
}

// Generous cap, not a UI limit — it exists so a corrupted write can't turn
// into an unbounded string that has to be carried through storage and render.
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

/**
 * Anything written by an older build, hand-edited, or truncated mid-write is
 * dropped rather than allowed to crash the schedule view. Exported so the
 * salvage behaviour can be tested directly.
 */
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
    // First entry wins a duplicate uid — later ones lose the collision
    // deterministically instead of clobbering whichever the array visits last.
    if (seenUids.has(candidate.uid)) return false
    seenUids.add(candidate.uid)
    return true
  })
}

function read(): SavedEvent[] {
  try {
    return parseSavedEvents(localStorage.getItem(KEY))
  } catch {
    // Reading site data can throw outright in a private window.
    return []
  }
}

/**
 * A personal schedule, built entirely from local data.events — no network
 * dependency, so it works exactly as well off-grid as the map does.
 *
 * Save semantics are whole-event, by `EventItem.uid`, not a specific
 * occurrence: `Occurrence` carries no id of its own (just start/end times),
 * and every other part of the app that needs "which showing of this event is
 * relevant right now" already answers that with `relevantOccurrence(event,
 * now)` from `./events` rather than storing an occurrence identity anywhere.
 * Saving "Thursday's showing" as a separate thing from "the event" would
 * require inventing an occurrence id nothing else in the codebase has: the
 * saved-schedule view instead renders each saved event's current/next
 * showing the same way `EventDetail` and hosted-event rows already do.
 *
 * The `title` snapshot is what lets a saved-schedule row survive an event
 * that no longer exists in a later data refresh: `data.events` is looked up
 * by uid at render time, and a uid with no match renders as its snapshotted
 * title in a "no longer listed" state instead of crashing or, worse, quietly
 * resolving to a different event that happens to reuse the uid string.
 */
export function useSavedEvents() {
  const [savedEvents, setSavedEvents] = useState<SavedEvent[]>(read)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(savedEvents))
    } catch {
      /* private window or blocked site data — keep working in memory */
    }
  }, [savedEvents])

  const save = useCallback((event: EventItem) => {
    setSavedEvents((current) =>
      current.some((item) => item.uid === event.uid)
        ? current
        : [{ uid: event.uid, title: event.title, savedAt: Date.now() }, ...current],
    )
  }, [])

  const remove = useCallback((uid: string) => {
    setSavedEvents((current) => current.filter((item) => item.uid !== uid))
  }, [])

  const isSaved = useCallback(
    (uid: string) => savedEvents.some((item) => item.uid === uid),
    [savedEvents],
  )

  return { savedEvents, isSaved, save, remove }
}
