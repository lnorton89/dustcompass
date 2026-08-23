import { describe, expect, it } from 'vitest'
import { BRAND } from '../brand'
// The social card is built by a plain Node script so the static export needs no
// JSX step; these assertions are what keep it tied to the app's own branding.
import { card, OG_COPY, PALETTE } from '../../scripts/lib/og-plate.mjs'

describe('social card plate', () => {
  it('paints from the app palette', () => {
    expect(PALETTE).toEqual(BRAND.colors)
  })

  it('says what the app says', () => {
    expect(OG_COPY.wordmark).toBe(BRAND.name.toUpperCase())
    expect(OG_COPY.title.join(' ')).toBe(BRAND.tagline)
    expect(OG_COPY.alt).toBe(`${BRAND.name} — ${BRAND.tagline}`)
  })

  it('keeps the disclaimer on the card', () => {
    expect(OG_COPY.footnote).toContain('NOT AFFILIATED WITH BURNING MAN PROJECT')
  })

  it('gives every multi-child box an explicit display, as Satori requires', () => {
    const offenders: string[] = []
    const walk = (node: unknown, path: string) => {
      if (!node || typeof node !== 'object') return
      const element = node as { type?: unknown; props?: Record<string, unknown> }
      const children = [element.props?.children ?? []].flat().filter((child) => child != null)
      const style = (element.props?.style ?? {}) as Record<string, unknown>
      if (children.length > 1 && !['flex', 'contents', 'none'].includes(String(style.display))) {
        offenders.push(`${path} (${String(element.type)})`)
      }
      children.forEach((child, index) => walk(child, `${path}/${index}`))
    }
    walk(card(OG_COPY), 'root')
    expect(offenders).toEqual([])
  })
})
