/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CityLayout } from '../../brc/layout'
import { usePlayaData } from '../usePlayaData'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function response(body: unknown): Response {
  return { ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve(body) } as Response
}

function layout(centerLng: number): CityLayout {
  return {
    center: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [centerLng, 40.78] } },
    bearing: 45,
    fence_distance: 10560,
    road_width: 40,
    cStreets: [],
    tStreets: [],
    plazas: [],
    portals: [],
  }
}

describe('usePlayaData reload supersession (#167)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    // @ts-expect-error test-only service worker cleanup
    delete navigator.serviceWorker
  })

  it('keeps the later DATA_REFRESHED load when an older load resolves last', async () => {
    const layoutA = deferred<Response>()
    const layoutB = deferred<Response>()
    let call = 0
    const fetchMock = vi.fn((url: string) => {
      const batch = Math.floor(call / 8)
      call += 1
      if (url.endsWith('layout.json')) return batch === 0 ? layoutA.promise : layoutB.promise
      if (url.endsWith('art.json') || url.endsWith('camp.json') || url.endsWith('event.json')) {
        return Promise.resolve(response([]))
      }
      if (url.endsWith('dates_info.json')) return Promise.resolve(response({}))
      if (url.endsWith('.geojson')) {
        return Promise.resolve(response({ type: 'FeatureCollection', features: [] }))
      }
      throw new Error(`unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const serviceWorker = new EventTarget()
    Object.defineProperty(navigator, 'serviceWorker', { value: serviceWorker, configurable: true })

    const { result } = renderHook(() => usePlayaData())
    expect(fetchMock).toHaveBeenCalledTimes(8)

    act(() => {
      serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'DATA_REFRESHED' } }))
    })
    expect(fetchMock).toHaveBeenCalledTimes(16)

    await act(async () => layoutB.resolve(response(layout(-119.25))))
    await waitFor(() => expect(result.current.data?.layout.center.geometry.coordinates[0]).toBe(-119.25))

    await act(async () => layoutA.resolve(response(layout(-119.15))))
    await act(async () => {})

    // Older A finishes last but cannot regress visible state after B won.
    expect(result.current.data?.layout.center.geometry.coordinates[0]).toBe(-119.25)
  })
})
