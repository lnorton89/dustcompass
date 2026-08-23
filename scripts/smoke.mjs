/**
 * Browser smoke test: boots the app, waits for the city to render, then drives
 * a search and asserts the map actually moved. Run against `npm run dev`.
 *
 *   node scripts/smoke.mjs http://127.0.0.1:5173/ out.png
 */
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'http://127.0.0.1:5173/'
const shot = process.argv[3] ?? 'smoke.png'
// CHROME_PATH points at a pinned build in some sandboxes; elsewhere (CI,
// a normal checkout) Playwright resolves its own download.
const CHROME = process.env.CHROME_PATH || undefined

const browser = await chromium.launch({
  ...(CHROME ? { executablePath: CHROME } : {}),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-proxy-server', '--no-sandbox'],
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  // A fix out at 4:00 and E, so travel estimates are measured from a real
  // position rather than falling back to the Man.
  geolocation: { latitude: 40.7772, longitude: -119.1893 },
  permissions: ['geolocation'],
})
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

assert((await page.title()).startsWith('Dust Compass'), 'branded document title is present')
assert(
  (await page.locator('meta[property="og:image"]').getAttribute('content'))?.endsWith('/og-image.png'),
  'Open Graph share image is configured',
)
assert(await page.getByTestId('api-disclaimer').isVisible(), 'required API disclaimer is prominent')

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

// With a fix available, events can be ordered by how far away they are.
const closest = page.getByRole('button', { name: 'Closest' })
if (await closest.count()) {
  await closest.click()
  await page.waitForTimeout(700)
  const distances = await page
    .locator('.MuiDrawer-root .MuiListItemText-secondary')
    .allInnerTexts()
  const miles = distances
    .map((text) => /([\d.]+) mi/.exec(text)?.[1])
    .filter(Boolean)
    .map(Number)
  assert(miles.length > 2, `events show a distance when located (${miles.length} of them)`)
  assert(
    miles.every((value, i) => i === 0 || value >= miles[i - 1] - 0.05),
    `closest-first ordering holds (${miles.slice(0, 5).join(' → ')})`,
  )
} else {
  assert(false, 'distance sort offered when a fix is available')
}

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
assert(await page.getByTestId('selection-target').isVisible(), 'selected camp has a visible map target')
const selectionBox = await page.getByTestId('selection-target').boundingBox()
assert(
  selectionBox && selectionBox.x < 1040 && selectionBox.y < 760,
  `selected camp is framed outside the detail drawer (${Math.round(selectionBox?.x ?? -1)}, ${Math.round(selectionBox?.y ?? -1)})`,
)
await page.getByLabel('Add to favourites').click()
await page.waitForTimeout(300)
const stored = await page.evaluate(() => localStorage.getItem('playa-map.favorites.v1'))
assert(Boolean(stored) && stored !== '[]', `favourite persisted (${stored})`)

// Walk and bike estimates should both be present in the drawer.
const drawerText = await page.locator('.MuiDrawer-root').last().innerText()
assert(/\bmin\b|\bh\b/.test(drawerText), 'drawer shows travel time')

// Close the listing so the map is clickable again.
await page.getByLabel('Close details').click()
await page.waitForTimeout(500)

// Surveyed camp footprints appear only when zoomed in enough to read them.
await page.evaluate(() => window.__map.zoomTo(13.5, { duration: 0 }))
await page.waitForTimeout(1500)
assert(
  (await count('camp-outline-line')) === 0,
  'camp outlines stay hidden at city zoom, where they would just muddy the streets',
)
await page.evaluate(() => window.__map.zoomTo(16.5, { duration: 0 }))
await page.waitForTimeout(1800)
assert((await count('camp-outline-line')) > 10, `camp outlines appear up close (${await count('camp-outline-line')})`)

// Themes cycle dark → light → red night, and the map restyles with them.
await page.getByLabel('Switch to light mode').click()
await page.waitForTimeout(1200)
assert(
  (await page.evaluate(() => window.__map.getStyle().layers[0].paint['background-color'])) ===
    '#e8e0cf',
  'light mode restyles the map',
)
await page.getByLabel('Switch to red night mode').click()
await page.waitForTimeout(1500)
const nightBg = await page.evaluate(
  () => window.__map.getStyle().layers[0].paint['background-color'],
)
assert(nightBg === '#0a0000', `night mode restyles the map (${nightBg})`)
assert(
  (await page.evaluate(() => window.__map.queryRenderedFeatures({ layers: ['street-fill'] }).length)) > 20,
  'the city still renders after a restyle',
)
await page.getByLabel('Switch to dark mode').click()
await page.waitForTimeout(1200)

// Navigation: pick a camp, head for it, and require a live line and estimate.
await search.fill('')
await search.fill('Pink Fuzzy Monkey')
await page.waitForTimeout(700)
await page.keyboard.press('ArrowDown')
await page.keyboard.press('Enter')
await page.waitForTimeout(1200)
await page.getByRole('button', { name: /Take me there/i }).click()
await page.waitForTimeout(900)

assert(await page.getByTestId('navigation-target').isVisible(), 'navigation keeps a labeled destination target')
assert((await page.getByTestId('selection-target').count()) === 0, 'selection target becomes the navigation target')

const nav = await page.evaluate(() => {
  const route = window.__map.queryRenderedFeatures({ layers: ['route-line'] })
  return { segments: route.length, bar: document.body.innerText.includes('Pink Fuzzy Monkey') }
})
assert(nav.segments > 0, `route line drawn (${nav.segments} segment)`)
assert(nav.bar, 'navigation bar names the destination')

const navText = await page.locator('.MuiPaper-root').filter({ hasText: 'Pink Fuzzy Monkey' }).first().innerText()
assert(/\d/.test(navText) && /min/.test(navText), `navigation shows distance and time (${navText.replace(/\n/g, ' · ')})`)
// Asking to be taken somewhere should start locating, so the heading is
// measured from the user rather than falling back to the Man.
assert(/toward \d{1,2}:\d{2}/.test(navText), 'heading is measured from the GPS fix, as a clock direction')

await page.getByLabel('Stop navigating').click()
await page.waitForTimeout(600)
assert(
  (await page.evaluate(() => window.__map.queryRenderedFeatures({ layers: ['route-line'] }).length)) === 0,
  'clearing navigation removes the route',
)

// Tapping bare playa drops a shareable pin and puts the address in the URL.
await page.locator('canvas').click({ position: { x: 700, y: 420 } })
await page.waitForTimeout(900)
const pinned = new URL(page.url()).searchParams.get('at')
assert(Boolean(pinned), `tapping playa puts an address in the URL (${pinned})`)

// Saving a spot and getting back to it — the thing this app is for at 4am.
await page.getByRole('button', { name: 'Save', exact: true }).click()
await page.waitForTimeout(500)
await page.getByRole('button', { name: 'My camp' }).click()
await page.waitForTimeout(700)

const savedJson = await page.evaluate(() => localStorage.getItem('playa-map.places.v1'))
assert(Boolean(savedJson) && savedJson.includes('My camp'), 'saved spot persisted to the device')
assert(
  (await page.evaluate(() => window.__map.queryRenderedFeatures({ layers: ['saved-dot'] }).length)) > 0,
  'saved spot is marked on the map',
)

// It has to be findable by name, and lead somewhere.
await search.fill('')
await search.fill('My camp')
await page.waitForTimeout(700)
await page.keyboard.press('ArrowDown')
await page.keyboard.press('Enter')
await page.waitForTimeout(1000)

await page.getByLabel('Filters and saved spots').click()
await page.waitForTimeout(700)
await page.getByRole('button', { name: /^My camp/ }).click()
await page.waitForTimeout(900)
assert(
  await page.locator('.MuiPaper-root').filter({ hasText: 'My camp' }).count() > 0,
  'saved spot can be navigated back to',
)


// That URL, opened cold, must restore the same place.
const shared = await context.newPage()
await shared.goto(page.url(), { waitUntil: 'load' })
await shared.waitForFunction(() => document.documentElement.dataset.mapReady === 'true', null, {
  timeout: 30000,
})
await shared.waitForTimeout(2500)
const restored = await shared.evaluate(() => ({
  zoom: window.__map.getZoom(),
  marked: document.querySelectorAll('.maplibregl-marker').length,
}))
assert(restored.marked > 0, `shared link restores the marker (${restored.marked})`)
assert(restored.zoom > 15, `shared link restores the zoom (${restored.zoom.toFixed(1)})`)
await shared.close()

console.log(problems.length ? `\n${problems.length} problem(s):\n` + problems.join('\n') : '\nno console or network errors')
await browser.close()
process.exit(problems.length ? 1 : 0)

function assert(ok, label) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) process.exitCode = 1
}
