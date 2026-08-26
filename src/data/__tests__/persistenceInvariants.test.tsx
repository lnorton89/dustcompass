/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_SAVED_PLACE_NAME_LENGTH,
  normalizeSavedPlaceName,
  parsePlaces,
  useSavedPlaces,
} from '../useSavedPlaces'
import {
  parseSavedEvents,
  savedEventMatches,
  useSavedEvents,
} from '../useSavedEvents'
import { parseFavorites } from '../useFavorites'
import type { EventItem } from '../types'

const makeEvent = (title: string, eventId = 42): EventItem => ({
  uid: 'evt-boundary',
  title,
  event_id: eventId,
  year: 2026,
  occurrence_set: [{ start_time: '2026-08-30T12:00:00-07:00', end_time: '2026-08-30T13:00:00-07:00' }],
})

describe('saved-place write/read invariant (#161)', () => {
  beforeEach(() => localStorage.clear())

  it.each([199, 200, 201])('round-trips a %i-character requested name safely', (length) => {
    const requested = 'x'.repeat(length)
    const { result } = renderHook(() => useSavedPlaces())
    let created = result.current.places[0]
    act(() => {
      created = result.current.save(requested, [-119.2, 40.78], '6:00 & A').place
    })
    expect(created.name.length).toBe(Math.min(length, MAX_SAVED_PLACE_NAME_LENGTH))
    expect(created.name).toBe(normalizeSavedPlaceName(requested))

    const stored = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .find((key) => key?.startsWith('playa-map.places.v1.'))
    expect(stored).toBeDefined()
    expect(parsePlaces(localStorage.getItem(stored!))).toContainEqual(created)
  })
})

describe('saved-event write/read and identity invariants (#162/#164)', () => {
  beforeEach(() => localStorage.clear())

  it.each([299, 300, 301, 1000])('keeps a valid %i-character event title durable', (length) => {
    const event = makeEvent('t'.repeat(length))
    const { result } = renderHook(() => useSavedEvents())
    act(() => {
      expect(result.current.save(event)).toBe(true)
    })
    const saved = result.current.savedEvents[0]
    expect(saved.title).toBe(event.title)
    expect(saved.eventId).toBe(event.event_id)

    const stored = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .find((key) => key?.startsWith('playa-map.saved-events.v1.'))
    expect(stored).toBeDefined()
    expect(parseSavedEvents(localStorage.getItem(stored!))).toContainEqual(saved)
  })

  it('accepts a normal update to the same event identity and rejects uid reuse', () => {
    const saved = { uid: 'evt-boundary', title: 'Original title', savedAt: 1, eventId: 42 }
    expect(savedEventMatches(saved, makeEvent('Updated title', 42))).toBe(true)
    expect(savedEventMatches(saved, makeEvent('Unrelated replacement', 99))).toBe(false)
  })

  it('keeps legacy bookmarks conservative when only uid and title are available', () => {
    const legacy = { uid: 'evt-boundary', title: 'Original title', savedAt: 1 }
    expect(savedEventMatches(legacy, makeEvent('Original title', 99))).toBe(true)
    expect(savedEventMatches(legacy, makeEvent('Different title', 99))).toBe(false)
  })
})

describe('favorite storage validation (#163)', () => {
  it('accepts only non-empty string uids', () => {
    expect(parseFavorites(JSON.stringify(['camp-1', '', '  ', 42, null, 'art-2']))).toEqual(
      new Set(['camp-1', 'art-2']),
    )
  })

  it('rejects malformed and non-array storage', () => {
    expect(parseFavorites('not json')).toEqual(new Set())
    expect(parseFavorites('{"uid":"camp-1"}')).toEqual(new Set())
  })
})
