/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ACTIVE_FILTERS_KEY,
  CITY_UP_KEY,
  isThemeMode,
  MODE_KEY,
  readStored,
  readStoredFilters,
} from '../App'

/**
 * Theme mode, orientation and the active filter set persist across a reload
 * so night mode — a functional night-vision feature, not decoration — does
 * not silently reset. `readStored`/`readStoredFilters` are the corruption
 * boundary: a hand-edited or truncated value should lose the preference, not
 * the map, matching the same philosophy already applied to saved places.
 */
describe('persisted preferences', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('falls back to the default when nothing is stored', () => {
    expect(readStored(MODE_KEY, isThemeMode, 'dark')).toBe('dark')
  })

  it('reads back a validly stored theme mode', () => {
    localStorage.setItem(MODE_KEY, JSON.stringify('night'))
    expect(readStored(MODE_KEY, isThemeMode, 'dark')).toBe('night')
  })

  it('falls back on a value outside the valid set', () => {
    localStorage.setItem(MODE_KEY, JSON.stringify('purple'))
    expect(readStored(MODE_KEY, isThemeMode, 'dark')).toBe('dark')
  })

  it('falls back on unparseable JSON rather than throwing', () => {
    localStorage.setItem(CITY_UP_KEY, '{not json')
    expect(() => readStored(CITY_UP_KEY, (v): v is boolean => typeof v === 'boolean', true)).not.toThrow()
    expect(readStored(CITY_UP_KEY, (v): v is boolean => typeof v === 'boolean', true)).toBe(true)
  })

  it('reads back the active filter set', () => {
    localStorage.setItem(ACTIVE_FILTERS_KEY, JSON.stringify(['art', 'toilets']))
    expect(readStoredFilters()).toEqual(new Set(['art', 'toilets']))
  })

  it('defaults when nothing is stored', () => {
    expect(readStoredFilters()).toEqual(new Set(['art', 'camp', 'toilets', 'services']))
  })

  it('respects a deliberately empty filter set rather than resetting to defaults', () => {
    localStorage.setItem(ACTIVE_FILTERS_KEY, JSON.stringify([]))
    expect(readStoredFilters()).toEqual(new Set())
  })

  it('treats an array of only invalid keys as corruption and falls back to defaults', () => {
    localStorage.setItem(ACTIVE_FILTERS_KEY, JSON.stringify(['not-a-real-filter', 42]))
    expect(readStoredFilters()).toEqual(new Set(['art', 'camp', 'toilets', 'services']))
  })

  it('drops unrecognized entries while keeping the valid ones', () => {
    localStorage.setItem(ACTIVE_FILTERS_KEY, JSON.stringify(['camp', 'not-a-real-filter']))
    expect(readStoredFilters()).toEqual(new Set(['camp']))
  })

  it('falls back to defaults on malformed JSON', () => {
    localStorage.setItem(ACTIVE_FILTERS_KEY, '{not json')
    expect(readStoredFilters()).toEqual(new Set(['art', 'camp', 'toilets', 'services']))
  })
})
