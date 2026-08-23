import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { deepLinkUrl, readDeepLink, resolveDeepLink } from '../useDeepLink'
import { geocode } from '../../brc/geocode'
import type { CityLayout } from '../../brc/layout'

const layout = JSON.parse(readFileSync('public/data/2025/layout.json', 'utf8')) as CityLayout
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
