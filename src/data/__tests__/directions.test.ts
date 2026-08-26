import { describe, expect, it } from 'vitest'
import { DATA_YEAR } from '../../config'
import {
  defaultDirectionsOrigin,
  directionsUrl,
  readDirectionsIntent,
  readDirectionsResult,
  type DirectionsIntent,
} from '../directions'

// Shared route parsing is a trust boundary: rejected annual/schema links must
// remain distinguishable from an ordinary root-map load (#151).
describe('directions share links', () => {
  it('round-trips dynamic live-location routes without leaking a coordinate', () => {
    const intent: DirectionsIntent = { version: 1, from: { kind: 'live' }, to: { kind: 'poi', uid: 'camp-123' }, mode: 'walk' }
    const url = directionsUrl(intent, 'https://example.test/dustcompass/?poi=old')
    const parsed = new URL(url)
    expect(parsed.searchParams.get('year')).toBe(String(DATA_YEAR))
    expect(parsed.searchParams.get('from')).toBe('live')
    expect(parsed.search).not.toContain('119.')
    expect(readDirectionsIntent(parsed.search)).toEqual(intent)
    expect(readDirectionsResult(parsed.search)).toEqual({ status: 'resolved', intent })
  })

  it('round-trips an explicitly fixed point-to-point route', () => {
    const intent: DirectionsIntent = {
      version: 1,
      from: { kind: 'fixed', label: 'Bike rack', position: [-119.2012344, 40.7712344] },
      to: { kind: 'address', address: '7:30 & Esplanade', position: [-119.2056784, 40.7798764] },
      mode: 'bike',
    }
    const url = directionsUrl(intent, 'https://example.test/dustcompass/')
    expect(readDirectionsIntent(new URL(url).search)).toEqual({
      version: 1,
      from: { kind: 'fixed', label: 'Bike rack', position: [-119.201234, 40.771234] },
      to: { kind: 'address', address: '7:30 & Esplanade', position: [-119.205678, 40.779876] },
      mode: 'bike',
    })
  })

  it('distinguishes absent, wrong-year, unsupported-version, and malformed links', () => {
    const year = encodeURIComponent(String(DATA_YEAR))
    expect(readDirectionsResult('')).toEqual({ status: 'none' })
    expect(readDirectionsResult(`?dir=2&year=${year}&from=live&to=man&mode=walk`)).toEqual({ status: 'unsupported-version', version: '2' })
    expect(readDirectionsResult(`?dir=1&year=${Number(DATA_YEAR) - 1}&from=live&to=man&mode=walk`)).toEqual({ status: 'wrong-year', year: String(Number(DATA_YEAR) - 1) })
    expect(readDirectionsResult(`?dir=1&year=${year}&from=live&mode=walk`)).toEqual({ status: 'invalid' })
    expect(readDirectionsResult(`?dir=1&year=${year}&from=fixed:camp%7C999,999&to=man&mode=walk`)).toEqual({ status: 'invalid' })
    expect(readDirectionsResult(`?dir=1&year=${year}&from=live&to=man&mode=drive`)).toEqual({ status: 'invalid' })
    expect(readDirectionsResult('?dir=1&from=live&to=man&mode=walk')).toEqual({ status: 'wrong-year', year: null })
  })

  it('rejects live destinations instead of freezing a GPS coordinate at Start', () => {
    const year = encodeURIComponent(String(DATA_YEAR))
    expect(readDirectionsResult(`?dir=1&year=${year}&from=man&to=live&mode=walk`)).toEqual({ status: 'invalid' })
    expect(readDirectionsIntent(`?dir=1&year=${year}&from=man&to=live&mode=walk`)).toBeUndefined()
  })

  it('keeps the compatibility helper returning undefined for rejected links', () => {
    const year = encodeURIComponent(String(DATA_YEAR))
    expect(readDirectionsIntent(`?dir=2&year=${year}&from=live&to=man&mode=walk`)).toBeUndefined()
  })

  it('uses symbolic live origin only when a usable fix exists', () => {
    expect(defaultDirectionsOrigin(true)).toEqual({ kind: 'live' })
    expect(defaultDirectionsOrigin(false)).toEqual({ kind: 'man' })
  })
})
