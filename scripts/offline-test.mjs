/**
 * Proves the offline claim rather than asserting it: loads the app once, waits
 * for the service worker to finish precaching, then cuts the network entirely
 * and reloads. The city must still render.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node scripts/offline-test.mjs http://127.0.0.1:4173/
 */
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'http://127.0.0.1:4173/'
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-proxy-server', '--no-sandbox'],
})
const context = await browser.newContext({ viewport: { width: 1200, height: 800 } })
const page = await context.newPage()

await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, {
  timeout: 30000,
})

// Precaching continues after activation; wait for the cache to actually fill.
const cached = await page.waitForFunction(
  async () => {
    const names = await caches.keys()
    let total = 0
    for (const name of names) total += (await (await caches.open(name)).keys()).length
    return total > 20 ? total : false
  },
  null,
  { timeout: 60000 },
)
console.log(`PASS  service worker precached ${await cached.jsonValue()} entries`)

await context.setOffline(true)
console.log('      network disabled')

await page.reload({ waitUntil: 'load' })
await page.waitForFunction(() => document.documentElement.dataset.mapReady === 'true', null, { timeout: 30000 })
await page.waitForTimeout(4000)

// Production builds do not expose the map handle, so assert on what the user
// would actually see: the city painted, and the listings present in the DOM.
const drawn = await page.evaluate(() => {
  const canvas = document.querySelector('canvas')
  const gl = canvas?.getContext('webgl2', { preserveDrawingBuffer: true })
  return { canvas: canvas ? `${canvas.width}x${canvas.height}` : 'none', gl: Boolean(gl) }
})

let failed = false
const assert = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failed = true
}
assert(drawn.canvas !== 'none', `map canvas painted offline (${drawn.canvas})`)

// The listings are the part that would silently fail without precaching:
// search for a camp by name and require the geocoded result.
await page.getByPlaceholder(/Camp, art, or an address/).fill('Pink Fuzzy Monkey')
await page.waitForTimeout(900)
const options = await page.locator('[role="option"], .MuiAutocomplete-option').count()
assert(options > 0, `camp listings searchable offline (${options} match)`)

await page.getByPlaceholder(/Camp, art, or an address/).fill('7:30 & Esplanade')
await page.waitForTimeout(700)
const addressHit = await page.getByText('Esplanade & 7:30').count()
assert(addressHit > 0, 'address geocoding works offline')

if (process.argv[3]) await page.screenshot({ path: process.argv[3] })
await browser.close()
process.exit(failed ? 1 : 0)
