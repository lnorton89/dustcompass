/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_SAVED_PLACE_NAME_LENGTH,
  normalizeSavedPlaceName,
  parsePlaces,
  useSavedPlaces,
  type SavedPlace,
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

function findStorageKey(prefix: string): string {
  const key = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .find((candidate) => candidate?.startsWith(prefix))
  if (!key) throw new Error(`missing storage key ${prefix}`)
  return key
}

describe('saved-place write/read invariant (#161)', () => {
  beforeEach(() => localStorage.clear())

  it.each([199, 200, 201])('round-trips a %i-character requested name safely', (length) => {
    const requested = 'x'.repeat(length)
    const { result } = renderHook(() => useSavedPlaces())
    let created: SavedPlace | undefined
    act(() => {
      created = result.current.save(requested, [-119.2, 40.78], '6:00 & A').place
    })
    if (!created) throw new Error('save did not create a place')
    expect(created.name.length).toBe(Math.min(length, MAX_SAVED_PLACE_NAME_LENGTH))
    expect(created.name).toBe(normalizeSavedPlaceName(requested))
    expect(parsePlaces(localStorage.getItem(findStorageKey('playa-map.places.v1.')))).toContainEqual(created)
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
    if (!saved) throw new Error('event did not save')
    expect(saved.title).toBe(event.title)
    expect(saved.eventId).toBe(event.event_id)
    expect(parseSavedEvents(localStorage.getItem(findStorageKey('playa-map.saved-events.v1.')))).toContainEqual(saved)
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

describe('favorites annual isolation and storage validation (#163)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('accepts only non-empty string uids', () => {
    expect(parseFavorites(JSON.stringify(['camp-1', '', '  ', 42, null, 'art-2']))).toEqual(
      new Set(['camp-1', 'art-2']),
    )
  })

  it('rejects malformed and non-array storage', () => {
    expect(parseFavorites('not json')).toEqual(new Set())
    expect(parseFavorites('{"uid":"camp-1"}')).toEqual(new Set())
  })

  it('does not apply a year-A favorite to year B even when the uid is reused, and restores it on return to year A', async () => {
    vi.doMock('../../config', () => ({ DATA_YEAR: '2025' }))
    const { useFavorites: useFavorites2025 } = await import('../useFavorites')
    const first = renderHook(() => useFavorites2025())
    act(() => first.result.current.toggle('same-uid'))
    expect(first.result.current.isFavorite('same-uid')).toBe(true)
    first.unmount()

    vi.resetModules()
    vi.doMock('../../config', () => ({ DATA_YEAR: '2026' }))
    const { useFavorites: useFavorites2026 } = await import('../useFavorites')
    const second = renderHook(() => useFavorites2026())
    expect(second.result.current.isFavorite('same-uid')).toBe(false)
    second.unmount()

    vi.resetModules()
    vi.doMock('../../config', () => ({ DATA_YEAR: '2025' }))
    const { useFavorites: useFavorites2025Again } = await import('../useFavorites')
    const returned = renderHook(() => useFavorites2025Again())
    expect(returned.result.current.isFavorite('same-uid')).toBe(true)
    returned.unmount()
  })
})
