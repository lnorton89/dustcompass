/**
 * Verifies the rasterised icons in public/ actually have the properties
 * make-icons.mjs promises, instead of trusting that a successful screenshot
 * meant a correct one. Run after `npm run icons`, before `next build` copies
 * public/ into the deployed output — see the `build` script in package.json.
 *
 *   node scripts/check-icons.mjs
 */
import { chromium } from 'playwright'
import { resolve } from 'node:path'

// CHROME_PATH points at a pinned build in some sandboxes; elsewhere (CI,
// a normal checkout) Playwright resolves its own download.
const CHROME = process.env.CHROME_PATH || undefined
// Mirrors MASKABLE_BG in make-icons.mjs (itself BRAND.colors.ink).
const MASKABLE_BG = [0x12, 0x10, 0x0e]
// Half the W3C maskable-icon safe-zone fraction (40% of the icon size, i.e. a
// centred safe circle of 80% diameter) — anything the mark draws past this
// radius risks being cropped by an OS mask.
const SAFE_ZONE_FRACTION = 0.4
const CHANNEL_TOLERANCE = 12

const browser = await chromium.launch({
  ...(CHROME ? { executablePath: CHROME } : {}),
  args: ['--no-sandbox', '--no-proxy-server'],
})
const page = await browser.newPage()

async function samplePixels(file, points) {
  await page.goto(`file://${resolve('public', file).replace(/\\/g, '/')}`)
  return page.evaluate((points) => {
    const img = document.querySelector('img')
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const data = ctx.getImageData(0, 0, c.width, c.height).data
    const at = (x, y) => Array.from(data.slice((y * c.width + x) * 4, (y * c.width + x) * 4 + 4))
    return {
      width: c.width,
      height: c.height,
      pixels: points.map(([x, y]) => at(Math.round(x), Math.round(y))),
    }
  }, points)
}

const closeTo = (pixel, rgb, tolerance = CHANNEL_TOLERANCE) =>
  rgb.every((channel, i) => Math.abs(pixel[i] - channel) <= tolerance)

// The ordinary icons are deliberately a rounded square with transparent
// corners (see the comment in make-icons.mjs) — appropriate for a favicon or
// home-screen tile, wrong for anything an OS is going to mask itself.
for (const [file, size] of [
  ['favicon-32.png', 32],
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
]) {
  const { width, height, pixels } = await samplePixels(file, [[0, 0]])
  assert(width === size && height === size, `${file} is ${size}x${size} (got ${width}x${height})`)
  assert(pixels[0][3] === 0, `${file} keeps transparent corners (alpha ${pixels[0][3]})`)
}

// The maskable icon must be opaque edge-to-edge — any transparency left in a
// corner shows through as a hole once an OS applies its own circle/squircle
// crop — and must keep the mark's geometry inside the safe zone, so the crop
// never clips the compass itself.
{
  const file = 'icon-512-maskable.png'
  const { width, height } = await samplePixels(file, [[0, 0]])
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ]
  const cx = width / 2
  const cy = height / 2
  const safeRadius = SAFE_ZONE_FRACTION * width
  const ring = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2
    return [cx + Math.cos(angle) * safeRadius, cy + Math.sin(angle) * safeRadius]
  })
  const { pixels } = await samplePixels(file, [...corners, [cx, cy], ...ring])
  const cornerPixels = pixels.slice(0, corners.length)
  const centerPixel = pixels[corners.length]
  const ringPixels = pixels.slice(corners.length + 1)

  assert(width === 512 && height === 512, `${file} is 512x512 (got ${width}x${height})`)
  assert(
    cornerPixels.every((p) => p[3] === 255),
    `${file} has no transparency at its corners (alpha ${cornerPixels.map((p) => p[3]).join(', ')})`,
  )
  assert(
    cornerPixels.every((p) => closeTo(p, MASKABLE_BG)),
    `${file} corners are the maskable background colour (got ${cornerPixels.map((p) => `rgb(${p.slice(0, 3).join(',')})`).join('; ')}, want rgb(${MASKABLE_BG.join(',')}))`,
  )
  assert(
    !closeTo(centerPixel, MASKABLE_BG, 4),
    `${file} draws mark artwork at its centre, not just flat background`,
  )
  assert(
    ringPixels.every((p) => closeTo(p, MASKABLE_BG)),
    `${file} keeps the mark inside the safe zone (found non-background colour at the ${Math.round(SAFE_ZONE_FRACTION * 100)}% safe-zone radius)`,
  )
}

await browser.close()
process.exit(process.exitCode ? 1 : 0)

function assert(ok, label) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) process.exitCode = 1
}
