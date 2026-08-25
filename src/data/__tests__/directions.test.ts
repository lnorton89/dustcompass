import { describe, expect, it } from 'vitest'
import {
  defaultDirectionsOrigin,
  directionsUrl,
  readDirectionsIntent,
  type DirectionsIntent,
} from '../directions'

describe('directions share links', () => {
  it('round-trips dynamic live-location routes without leaking a coordinate', () => {
    const intent: DirectionsIntent = {
      version: 1,
      from: { kind: 'live' },
      to: { kind: 'poi', uid: 'camp-123' },
      mode: 'walk',
    }

    const url = directionsUrl(intent, 'https://example.test/dustcompass/?poi=old')
    const parsed = new URL(url)
    expect(parsed.searchParams.get('from')).toBe('live')
    expect(parsed.search).not.toContain('119.')
    expect(readDirectionsIntent(parsed.search)).toEqual(intent)
  })

  it('round-trips an explicitly fixed point-to-point route', () => {
    const intent: DirectionsIntent = {
      version: 1,
      from: { kind: 'fixed', label: 'Bike rack', position: [-119.2012344, 40.7712344] },
      to: {
        kind: 'address',
        address: '7:30 & Esplanade',
        position: [-119.2056784, 40.7798764],
      },
      mode: 'bike',
    }

    const url = directionsUrl(intent, 'https://example.test/dustcompass/')
    expect(readDirectionsIntent(new URL(url).search)).toEqual({
      version: 1,
      from: { kind: 'fixed', label: 'Bike rack', position: [-119.201234, 40.771234] },
      to: {
        kind: 'address',
        address: '7:30 & Esplanade',
        position: [-119.205678, 40.779876],
      },
      mode: 'bike',
    })
  })

  it('rejects incomplete, unknown-version, and malformed route links', () => {
    expect(readDirectionsIntent('?dir=2&from=live&to=man&mode=walk')).toBeUndefined()
    expect(readDirectionsIntent('?dir=1&from=live&mode=walk')).toBeUndefined()
    expect(readDirectionsIntent('?dir=1&from=fixed:camp%7C999,999&to=man&mode=walk')).toBeUndefined()
    expect(readDirectionsIntent('?dir=1&from=live&to=man&mode=drive')).toBeUndefined()
  })

  it('uses symbolic live origin only when a usable fix exists', () => {
    expect(defaultDirectionsOrigin(true)).toEqual({ kind: 'live' })
    expect(defaultDirectionsOrigin(false)).toEqual({ kind: 'man' })
  })
})
