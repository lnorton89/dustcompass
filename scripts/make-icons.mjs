/**
 * Rasterise public/favicon.svg into the PNG sizes installable PWAs need.
 * Uses the Chromium that Playwright already provides rather than adding an
 * image toolchain for four files.
 *
 * Icons are pure geometry, so a browser rasterises them identically anywhere.
 * The social card is not — it is type — so it lives in scripts/make-og.mjs,
 * where Metaplate renders it from embedded font bytes instead.
 *
 *   node scripts/make-icons.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const SIZES = [32, 180, 192, 512]
const ICO_SIZES = [16, 32, 48]
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
  const name =
    size === 32 ? 'favicon-32.png' : size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`
  await page.screenshot({ path: `public/${name}`, omitBackground: false })
  console.log(`public/${name}`)
}

const icoImages = []
for (const size of ICO_SIZES) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<body style="margin:0">${svg.replace('<svg', `<svg width="${size}" height="${size}"`)}</body>`,
  )
  icoImages.push({ size, png: await page.screenshot({ omitBackground: false }) })
}

writeFileSync('public/favicon.ico', makeIco(icoImages))
console.log('public/favicon.ico')

await browser.close()

/** ICO supports PNG-compressed frames, keeping small icon edges crisp. */
function makeIco(images) {
  const directorySize = 6 + images.length * 16
  const header = Buffer.alloc(directorySize)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  let offset = directorySize
  images.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16
    header.writeUInt8(size, entry)
    header.writeUInt8(size, entry + 1)
    header.writeUInt8(0, entry + 2)
    header.writeUInt8(0, entry + 3)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(png.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += png.length
  })

  return Buffer.concat([header, ...images.map(({ png }) => png)])
}
