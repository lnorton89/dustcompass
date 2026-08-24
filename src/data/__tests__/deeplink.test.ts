import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { deepLinkUrl, readDeepLink, resolveDeepLink, shareUrl } from '../useDeepLink'
import { geocode } from '../../brc/geocode'
import type { CityLayout } from '../../brc/layout'
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
    expect(resolveDeepLink(link, layout)).toEqual(geocode('D & 3:15', layout)?.position)
  })

  it('ignores an address that does not name a real place', () => {
    expect(resolveDeepLink({ at: 'somewhere over there' }, layout)).toBeUndefined()
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
