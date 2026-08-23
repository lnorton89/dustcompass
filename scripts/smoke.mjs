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
context.on('response', (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()} ${r.url()}`))
const page = await context.newPage()
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()} ${m.location()?.url ?? ''}`))

await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => window.__map, null, { timeout: 30000 })
await page.waitForTimeout(3500)

const drawn = await page.evaluate(() => {
  const m = window.__map
  const count = (id) => m.queryRenderedFeatures({ layers: [id] }).length
  return { streets: count('street-fill'), labels: count('street-label'), clusters: count('poi-cluster') }
})
assert(drawn.streets > 20, `streets rendered (${drawn.streets})`)
assert(drawn.labels > 10, `street labels rendered (${drawn.labels})`)
assert(drawn.clusters > 5, `camp clusters rendered (${drawn.clusters})`)

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

await page.screenshot({ path: shot })
console.log(problems.length ? `\n${problems.length} problem(s):\n` + problems.join('\n') : '\nno console or network errors')
await browser.close()
process.exit(problems.length ? 1 : 0)

function assert(ok, label) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) process.exitCode = 1
}
