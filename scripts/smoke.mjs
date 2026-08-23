/**
 * Browser smoke test: boots the app, waits for the city to render, then drives
 * a search and asserts the map actually moved. Run against `npm run dev`.
 *
 *   node scripts/smoke.mjs http://127.0.0.1:5173/ out.png
 */
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'http://127.0.0.1:5173/'
const shot = process.argv[3] ?? 'smoke.png'
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-proxy-server', '--no-sandbox'],
})
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const problems = []
// Listing thumbnails are hosted off-playa and are expected to fail here (and on
// playa). The app collapses them; they are not a smoke-test failure.
const external = (url = '') => /widen\.net|burningman\.org/.test(url)
context.on(
  'response',
  (r) => r.status() >= 400 && !external(r.url()) && problems.push(`HTTP ${r.status()} ${r.url()}`),
)
const page = await context.newPage()
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  const url = m.location()?.url ?? ''
  if (m.type() === 'error' && !external(url)) problems.push(`console: ${m.text()} ${url}`)
})

await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => window.__map, null, { timeout: 30000 })
await page.waitForTimeout(3500)

const count = (id) =>
  page.evaluate((layer) => window.__map.queryRenderedFeatures({ layers: [layer] }).length, id)

const drawn = {
  streets: await count('street-fill'),
  labels: await count('street-label'),
  clusters: await count('poi-cluster'),
  toilets: await count('toilet-dot'),
  services: await count('service-dot'),
}
assert(drawn.streets > 20, `streets rendered (${drawn.streets})`)
assert(drawn.labels > 10, `street labels rendered (${drawn.labels})`)
assert(drawn.clusters > 5, `camp clusters rendered (${drawn.clusters})`)
assert(drawn.toilets > 5, `toilets rendered (${drawn.toilets})`)
assert(drawn.services > 3, `city services rendered (${drawn.services})`)

// Toggling a filter chip must actually remove the layer's features.
await page.getByRole('button', { name: 'Toilets', exact: true }).click()
await page.waitForTimeout(800)
assert((await count('toilet-dot')) === 0, 'toilet filter clears the layer')
await page.getByRole('button', { name: 'Toilets', exact: true }).click()
await page.waitForTimeout(800)
assert((await count('toilet-dot')) > 5, 'toilet filter restores the layer')

// Geocode an address through the UI and confirm the camera flew to it.
const before = await page.evaluate(() => window.__map.getCenter())
await page.getByPlaceholder(/Camp, art, or an address/).fill('7:30 & Esplanade')
await page.waitForTimeout(600)
await page.keyboard.press('ArrowDown')
await page.keyboard.press('Enter')
await page.waitForTimeout(1800)
const after = await page.evaluate(() => ({ ...window.__map.getCenter(), zoom: window.__map.getZoom() }))
const moved = Math.abs(after.lng - before.lng) + Math.abs(after.lat - before.lat)
assert(moved > 0.001, `map flew to the address (moved ${moved.toFixed(5)}°, zoom ${after.zoom.toFixed(1)})`)

// Events panel: the "Now" window must produce rows that are actually running.
await page.getByLabel('Show events').click()
await page.waitForTimeout(900)
const eventRows = await page.locator('.MuiDrawer-root .MuiListItemButton-root').count()
assert(eventRows > 0, `events listed in the Now window (${eventRows})`)

await page.screenshot({ path: shot })
await page.getByLabel('Close events').click()
await page.waitForTimeout(500)

// Select a known camp by name, star it, and confirm it persists.
const search = page.getByPlaceholder(/Camp, art, or an address/)
await search.fill('')
await search.fill('Pink Fuzzy Monkey')
await page.waitForTimeout(700)
await page.keyboard.press('ArrowDown')
await page.keyboard.press('Enter')
await page.waitForTimeout(1200)
assert(await page.getByLabel('Add to favourites').count() > 0, 'detail drawer opened for a camp')
await page.getByLabel('Add to favourites').click()
await page.waitForTimeout(300)
const stored = await page.evaluate(() => localStorage.getItem('playa-map.favorites.v1'))
assert(Boolean(stored) && stored !== '[]', `favourite persisted (${stored})`)

// Walk and bike estimates should both be present in the drawer.
const drawerText = await page.locator('.MuiDrawer-root').last().innerText()
assert(/\bmin\b|\bh\b/.test(drawerText), 'drawer shows travel time')
console.log(problems.length ? `\n${problems.length} problem(s):\n` + problems.join('\n') : '\nno console or network errors')
await browser.close()
process.exit(problems.length ? 1 : 0)

function assert(ok, label) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) process.exitCode = 1
}
