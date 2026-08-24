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
// CHROME_PATH points at a pinned build in some sandboxes; elsewhere (CI,
// a normal checkout) Playwright resolves its own download.
const CHROME = process.env.CHROME_PATH || undefined

const browser = await chromium.launch({
  ...(CHROME ? { executablePath: CHROME } : {}),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-proxy-server', '--no-sandbox'],
})
const context = await browser.newContext({ viewport: { width: 1200, height: 800 } })
const page = await context.newPage()

/**
 * The worker only takes control after `install` resolves, and `install` does
 * not resolve until every asset is cached. Waiting for a controller is
 * therefore the precise signal that precaching finished — polling the cache
 * count races the worker and answers before it has opened a cache at all.
 */
async function precacheCount(target) {
  await target.waitForFunction(() => navigator.serviceWorker?.controller != null, null, {
    timeout: 90000,
  })
  return target.evaluate(async () => {
    const names = await caches.keys()
    let cached = 0
    for (const name of names) cached += (await (await caches.open(name)).keys()).length
    return cached
  })
}

await page.goto(url, { waitUntil: 'load' })
const total = await precacheCount(page)
console.log(`PASS  service worker precached ${total} entries`)

// Read a camp out of this year's own listings while the network is still up.
// Naming last year's camp would fail for reasons that are not about offline.
const DATA_YEAR = process.env.NEXT_PUBLIC_DATA_YEAR ?? '2026'
const campName = await page.evaluate(async (year) => {
  const root = window.location.pathname.replace(/[/]$/, '')
  const camps = await (await fetch(`${root}/data/${year}/camp.json`)).json()
  const placed = camps.filter((camp) => /^[\w' -]{6,28}$/.test(camp.name ?? ''))
  return placed[Math.floor(placed.length / 2)]?.name
}, DATA_YEAR)
if (!campName) throw new Error('No usable camp name in the published listings.')

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
await page.getByPlaceholder(/Camp, art, or an address/).fill(campName)
await page.waitForTimeout(900)
const options = await page.locator('[role="option"], .MuiAutocomplete-option').count()
assert(options > 0, `camp listings searchable offline ("${campName}", ${options} match)`)

await page.getByPlaceholder(/Camp, art, or an address/).fill('7:30 & Esplanade')
await page.waitForTimeout(700)
const addressHit = await page.getByText('Esplanade & 7:30').count()
assert(addressHit > 0, 'address geocoding works offline')

if (process.argv[3]) await page.screenshot({ path: process.argv[3] })

// The install happens once, on whatever connection someone has before they
// drive out. A single dropped request used to abort it and leave the progress
// count frozen, so prove a flaky asset is survivable rather than assuming it.
const flaky = await browser.newContext({ viewport: { width: 1200, height: 800 } })
let tripped = false
await flaky.route('**/icon-512.png', (route) => {
  if (tripped) return route.continue()
  tripped = true
  return route.fulfill({ status: 503, body: '' })
})
const flakyPage = await flaky.newPage()
await flakyPage.goto(url, { waitUntil: 'load' })

const survived = await precacheCount(flakyPage).catch(() => 0)

assert(tripped, 'the flaky asset was actually served a 503')
assert(survived >= total, `precache survived a dropped request (${survived}/${total} cached)`)

await browser.close()
process.exit(failed ? 1 : 0)
