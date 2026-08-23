/**
 * Render the social card into `public/og-image.png`.
 *
 * Runs on every build rather than being committed: metaplate embeds real font
 * bytes, so the output is byte-identical everywhere and there is no reason to
 * carry a 240KB binary in git that no reviewer can diff.
 *
 *   node scripts/make-og.mjs
 */
import { writeFile } from 'node:fs/promises'
import { og, OG_COPY } from './lib/og-plate.mjs'

const target = 'public/og-image.png'
const png = await og.render(OG_COPY)
await writeFile(target, png)
console.log(`${target} — ${og.size.width}x${og.size.height}, ${(png.length / 1024).toFixed(0)}KB`)
