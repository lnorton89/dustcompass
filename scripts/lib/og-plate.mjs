/**
 * The Dust Compass social card, as one metaplate plate.
 *
 * The card used to be a Playwright screenshot of `public/og-image.svg`, which
 * asked for `Inter, Segoe UI, sans-serif` and got whatever the machine running
 * the script happened to have installed. Inter is not a Windows system font, so
 * the committed PNG was actually set in Segoe UI, and regenerating it on Linux
 * would have produced a third result. Metaplate loads the real Inter bytes, so
 * the card is set in the app's own typeface and every machine renders the same
 * file — which is why it is now built rather than committed.
 *
 * Satori takes any React-shaped element tree, so this stays a plain module and
 * the static export needs no JSX build step of its own. The artwork stays SVG:
 * it is pure geometry, so it never had the font problem the text did.
 */
import { createElement } from 'react'
import { packageFontLoader } from 'metaplate/fonts'
import { createNodeOg } from 'metaplate/node'

/** Mirrors `BRAND.colors`; `og-plate.test.ts` fails if the two drift apart. */
export const PALETTE = {
  ink: '#12100e',
  dust: '#e8e0cf',
  ember: '#ff8a4c',
  horizon: '#5ec8d8',
}

const { ink, dust, ember, horizon } = PALETTE
const muted = '#584f42'
const faint = '#766c5b'

/**
 * `createElement` keeps this a plain module — no JSX build step for a script —
 * and, unlike a hand-rolled factory, it normalises children the way Satori
 * expects. Satori demands an explicit `display` on any element whose children
 * arrive as an array, so passing a lone text child as `['text']` rather than
 * `'text'` fails every leaf here with a misdirecting complaint about flex.
 */
const h = createElement

/**
 * The compass mark that also serves as the app icon, and the same mark at
 * poster scale (needle up the 12:00 radial). Exported so every plate that
 * needs the brand mark draws this one rather than a hand-copied lookalike —
 * poi-card.mjs used to keep its own `ROSETTE` and it drifted: no horizon
 * curve, no pivot ring, reading as a generic compass rose instead of the mark.
 */
export const MARK = `<svg xmlns="http://www.w3.org/2000/svg" width="76" height="76" viewBox="0 0 76 76">
  <rect width="76" height="76" rx="18" fill="${ink}"/>
  <circle cx="38" cy="38" r="24" fill="none" stroke="${horizon}" stroke-width="3"/>
  <path d="M38 14v10M38 52v10M14 38h10M52 38h10" stroke="${horizon}" stroke-width="3" stroke-linecap="round"/>
  <path d="m38 24 7 17-7-3-7 3 7-17Z" fill="${ember}"/>
  <path d="M22 48c8-4 24-4 32 0" fill="none" stroke="${dust}" stroke-width="3" stroke-linecap="round"/>
  <circle cx="38" cy="38" r="3" fill="${dust}"/>
</svg>`

export const ROSETTE = `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="280" viewBox="-140 -140 280 280">
  <circle cx="0" cy="0" r="128" fill="none" stroke="${ink}" stroke-width="2" opacity=".12"/>
  <circle cx="0" cy="0" r="91" fill="none" stroke="${horizon}" stroke-width="5"/>
  <circle cx="0" cy="0" r="59" fill="none" stroke="${ink}" stroke-width="2" opacity=".22"/>
  <path d="M0-128v37M0 91v37M-128 0h37M91 0h37" stroke="${horizon}" stroke-width="5" stroke-linecap="round"/>
  <path d="m0-91 30 105L0 0l-30 14L0-91Z" fill="${ember}"/>
  <path d="M-77 51c39-17 115-17 154 0" fill="none" stroke="${ink}" stroke-width="8" stroke-linecap="round"/>
  <circle cx="0" cy="0" r="12" fill="${ink}"/>
  <circle cx="0" cy="0" r="5" fill="${dust}"/>
</svg>`

export const dataUri = (svg) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`

const font = (weight) => ({
  name: 'Inter',
  package: '@fontsource/inter',
  file: `files/inter-latin-${weight}-normal.woff`,
  weight,
})

/** Exported so tests can walk the tree without rasterising it. */
export const card = (copy) =>
  h(
      'div',
      {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          fontFamily: 'Inter',
          backgroundColor: dust,
          backgroundImage: `radial-gradient(85% 85% at 66% 30%, #fff7e8 0%, ${dust} 100%)`,
        },
      },
      // The brand rule: ember over horizon, as down the left of the app shell.
      h('div', { style: { position: 'absolute', left: 0, top: 0, width: 18, height: 630, backgroundColor: ember } }),
      h('div', { style: { position: 'absolute', left: 18, top: 0, width: 7, height: 630, backgroundColor: horizon } }),
      h('img', { src: dataUri(ROSETTE), width: 280, height: 280, style: { position: 'absolute', left: 785, top: 160 } }),

      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', width: '100%', padding: '65px 78px' } },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center' } },
          h('img', { src: dataUri(MARK), width: 76, height: 76 }),
          h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', marginLeft: 21 } },
            h('div', { style: { fontSize: 39, fontWeight: 800, letterSpacing: -0.8, color: ink } }, copy.wordmark),
            h('div', { style: { fontSize: 15, fontWeight: 600, letterSpacing: 2.6, color: faint, marginTop: 7 } }, copy.eyebrow),
          ),
        ),

        h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', marginTop: 86 } },
          ...copy.title.map((line, index) =>
            h('div', { key: `line-${index}`, style: { fontSize: 70, fontWeight: 800, letterSpacing: -2.6, color: ink, lineHeight: 1.09 } }, line),
          ),
          h('div', { style: { fontSize: 27, fontWeight: 500, color: muted, marginTop: 27 } }, copy.description),
        ),

        h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', marginTop: 'auto' } },
          h('div', { style: { display: 'flex', width: 1044, height: 1, backgroundColor: ink, opacity: 0.18 } }),
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', marginTop: 33 } },
            h('div', { style: { width: 10, height: 10, borderRadius: 5, backgroundColor: ember } }),
            h('div', { style: { fontSize: 16, fontWeight: 600, letterSpacing: 1.1, color: muted, marginLeft: 16 } }, copy.footnote),
          ),
        ),
      ),
  )

export const og = createNodeOg({
  alt: (copy) => copy.alt,
  fonts: packageFontLoader([font(500), font(600), font(800)]),
  component: card,
})

/**
 * The card's copy. Derived shapes are asserted against `BRAND` in
 * `og-plate.test.ts`, so renaming the app cannot leave a stale share image.
 */
export const OG_COPY = {
  wordmark: 'DUST COMPASS',
  eyebrow: 'OFFLINE PLAYA NAVIGATION',
  title: ['Find your way,', 'even offline.'],
  description: 'Map places. Find events. Follow a bearing home.',
  footnote: 'FREE COMMUNITY TOOL · NOT AFFILIATED WITH BURNING MAN PROJECT',
  alt: 'Dust Compass — Find your way, even offline.',
}
