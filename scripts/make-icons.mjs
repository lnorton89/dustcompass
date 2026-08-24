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
// Mirrors BRAND.colors.ink (src/brand.ts) — also the fill of the rounded rect
// in favicon.svg itself, so the maskable canvas below is seamless with the
// mark's own background rather than a second colour butted up against it.
// It is also already `background_color`/`theme_color` in the manifest, so an
// OS mask cropping to a circle blends into the same colour the splash screen
// and browser chrome already use.
const MASKABLE_BG = '#12100e'
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
  // The mark is a rounded square with transparent corners by design; the page's
  // default white background would otherwise fill them in.
  await page.screenshot({ path: `public/${name}`, omitBackground: true })
  console.log(`public/${name}`)
}

/*
 * A maskable icon needs an opaque square with no transparent corners, because
 * an OS applies its own circle/squircle crop and anything left transparent
 * outside that crop shows through as a hole rather than as background. The
 * SVG's own rounded rect already covers the centre in MASKABLE_BG; painting
 * the page the same colour (instead of omitting the background, as above)
 * fills in just the four corner triangles the rounded corners leave bare, so
 * the seam between "drawn by the SVG" and "filled by the page" is invisible.
 *
 * The compass geometry (ticks, needle, arc, dot) spans the centre 40 of 64
 * viewBox units — 62.5% of the icon, comfortably inside the ~80% safe zone
 * the W3C maskable-icon spec asks for — so no rescaling is needed here, only
 * the opaque background.
 */
await page.setViewportSize({ width: 512, height: 512 })
await page.setContent(
  `<body style="margin:0;background:${MASKABLE_BG}">${svg.replace('<svg', '<svg width="512" height="512"')}</body>`,
)
await page.screenshot({ path: 'public/icon-512-maskable.png' })
console.log('public/icon-512-maskable.png')

const icoImages = []
for (const size of ICO_SIZES) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<body style="margin:0">${svg.replace('<svg', `<svg width="${size}" height="${size}"`)}</body>`,
  )
  icoImages.push({ size, png: await page.screenshot({ omitBackground: true }) })
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
