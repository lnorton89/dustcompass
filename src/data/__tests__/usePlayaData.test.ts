/**
 * @vitest-environment jsdom
 */
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayaData } from '../usePlayaData'

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
 * `usePlayaData` classifies its optional fetches by how much it matters if
 * they fail: toilets/services/dates are safety- or schedule-relevant and
 * should be reported, not silently swapped for empty data; camp block
 * outlines are cosmetic and stay silent.
 */
describe('usePlayaData · partial-data warnings', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
  afterEach(() => vi.unstubAllGlobals())

  const mockFetch = (failing: Set<string>) =>
    vi.fn((url: string) => {
      if ([...failing].some((path) => url.endsWith(path))) return notFound()
      if (url.endsWith('layout.json')) return ok(LAYOUT)
      if (url.endsWith('art.json')) return ok([])
      if (url.endsWith('camp.json')) return ok([])
      if (url.endsWith('event.json')) return ok([])
      if (url.endsWith('cpns.geojson')) return ok({ type: 'FeatureCollection', features: [] })
      if (url.endsWith('toilets.geojson')) return ok({ type: 'FeatureCollection', features: [] })
      if (url.endsWith('dates_info.json')) return ok({})
      if (url.endsWith('city_blocks.geojson')) return ok({ type: 'FeatureCollection', features: [] })
      throw new Error(`unexpected fetch: ${url}`)
    })

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
