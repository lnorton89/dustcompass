/**
 * Rasterise public/favicon.svg into the PNG sizes installable PWAs need.
 * Uses the Chromium that Playwright already provides rather than adding an
 * image toolchain for four files.
 *
 *   node scripts/make-icons.mjs
 */
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const SIZES = [180, 192, 512]
// CHROME_PATH points at a pinned build in some sandboxes; elsewhere (CI,
// a normal checkout) Playwright resolves its own download.
const CHROME = process.env.CHROME_PATH || undefined
const svg = readFileSync('public/favicon.svg', 'utf8')

const browser = await chromium.launch({
  ...(CHROME ? { executablePath: CHROME } : {}),
  args: ['--no-sandbox', '--no-proxy-server'],
})
const page = await browser.newPage()

for (const size of SIZES) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<body style="margin:0">${svg.replace('<svg', `<svg width="${size}" height="${size}"`)}</body>`,
  )
  const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`
  await page.screenshot({ path: `public/${name}`, omitBackground: false })
  console.log(`public/${name}`)
}
await browser.close()
