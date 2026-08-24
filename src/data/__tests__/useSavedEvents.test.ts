/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseSavedEvents, useSavedEvents, type SavedEvent } from '../useSavedEvents'
import type { EventItem } from '../types'

const event: EventItem = {
  uid: 'evt-1',
  title: 'Sunrise Yoga',
  event_id: 1,
  year: 2026,
  occurrence_set: [{ start_time: '2026-08-30T07:00:00-07:00', end_time: '2026-08-30T08:00:00-07:00' }],
}

describe('recovering saved events from storage', () => {
  const valid: SavedEvent = { uid: 'evt-1', title: 'Sunrise Yoga', savedAt: 1_700_000_000_000 }

  it('reads back what was written', () => {
    expect(parseSavedEvents(JSON.stringify([valid]))).toEqual([valid])
  })

  it('treats nothing stored as no saved events', () => {
    expect(parseSavedEvents(null)).toEqual([])
    expect(parseSavedEvents('')).toEqual([])
  })

  /**
   * A truncated write is the realistic corruption here — the phone dies
   * mid-save. Losing the file is acceptable; crashing the schedule is not.
   */
  it('survives truncated or invalid JSON', () => {
    expect(parseSavedEvents('[{"uid":"evt-1","title":"Sun')).toEqual([])
    expect(parseSavedEvents('not json at all')).toEqual([])
  })

  it('ignores a stored value that is not a list', () => {
    expect(parseSavedEvents('{"savedEvents":[]}')).toEqual([])
    expect(parseSavedEvents('42')).toEqual([])
  })

  it('keeps the good entries and drops only the broken ones', () => {
    const stored = JSON.stringify([
      valid,
      { uid: 'no-title' },
      { ...valid, uid: 'bad-title', title: 42 },
      { ...valid, uid: 'no-saved-at', savedAt: undefined },
      { ...valid, uid: 'nan-saved-at', savedAt: Number.NaN },
      { ...valid, uid: '' },
      { ...valid, uid: '   ' },
      { ...valid, uid: 'blank-title', title: '   ' },
      null,
      'a string',
      { ...valid, uid: 'second' },
    ])
    expect(parseSavedEvents(stored).map((e) => e.uid)).toEqual(['evt-1', 'second'])
  })

  /**
   * Duplicate uids are a realistic corruption path — e.g. two tabs writing at
   * once — and they cannot both reach the caller. The first entry wins
   * deterministically.
   */
  it('de-duplicates repeated uids, keeping the first', () => {
    const stored = JSON.stringify([
      { ...valid, title: 'First write' },
      { ...valid, title: 'Second write' },
    ])
    const result = parseSavedEvents(stored)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('First write')
  })
})

describe('saving and unsaving an event', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips a save and remove', () => {
    const { result } = renderHook(() => useSavedEvents())
    expect(result.current.isSaved(event.uid)).toBe(false)

    act(() => result.current.save(event))
    expect(result.current.isSaved(event.uid)).toBe(true)
    expect(result.current.savedEvents).toHaveLength(1)
    expect(result.current.savedEvents[0].uid).toBe(event.uid)
    expect(result.current.savedEvents[0].title).toBe(event.title)

    act(() => result.current.remove(event.uid))
    expect(result.current.isSaved(event.uid)).toBe(false)
    expect(result.current.savedEvents).toEqual([])
  })

  it('does not save the same event twice', () => {
    const { result } = renderHook(() => useSavedEvents())
    act(() => result.current.save(event))
    act(() => result.current.save(event))
    expect(result.current.savedEvents).toHaveLength(1)
  })
})

/**
 * Storage is keyed by DATA_YEAR, so each test here re-imports the hook after
 * mocking config for a given year — the key is baked in at module load, the
 * same way it would be baked into a real per-year build.
 */
describe('scoping saved events to the data year', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('does not carry a prior-year saved event into a different DATA_YEAR build', async () => {
    vi.doMock('../../config', () => ({ DATA_YEAR: '2025' }))
    const { useSavedEvents: useSavedEvents2025 } = await import('../useSavedEvents')
    const { result: result2025 } = renderHook(() => useSavedEvents2025())
    act(() => result2025.current.save(event))
    expect(result2025.current.savedEvents).toHaveLength(1)

    vi.resetModules()
    vi.doMock('../../config', () => ({ DATA_YEAR: '2026' }))
    const { useSavedEvents: useSavedEvents2026 } = await import('../useSavedEvents')
    const { result: result2026 } = renderHook(() => useSavedEvents2026())

    expect(result2026.current.savedEvents).toEqual([])
  })

  it('persists a current-year save across a reload', async () => {
    vi.doMock('../../config', () => ({ DATA_YEAR: '2026' }))
    const { useSavedEvents: useSavedEventsBeforeReload } = await import('../useSavedEvents')
    const { result: before } = renderHook(() => useSavedEventsBeforeReload())
    act(() => before.current.save(event))

    vi.resetModules()
    vi.doMock('../../config', () => ({ DATA_YEAR: '2026' }))
    const { useSavedEvents: useSavedEventsAfterReload } = await import('../useSavedEvents')
    const { result: after } = renderHook(() => useSavedEventsAfterReload())

    expect(after.current.savedEvents).toHaveLength(1)
    expect(after.current.savedEvents[0].uid).toBe(event.uid)
    expect(after.current.savedEvents[0].title).toBe(event.title)
  })
})
