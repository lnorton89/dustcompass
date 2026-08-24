/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayaData } from '../usePlayaData'
import { BRC_2026 } from '../embargo'
import type { ArtItem, CampItem } from '../types'

const LAYOUT = {
  center: {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates: [-119.2, 40.78] },
  },
  bearing: 45,
  fence_distance: 10560,
  road_width: 40,
  cStreets: [],
  tStreets: [],
  plazas: [],
  portals: [],
}

const ok = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: async () => body }) as Promise<Response>

const notFound = () =>
  Promise.resolve({ ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) }) as Promise<Response>

/**
 * Shared by every describe block below: a `fetch` mock covering the full set
 * of paths `usePlayaData` requests, with `art`/`camp` payloads overridable so
 * the embargo-transition tests can use fixtures with real locations instead
 * of the empty arrays the partial-data tests only need.
 */
const mockFetch = (failing: Set<string>, overrides: { art?: ArtItem[]; camps?: CampItem[] } = {}) =>
  vi.fn((url: string) => {
    if ([...failing].some((path) => url.endsWith(path))) return notFound()
    if (url.endsWith('layout.json')) return ok(LAYOUT)
    if (url.endsWith('art.json')) return ok(overrides.art ?? [])
    if (url.endsWith('camp.json')) return ok(overrides.camps ?? [])
    if (url.endsWith('event.json')) return ok([])
    if (url.endsWith('cpns.geojson')) return ok({ type: 'FeatureCollection', features: [] })
    if (url.endsWith('toilets.geojson')) return ok({ type: 'FeatureCollection', features: [] })
    if (url.endsWith('dates_info.json')) return ok({})
    if (url.endsWith('city_blocks.geojson')) return ok({ type: 'FeatureCollection', features: [] })
    throw new Error(`unexpected fetch: ${url}`)
  })

/**
 * `usePlayaData` classifies its optional fetches by how much it matters if
 * they fail: toilets/services/dates are safety- or schedule-relevant and
 * should be reported, not silently swapped for empty data; camp block
 * outlines are cosmetic and stay silent.
 */
describe('usePlayaData · partial-data warnings', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
  afterEach(() => vi.unstubAllGlobals())

  it('reports no warnings when everything loads', async () => {
    vi.stubGlobal('fetch', mockFetch(new Set()))
    const { result } = renderHook(() => usePlayaData())
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.partialDataWarnings).toEqual([])
  })

  it('flags a failed toilets fetch instead of silently showing zero toilets', async () => {
    vi.stubGlobal('fetch', mockFetch(new Set(['data/2026/toilets.geojson'])))
    const { result } = renderHook(() => usePlayaData())
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.partialDataWarnings).toEqual(['toilets'])
    // The map still opens with an (empty) toilets layer rather than blocking.
    expect(result.current.data?.toilets.features).toEqual([])
    expect(result.current.error).toBeUndefined()
  })

  it('flags failed services and dates together', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(new Set(['data/2026/cpns.geojson', 'data/2026/dates_info.json'])),
    )
    const { result } = renderHook(() => usePlayaData())
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.partialDataWarnings.sort()).toEqual(['dates', 'services'])
  })

  it('does not warn about a failed cosmetic city_blocks fetch', async () => {
    vi.stubGlobal('fetch', mockFetch(new Set(['data/2026/city_blocks.geojson'])))
    const { result } = renderHook(() => usePlayaData())
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.partialDataWarnings).toEqual([])
  })

  it('still hard-fails when a required dataset (camp.json) cannot load', async () => {
    vi.stubGlobal('fetch', mockFetch(new Set(['data/2026/camp.json'])))
    const { result } = renderHook(() => usePlayaData())
    await waitFor(() => expect(result.current.error).toBeDefined())
    expect(result.current.data).toBeUndefined()
  })
})

/**
 * Regression coverage for #13: embargo state used to be computed once, inside
 * the fetch effect, and never revisited — an app left open across a release
 * boundary stayed stripped/unplaced forever even though the already-fetched
 * data would show as released. These use a fake clock to cross each boundary
 * without a reload and confirm the transition happens, and happens no earlier
 * than the configured instant.
 */
describe('usePlayaData · time-reactive embargo', () => {
  const ART: ArtItem[] = [
    {
      uid: 'art-1',
      name: 'Test Art',
      year: 2026,
      location: { gps_latitude: 40.786, gps_longitude: -119.203 },
      location_string: "5:45 & 2000'",
    },
  ]

  const CAMPS: CampItem[] = [
    {
      uid: 'camp-1',
      name: 'Test Camp',
      year: 2026,
      location: { gps_latitude: 40.782, gps_longitude: -119.206 },
      location_string: '3:00 & Esplanade',
    },
  ]

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  // Flushes pending microtasks (the fetch mock's already-resolved promises)
  // by ticking the fake clock forward — `tickAsync` defers through a real
  // macrotask, so every microtask queued beforehand has settled by the time
  // it runs, whether or not `ms` itself needed to move any fake timer.
  const flush = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms))

  it('transitions camps from embargoed to released at the camp-release boundary, without a reload', async () => {
    vi.setSystemTime(new Date('2026-08-20T12:00:00-07:00')) // before BRC_2026.campRelease
    vi.stubGlobal('fetch', mockFetch(new Set(), { camps: CAMPS }))

    const { result } = renderHook(() => usePlayaData())
    await flush()

    expect(result.current.data).toBeDefined()
    expect(result.current.data?.embargo.campsReleased).toBe(false)
    expect(result.current.data?.camps[0].location_string).toBeUndefined()
    expect(result.current.data?.unplaced.some((u) => u.uid === 'camp-1')).toBe(true)
    expect(result.current.data?.pois.some((p) => p.uid === 'camp-1')).toBe(false)

    // Cross the camp-release boundary (2026-08-23) while the app stays open.
    const untilRelease = BRC_2026.campRelease.getTime() - Date.now()
    await flush(untilRelease + 1000)

    expect(result.current.data?.embargo.campsReleased).toBe(true)
    expect(result.current.data?.camps[0].location_string).toBe('3:00 & Esplanade')
    expect(result.current.data?.unplaced.some((u) => u.uid === 'camp-1')).toBe(false)
    expect(result.current.data?.pois.some((p) => p.uid === 'camp-1')).toBe(true)
  })

  it('transitions art from unplaced to placed at gates-open, without a reload', async () => {
    vi.setSystemTime(new Date('2026-08-29T12:00:00-07:00')) // after campRelease, before gatesOpen
    vi.stubGlobal('fetch', mockFetch(new Set(), { art: ART }))

    const { result } = renderHook(() => usePlayaData())
    await flush()

    expect(result.current.data?.embargo).toEqual({ campsReleased: true, artReleased: false })
    expect(result.current.data?.art[0].location_string).toBeUndefined()
    expect(result.current.data?.unplaced.some((u) => u.uid === 'art-1')).toBe(true)
    expect(result.current.data?.pois.some((p) => p.uid === 'art-1')).toBe(false)

    // Cross gates-open (2026-08-30 00:01) while the app stays open.
    const untilGates = BRC_2026.gatesOpen.getTime() - Date.now()
    await flush(untilGates + 1000)

    expect(result.current.data?.embargo).toEqual({ campsReleased: true, artReleased: true })
    expect(result.current.data?.art[0].location_string).toBe("5:45 & 2000'")
    expect(result.current.data?.pois.some((p) => p.uid === 'art-1')).toBe(true)
    expect(result.current.data?.unplaced.some((u) => u.uid === 'art-1')).toBe(false)
  })

  it('carries a session through both boundaries in sequence', async () => {
    vi.setSystemTime(new Date('2026-08-20T12:00:00-07:00')) // before both boundaries
    vi.stubGlobal('fetch', mockFetch(new Set(), { art: ART, camps: CAMPS }))

    const { result } = renderHook(() => usePlayaData())
    await flush()
    expect(result.current.data?.embargo).toEqual({ campsReleased: false, artReleased: false })

    await flush(BRC_2026.campRelease.getTime() - Date.now() + 1000)
    expect(result.current.data?.embargo).toEqual({ campsReleased: true, artReleased: false })
    expect(result.current.data?.pois.some((p) => p.uid === 'camp-1')).toBe(true)
    expect(result.current.data?.pois.some((p) => p.uid === 'art-1')).toBe(false)

    await flush(BRC_2026.gatesOpen.getTime() - Date.now() + 1000)
    expect(result.current.data?.embargo).toEqual({ campsReleased: true, artReleased: true })
    expect(result.current.data?.pois.some((p) => p.uid === 'art-1')).toBe(true)
  })

  it('never reveals data before the configured release instant', async () => {
    vi.setSystemTime(new Date('2026-08-22T23:59:00-07:00')) // one minute before campRelease
    vi.stubGlobal('fetch', mockFetch(new Set(), { camps: CAMPS }))

    const { result } = renderHook(() => usePlayaData())
    await flush()
    expect(result.current.data?.embargo.campsReleased).toBe(false)

    // Advance to just short of the boundary — must still be withheld.
    await flush(59_000)
    expect(result.current.data?.embargo.campsReleased).toBe(false)
    expect(result.current.data?.camps[0].location_string).toBeUndefined()
    expect(result.current.data?.unplaced.some((u) => u.uid === 'camp-1')).toBe(true)

    // The remaining second crosses it.
    await flush(1000)
    expect(result.current.data?.embargo.campsReleased).toBe(true)
    expect(result.current.data?.camps[0].location_string).toBe('3:00 & Esplanade')
  })

  it('schedules no timer once everything is already released', async () => {
    vi.setSystemTime(new Date('2026-08-31T00:00:00-07:00')) // after gates-open
    vi.stubGlobal('fetch', mockFetch(new Set(), { art: ART, camps: CAMPS }))

    const { result } = renderHook(() => usePlayaData())
    await flush()

    expect(result.current.data?.embargo).toEqual({ campsReleased: true, artReleased: true })
    expect(vi.getTimerCount()).toBe(0)
  })
})
