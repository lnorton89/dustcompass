/**
 * The share card for one camp or art piece.
 *
 * A link to a specific place should preview as that place. The generic card is
 * right for the app itself and wrong for "here is where we are" — the whole
 * point of sending it is the name and the address.
 *
 * Where a listing has a photo it is embedded whole, letterboxed on the brand
 * ink. Burning Man's photos are whatever shape the camp uploaded, so cropping
 * them to the card's 1.91:1 would cut the top off half of them; a picture with
 * bars beside it is better than a picture with its subject missing.
 */
import { createElement } from 'react'
import { packageFontLoader } from 'metaplate/fonts'
import { createNodeOg } from 'metaplate/node'
import { PALETTE } from './og-plate.mjs'

const { ink, dust, ember, horizon } = PALETTE
const muted = '#584f42'
const faint = '#766c5b'

const h = createElement

const MARK = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 76 76">
  <rect width="76" height="76" rx="18" fill="${ink}"/>
  <circle cx="38" cy="38" r="24" fill="none" stroke="${horizon}" stroke-width="3"/>
  <path d="M38 14v10M38 52v10M14 38h10M52 38h10" stroke="${horizon}" stroke-width="3" stroke-linecap="round"/>
  <path d="m38 24 7 17-7-3-7 3 7-17Z" fill="${ember}"/>
  <path d="M22 48c8-4 24-4 32 0" fill="none" stroke="${dust}" stroke-width="3" stroke-linecap="round"/>
  <circle cx="38" cy="38" r="3" fill="${dust}"/>
</svg>`

/** A compass rose, for a listing with no photo of its own. */
const ROSETTE = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="260" viewBox="-140 -140 280 280">
  <circle cx="0" cy="0" r="128" fill="none" stroke="${dust}" stroke-width="2" opacity=".18"/>
  <circle cx="0" cy="0" r="91" fill="none" stroke="${horizon}" stroke-width="5" opacity=".65"/>
  <path d="M0-128v37M0 91v37M-128 0h37M91 0h37" stroke="${horizon}" stroke-width="5" stroke-linecap="round" opacity=".65"/>
  <path d="m0-91 30 105L0 0l-30 14L0-91Z" fill="${ember}" opacity=".85"/>
  <circle cx="0" cy="0" r="12" fill="${dust}" opacity=".5"/>
</svg>`

const dataUri = (svg) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`

const font = (weight) => ({
  name: 'Inter',
  package: '@fontsource/inter',
  file: `files/inter-latin-${weight}-normal.woff`,
  weight,
})

/** Long camp names have to shrink or they run off the card. */
const titleSize = (name) => (name.length > 44 ? 46 : name.length > 28 ? 58 : 70)

export const poiOg = createNodeOg({
  alt: (copy) => copy.alt,
  fonts: packageFontLoader([font(500), font(600), font(800)]),
  component: (copy) =>
    h(
      'div',
      {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          fontFamily: 'Inter',
          backgroundColor: dust,
          backgroundImage: `radial-gradient(85% 85% at 30% 25%, #fff7e8 0%, ${dust} 100%)`,
        },
      },
      h('div', { style: { display: 'flex', width: 18, height: 630, backgroundColor: ember } }),
      h('div', { style: { display: 'flex', width: 7, height: 630, backgroundColor: horizon } }),

      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            width: 620,
            padding: '54px 44px 46px 50px',
          },
        },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center' } },
          h('img', { src: dataUri(MARK), width: 56, height: 56 }),
          h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', marginLeft: 16 } },
            h('div', { style: { fontSize: 25, fontWeight: 800, letterSpacing: -0.4, color: ink } }, 'DUST COMPASS'),
            h('div', { style: { fontSize: 13, fontWeight: 600, letterSpacing: 2.2, color: faint, marginTop: 4 } }, copy.kindLabel),
          ),
        ),

        h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', marginTop: 54 } },
          h(
            'div',
            {
              style: {
                fontSize: titleSize(copy.name),
                fontWeight: 800,
                letterSpacing: -1.8,
                color: ink,
                lineHeight: 1.08,
              },
            },
            copy.name,
          ),
          copy.address
            ? h(
                'div',
                { style: { display: 'flex', alignItems: 'center', marginTop: 26 } },
                h('div', { style: { width: 12, height: 12, borderRadius: 6, backgroundColor: ember } }),
                h('div', { style: { fontSize: 30, fontWeight: 600, color: muted, marginLeft: 14 } }, copy.address),
              )
            : h('div', { style: { fontSize: 26, fontWeight: 500, color: muted, marginTop: 24 } }, copy.fallbackLine),
        ),

        h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', marginTop: 'auto' } },
          h('div', { style: { display: 'flex', width: 500, height: 1, backgroundColor: ink, opacity: 0.18 } }),
          h('div', { style: { fontSize: 15, fontWeight: 600, letterSpacing: 0.6, color: muted, marginTop: 20, whiteSpace: 'nowrap' } }, copy.footnote),
        ),
      ),

      h(
        'div',
        {
          style: {
            display: 'flex',
            width: 555,
            height: 630,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: ink,
          },
        },
        copy.image
          ? h('img', {
              src: copy.image,
              width: 440,
              height: 330,
              style: { objectFit: 'contain' },
            })
          : h('img', { src: dataUri(ROSETTE), width: 260, height: 260 }),
      ),
    ),
})
