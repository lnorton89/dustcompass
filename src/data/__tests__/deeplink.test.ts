import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { deepLinkUrl, readDeepLink, resolveDeepLink, shareUrl } from '../useDeepLink'
import { geocode, reverseGeocode } from '../../brc/geocode'
import type { CityLayout } from '../../brc/layout'
import { distanceBetween, polarToPosition } from '../../brc/geo'
import { BASE_PATH, DATA_YEAR } from '../../config'

const layout = JSON.parse(
  readFileSync(`public/data/${DATA_YEAR}/layout.json`, 'utf8'),
) as CityLayout
const BASE = 'https://playa.example/'

describe('deep links', () => {
  it('reads a listing and an address', () => {
    expect(readDeepLink('?poi=abc123')).toEqual({ poi: 'abc123' })
    expect(readDeepLink('?at=7%3A30%20%26%20Esplanade')).toEqual({ at: '7:30 & Esplanade' })
  })

  it('is empty when there is nothing to restore', () => {
    expect(readDeepLink('')).toEqual({})
    expect(readDeepLink('?other=1')).toEqual({})
  })

  it('round-trips an address through a URL', () => {
    const url = deepLinkUrl({ at: 'Esplanade & 7:30' }, BASE)
    expect(readDeepLink(new URL(url).search)).toEqual({ at: 'Esplanade & 7:30' })
  })

  it('drops stale parameters rather than accumulating them', () => {
    const first = deepLinkUrl({ poi: 'abc' }, BASE)
    const second = deepLinkUrl({ at: 'D & 3:15' }, first)
    expect(new URL(second).searchParams.get('poi')).toBeNull()
    expect(new URL(second).searchParams.get('at')).toBe('D & 3:15')
  })

  it('resolves a shared address to the same place the search box would', () => {
    const link = readDeepLink('?at=D%20%26%203%3A15')
    expect(resolveDeepLink(link, layout)).toEqual({
      status: 'resolved',
      position: geocode('D & 3:15', layout)?.position,
    })
  })

  it('distinguishes an address that does not name a real place from having no address at all', () => {
    // Both used to be a bare `undefined` — indistinguishable from each other,
    // which is what let a permanently-unresolvable `at` wedge URL mirroring
    // for the rest of the session (issue #10).
    expect(resolveDeepLink({ at: 'somewhere over there' }, layout)).toEqual({ status: 'unresolvable' })
    expect(resolveDeepLink({}, layout)).toEqual({ status: 'none' })
  })

  it('prefers an exact ll coordinate over geocoding the address', () => {
    // A tapped point rarely lands exactly on the geocoder's rounding grid, so
    // any position off that grid proves ll — not a re-geocoded at — won.
    const position = polarToPosition(layout, '4:52', 2860)
    const link = { at: 'somewhere over there', ll: position }
    expect(resolveDeepLink(link, layout)).toEqual({ status: 'resolved', position })
  })

  it('round-trips an exact pin position through ll, unlike the lossy address alone', () => {
    // Between clock increments and between annular streets, so neither
    // rounding step in reverseGeocode happens to land on the original point.
    const original = polarToPosition(layout, '4:52', 2860)
    const address = reverseGeocode(original, layout).label

    const url = deepLinkUrl({ at: address, ll: original }, BASE)
    const restored = readDeepLink(new URL(url).search)
    const resolution = resolveDeepLink(restored, layout)

    expect(resolution.status).toBe('resolved')
    if (resolution.status === 'resolved') {
      expect(distanceBetween(original, resolution.position)).toBeLessThan(1)
    }

    // The old address-only path is the bug this fixes: restoring from the
    // rounded label alone lands measurably away from the original tap.
    const addressOnlyResolution = resolveDeepLink({ at: address }, layout)
    expect(addressOnlyResolution.status).toBe('resolved')
    if (addressOnlyResolution.status === 'resolved') {
      expect(distanceBetween(original, addressOnlyResolution.position)).toBeGreaterThan(1)
    }
  })

  it('ignores a malformed or out-of-range ll and falls back to the address', () => {
    expect(readDeepLink('?at=D%20%26%203%3A15&ll=not-a-coordinate')).toEqual({ at: 'D & 3:15' })
    expect(readDeepLink('?at=D%20%26%203%3A15&ll=200,95')).toEqual({ at: 'D & 3:15' })
  })

  it('round-trips ll through a URL at sub-meter precision', () => {
    const position: [number, number] = [-119.203112, 40.786809]
    const url = deepLinkUrl({ at: 'D & 3:15', ll: position }, BASE)
    const restored = readDeepLink(new URL(url).search)
    expect(restored.ll).toBeDefined()
    expect(distanceBetween(position, restored.ll!)).toBeLessThan(0.2)
  })
})

describe('share links', () => {
  const BASE = 'https://playa.example/dustcompass/?poi=old'

  it('sends a listing to its own page, so the link previews as that place', () => {
    // The prefix follows the deployment, so read it rather than assuming one.
    expect(shareUrl({ poi: 'a1XVI00000FBBVz2AP' }, BASE)).toBe(
      `https://playa.example${BASE_PATH}/p/a1XVI00000FBBVz2AP/`,
    )
  })

  it('leaves an address as a query parameter — it has no page of its own', () => {
    expect(shareUrl({ at: 'D & 3:15' }, BASE)).toBe(
      'https://playa.example/dustcompass/?at=D+%26+3%3A15',
    )
  })

  it('escapes anything odd in a listing id rather than pasting it into a path', () => {
    expect(shareUrl({ poi: 'a/b?c' }, BASE)).toContain('/p/a%2Fb%3Fc/')
  })
})
