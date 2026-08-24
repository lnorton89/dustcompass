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

/*
 * The first-run explainer shows once per browser profile and would sit in
 * front of every assertion below. Marked as already seen before the app boots,
 * rather than clicked away after: this run is about the forty flows behind it,
 * and the dialog itself is covered by the accessibility pass.
 */
await page.addInitScript(() => {
  try {
    localStorage.setItem('dust-compass:first-run:1', 'seen')
  } catch {
    /* private-mode storage throws; the dialog is harmless if it appears */
  }
})

await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => window.__map, null, { timeout: 30000 })
await page.waitForTimeout(3500)

assert((await page.title()).startsWith('Dust Compass'), 'branded document title is present')
const faviconUrls = await page
  .locator('link[rel~="icon"]')
  .evaluateAll((links) => links.map((link) => link.href))
assert(
  ['favicon.svg', 'favicon-32.png', 'favicon.ico'].every((name) =>
    faviconUrls.some((url) => new URL(url).pathname.endsWith(name)),
  ),
  'SVG, PNG, and ICO favicons are declared',
)
for (const faviconUrl of faviconUrls) {
  const response = await context.request.get(faviconUrl)
  assert(response.ok(), `favicon loads (${new URL(faviconUrl).pathname})`)
}
assert(
  (await page.locator('meta[property="og:image"]').getAttribute('content'))?.endsWith('/og-image.png'),
  'Open Graph share image is configured',
)
assert(await page.getByTestId('api-disclaimer').isVisible(), 'required API disclaimer is prominent')

// The embargo notice is true for weeks before the event. Re-announcing it on
// every launch turns an explanation into something to swat away each time.
const embargoNotice = page.getByText(/embargoed until Gates open/)
if (await embargoNotice.count()) {
  // Reached by its accessible name rather than by the class of whatever
  // component happens to draw it. It used to be a MUI Alert and is now a plain
  // themed surface, because `severity="info"` painted a saturated blue
  // billboard across an app made of ember, teal and dust.
  // A modal marks the rest of the app aria-hidden, and getByRole skips hidden
  // subtrees while getByText does not — so if the explainer is up, the notice's
  // text matches and its button is unreachable. Clear the explainer first
  // rather than assuming the init script suppressed it.
  const explainer = page.getByRole('button', { name: /Show me the map/i })
  if (await explainer.count()) {
    await explainer.click()
    await page.waitForTimeout(500)
  }
  await page.getByRole('button', { name: 'Dismiss' }).click()
  await page.waitForTimeout(400)
  await page.reload({ waitUntil: 'load' })
  await page.waitForFunction(() => window.__map, null, { timeout: 30000 })
  await page.waitForTimeout(2500)
  assert(
    (await embargoNotice.count()) === 0,
    'the embargo notice stays dismissed across a reload',
  )
}

/**
 * The offline status indicator takes two shapes: a pressable chip for the two
 * states that want something from the user, and a passive icon for the rest.
 * On a narrow screen both drop their label, and MUI leaves an empty label
 * element behind whose padding used to shoulder the chip's icon eight pixels
 * off-centre.
 */
await page.setViewportSize({ width: 697, height: 900 })
await page.locator('[role="status"], [class*=MuiChip-root]').first().waitFor({ timeout: 15000 }).catch(() => {})
await page.waitForTimeout(400)
const indicator = await page.evaluate(() => {
  const el = document.querySelector('header [role="status"], header [class*=MuiChip-root]')
  if (!el) return { why: 'no status indicator in the toolbar' }
  const icon = el.querySelector('svg')
  if (!icon) return { why: 'the status indicator shows no icon' }
  const box = el.getBoundingClientRect()
  const glyph = icon.getBoundingClientRect()
  return {
    kind: String(el.className).includes('MuiChip') ? 'chip' : 'passive',
    off: Math.abs(glyph.x + glyph.width / 2 - (box.x + box.width / 2)),
    width: Math.round(box.width),
  }
})
if (indicator.off === undefined) console.log('      ' + JSON.stringify(indicator))
assert(
  indicator.off !== undefined,
  `the toolbar shows an offline status indicator (${indicator.kind ?? indicator.why})`,
)
// A passive icon sits in a flex row beside its label, so only the pill shape
// has a centre to be off.
if (indicator.kind === 'chip') {
  assert(
    indicator.off <= 1,
    `the status chip centres its icon (${indicator.off.toFixed(1)}px off)`,
  )
}
await page.setViewportSize({ width: 1440, height: 900 })
await page.waitForTimeout(400)

// Search is the only way to find a camp by name, and the toolbar is the one
// place where everything competes for width. At 900px the brand block, five
// filter chips and the status pill all refused to shrink, so the search box
// was the only thing left to squeeze and it collapsed to nothing.
for (const width of [1440, 1100, 900, 760, 420]) {
  await page.setViewportSize({ width, height: 900 })
  await page.waitForTimeout(400)
  const box = await page.getByPlaceholder(/Camp, art, or an address|Search the playa/).boundingBox()
  // A share of the bar rather than a pixel count: text metrics differ between
  // platforms, and 150px was a number tuned on one machine's fonts. What
  // matters is that search is not the thing that got squeezed out.
  // The upper end is capped by the field's own maxWidth, which lands at ~30% of
  // a 1440px bar, so the floor sits below that rather than on top of it.
  const share = (box?.width ?? 0) / width
  assert(
    share > 0.25,
    `search keeps its share of the bar at ${width}px (${Math.round(box?.width ?? 0)}px, ${Math.round(share * 100)}%)`,
  )
}
await page.setViewportSize({ width: 1440, height: 900 })
await page.waitForTimeout(400)

assert(await page.getByRole('button', { name: 'Saved', exact: true }).isVisible(), 'saved layer has a clear labeled control')

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

// Numbered clusters are controls, not decoration: tapping one should reveal
// its individual camps/art without making the user hunt for zoom buttons.
const cluster = await page.evaluate(() => {
  const feature = window.__map.queryRenderedFeatures({ layers: ['poi-cluster'] })[0]
  if (!feature || feature.geometry.type !== 'Point') return undefined
  const point = window.__map.project(feature.geometry.coordinates)
  return { x: point.x, y: point.y, zoom: window.__map.getZoom() }
})
assert(Boolean(cluster), 'a visible cluster is available to expand')
if (cluster) {
  await page.locator('canvas').click({ position: { x: cluster.x, y: cluster.y } })
  await page.waitForTimeout(900)
  const expandedZoom = await page.evaluate(() => window.__map.getZoom())
  assert(
    expandedZoom > cluster.zoom + 0.5,
    `tapping a cluster zooms in (${cluster.zoom.toFixed(1)} → ${expandedZoom.toFixed(1)})`,
  )
}

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
// Counting immediately after the panel opens is a race — the rows arrive before
// the controls above them, and an absent button and an unrendered one look the
// same to count().
const closest = page.getByRole('button', { name: 'Closest' })
await closest.waitFor({ timeout: 10000 }).catch(() => {})
if (await closest.count()) {
  await closest.click()
  await page.waitForTimeout(700)
  const distances = await page
    .locator('.MuiDrawer-root .MuiListItemText-secondary')
    .allInnerTexts()
  const miles = distances
    .map((text) => /([\d.]+) mi(?![a-z])/.exec(text)?.[1])
    .filter(Boolean)
    .map(Number)
  // How many events fall in the window depends entirely on the year's schedule
  // and on when the test runs — before the gates it previews the opening hour,
  // which is nearly empty. The invariant worth asserting is that sorting by
  // distance actually produces distances for the events it does list.
  const rows = await page.locator('.MuiDrawer-root .MuiListItemText-secondary').count()
  // Events hosted by an art piece have nowhere to measure to while art
  // locations are still embargoed, so a few legitimately show no distance.
  assert(
    miles.length > 0 && miles.length >= rows * 0.9,
    `listed events show a distance when sorted by Closest (${miles.length} of ${rows})`,
  )
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

// Pick a camp out of the year's own listings rather than naming one: the
// placement changes completely between years, and a smoke test that hard-codes
// last year's camp fails for reasons that have nothing to do with the app.
const DATA_YEAR = process.env.NEXT_PUBLIC_DATA_YEAR ?? '2026'
const campName = await page.evaluate(async (year) => {
  const base = window.location.pathname.replace(/[/]$/, '')
  const camps = await (await fetch(`${base}/data/${year}/camp.json`)).json()
  const placed = camps.filter(
    (camp) =>
      typeof camp.location_string === 'string' &&
      camp.location_string.includes('&') &&
      /^[\w' -]{6,28}$/.test(camp.name ?? ''),
  )
  return placed[Math.floor(placed.length / 2)]?.name
}, DATA_YEAR)
if (!campName) throw new Error('No addressed camp in the published listings to drive the test with.')
console.log(`      using camp "${campName}" from this year's listings`)

// Select that camp by name, star it, and confirm it persists.
const search = page.getByPlaceholder(/Camp, art, or an address/)
await search.fill('')
await search.fill(campName)
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
// By its own handle rather than by MUI's class: on a wide screen the listing
// is a column beside the map, not a drawer over it, so there is no
// `.MuiDrawer-root` to find.
const drawerText = await page.getByTestId('detail-panel').innerText()
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
await search.fill(campName)
await page.waitForTimeout(700)
await page.keyboard.press('ArrowDown')
await page.keyboard.press('Enter')
await page.waitForTimeout(1200)
await page.getByRole('button', { name: /Take me there/i }).click()
await page.waitForTimeout(900)

assert(await page.getByTestId('navigation-target').isVisible(), 'navigation keeps a labeled destination target')
assert((await page.getByTestId('selection-target').count()) === 0, 'selection target becomes the navigation target')
const targetText = await page.getByTestId('navigation-target').innerText()
assert(
  targetText.includes('DESTINATION') && targetText.includes(campName),
  `map callout names the exact destination (${targetText.replace(/\n/g, ' · ')})`,
)
const destinationBox = await page.getByTestId('navigation-target').boundingBox()
assert(
  destinationBox &&
    destinationBox.x > 1440 * 0.3 &&
    destinationBox.x < 1440 * 0.7 &&
    destinationBox.y > 900 * 0.25 &&
    destinationBox.y < 900 * 0.7,
  `destination is recentered in the usable map (${Math.round(destinationBox?.x ?? -1)}, ${Math.round(destinationBox?.y ?? -1)})`,
)

const nav = await page.evaluate((name) => {
  const route = window.__map.queryRenderedFeatures({ layers: ['route-line'] })
  return { segments: route.length, bar: document.body.innerText.includes(name) }
}, campName)
assert(nav.segments > 0, `route line drawn (${nav.segments} segment)`)
assert(nav.bar, 'navigation bar names the destination')

const navText = await page.locator('.MuiPaper-root').filter({ hasText: campName }).first().innerText()
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

// A playa address names an intersection, so camps share one. Whichever of them
// wins the label is the name the user reads, and tapping it must open that
// camp: it used to open whichever feature the renderer returned first.
const contested = await page.evaluate(() => {
  const labels = window.__map.queryRenderedFeatures({ layers: ['poi-label'] })
  for (const label of labels) {
    if (!label.properties?.uid) continue
    const point = window.__map.project(label.geometry.coordinates)
    const beneath = window.__map
      .queryRenderedFeatures([[point.x - 12, point.y - 12], [point.x + 12, point.y + 12]], {
        layers: ['poi-dot'],
      })
      .filter((f) => f.properties?.uid)
    if (beneath.length > 1) {
      return { name: label.properties.name, x: point.x, y: point.y, beneath: beneath.length }
    }
  }
  return undefined
})
if (contested) {
  // The map is often still easing when this runs, and Playwright will wait for
  // a canvas to hold still forever. It never will.
  await page.locator('canvas').click({ position: { x: contested.x, y: contested.y }, force: true })
  await page.waitForTimeout(900)
  // Scoped to the panel's own handle: on a wide screen the listing is a column
  // beside the map rather than a drawer over it, so `.MuiDrawer-root` misses it
  // and every name read out of it came back empty.
  const opened = await page
    .getByTestId('detail-panel')
    .locator('h5, h6')
    .first()
    .innerText()
    .catch(() => '')
  assert(
    opened.trim() === contested.name,
    `tapping a shared pin opens the camp it is labelled with (read "${contested.name}", opened "${opened.trim()}")`,
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
} else {
  console.log('      no two camps drawn close enough to contest a label at this zoom')
}

// Tapping bare playa drops a shareable pin and puts the address in the URL.
/**
 * Ask the map where there is nothing, rather than guessing pixels. Hard-coded
 * coordinates land on a camp as soon as the placement changes, and the whole
 * point of the assertion is what happens when you tap ground with nothing on it.
 */
const bareSpot = async () => {
  return page.evaluate(() => {
    const map = window.__map
    const layers = ['poi-dot', 'poi-cluster', 'poi-label', 'saved-dot', 'toilet-dot', 'service-dot']
      .filter((id) => map.getLayer(id))
    const { x, y } = map.project(map.getCenter())
    const width = map.getCanvas().clientWidth
    const height = map.getCanvas().clientHeight
    const reach = Math.min(width, height) / 2 - 30
    for (let radius = 60; radius <= reach; radius += 30) {
      for (let step = 0; step < 24; step += 1) {
        const angle = (step / 24) * Math.PI * 2
        const at = { x: Math.round(x + Math.cos(angle) * radius), y: Math.round(y + Math.sin(angle) * radius) }
        if (at.x < 40 || at.y < 120 || at.x > width - 40 || at.y > height - 60) continue
        const hit = map.queryRenderedFeatures(
          [[at.x - 14, at.y - 14], [at.x + 14, at.y + 14]],
          { layers },
        )
        if (hit.length === 0) return at
      }
    }
    return undefined
  })
}

/** Asking a moving map where there is nothing gives an answer that has moved. */
const settle = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const map = window.__map
        if (!map.isMoving() && !map.isZooming() && map.loaded()) return resolve(undefined)
        map.once('idle', () => resolve(undefined))
        setTimeout(() => resolve(undefined), 4000)
      }),
  )

/**
 * Tap bare ground. The popover it opens hides itself after six seconds, so
 * "worked" means the address reached the URL *and* the Save action is still on
 * screen for the caller to use.
 */
const tapBarePlaya = async () => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // Whatever step ran last may have left the map deep inside a block, where
    // there are no empty pixels to find. The ground between the Man and the
    // Esplanade is open playa and is large on screen at city zoom.
    await page.evaluate(() => window.__map.jumpTo({ zoom: 14.2 }))
    await settle()
    const at = await bareSpot()
    if (!at) continue
    await page.locator('canvas').click({ position: at, force: true })
    await page.waitForTimeout(700)
    const address = new URL(page.url()).searchParams.get('at')
    if (address && (await page.getByRole('button', { name: /^Save$/ }).count()) > 0) {
      return { at, address }
    }
  }
  return undefined
}

const probe = await tapBarePlaya()
if (!probe) {
  console.log(
    '      ' +
      JSON.stringify(
        await page.evaluate(() => {
          const map = window.__map
          const wanted = ['poi-dot', 'poi-cluster', 'poi-label', 'saved-dot', 'toilet-dot', 'service-dot']
          return {
            zoom: Number(map.getZoom().toFixed(2)),
            canvas: [map.getCanvas().clientWidth, map.getCanvas().clientHeight],
            layersPresent: wanted.filter((id) => map.getLayer(id)),
            layersMissing: wanted.filter((id) => !map.getLayer(id)),
          }
        }),
      ),
  )
}
assert(Boolean(probe), 'found a patch of bare playa to tap')
assert(
  Boolean(probe?.address),
  `tapping playa puts an address in the URL (${probe?.address ?? 'nothing'})`,
)

// Deleting a saved spot is the only destructive thing here, and what it
// destroys is where somebody's tent is. The undo has to be reachable.
await page.getByRole('button', { name: /^Save$/ }).click()
await page.waitForTimeout(600)
await page.getByRole('textbox').last().fill('Undo probe')
await page.getByRole('button', { name: /^Save$/ }).last().click()
await page.waitForTimeout(900)
await page.getByLabel('Filters and saved spots').click()
await page.waitForTimeout(800)
assert(await page.getByText('Undo probe').count() > 0, 'saved spot is listed to delete')
await page.getByLabel('Delete Undo probe').click()
await page.waitForTimeout(800)
// The snackbar announcing the removal names the spot too, so ask the list
// itself: its delete control is the thing that goes away.
assert(
  (await page.getByLabel('Delete Undo probe').count()) === 0,
  'deleting a saved spot removes it from the list',
)
const undo = page.getByRole('button', { name: /^Undo$/ })
assert(await undo.count() > 0, 'deleting a saved spot offers an undo')
await undo.click()
await page.waitForTimeout(900)
assert(
  (await page.getByLabel('Delete Undo probe').count()) > 0,
  'undo puts the deleted spot back',
)
await page.getByLabel('Delete Undo probe').click()
await page.waitForTimeout(600)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// Saving a spot and getting back to it — the thing this app is for at 4am.
// The undo check above used up the previous probe, so ask for bare ground again.
assert(Boolean(await tapBarePlaya()), 'bare playa is tappable again after the undo check')
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
assert(await page.getByTestId('navigation-target').isVisible(), 'saved-spot navigation shows a destination target')
assert(
  (await page.getByTestId('navigation-target').innerText()).includes('My camp'),
  'saved-spot destination is named on the map',
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

// A shared listing link goes to a page of its own so it previews as that place.
// Nobody is meant to read that page — it has to hand the reader on to the map
// with the camp already open, or the preview was the only thing it was good for.
{
  const linked = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await linked.newPage()
  const listings = await (
    await linked.request.get(new URL(`data/${DATA_YEAR}/camp.json`, url).href)
  ).json()
  const camp = listings.find((entry) => entry.location_string && entry.uid && entry.name)
  await page.goto(new URL(`p/${camp.uid}/`, url).href, { waitUntil: 'load' })
  await page.waitForTimeout(1200)
  assert(
    new URL(page.url()).searchParams.get('poi') === camp.uid,
    'a shared listing link hands the reader on to the map',
  )
  await page.waitForFunction(() => window.__map, null, { timeout: 30000 })
  await page.waitForTimeout(3000)
  // Scoped to the panel's own handle: on a wide screen the listing is a column
  // beside the map rather than a drawer over it, so `.MuiDrawer-root` misses it
  // and every name read out of it came back empty.
  const opened = await page
    .getByTestId('detail-panel')
    .locator('h5, h6')
    .first()
    .innerText()
    .catch(() => '')
  assert(
    opened.trim() === camp.name,
    `a shared listing link opens that listing (wanted "${camp.name}", got "${opened.trim()}")`,
  )
  await linked.close()
}

/**
 * A GPS fix from hundreds of miles away is a real fix and a useless origin.
 * Taken at face value it drew a route line off the edge of the map and quoted a
 * walk of 157 hours, so past the approach to the city the app measures from the
 * Man instead — which is what it already does when there is no fix at all.
 */
{
  const base = new URL(`data/${DATA_YEAR}/`, url).href
  const reachFrom = async (label, geolocation) => {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      geolocation,
      permissions: ['geolocation'],
    })
    const page = await ctx.newPage()
    const listings = await (await ctx.request.get(`${base}camp.json`)).json()
    const layout = await (await ctx.request.get(`${base}layout.json`)).json()
    const man = layout.center.geometry.coordinates
    const camp = listings.find((entry) => entry.location_string && entry.uid && entry.name)

    await page.goto(new URL(`p/${camp.uid}/`, url).href, { waitUntil: 'load' })
    await page.waitForFunction(() => window.__map, null, { timeout: 30000 })
    await page.waitForTimeout(3000)
    // A fresh context gets the first-run screen, and it covers the panel.
    const firstRun = page.getByRole('button', { name: /Show me the map/ })
    if (await firstRun.count()) {
      await firstRun.first().click()
      await page.waitForTimeout(2000)
    }
    // Asking to be taken somewhere is what starts the watch, so the route only
    // exists after this click. Without it the whole check passes vacuously.
    await page.getByRole('button', { name: /Take me there/ }).first().click()
    await page.waitForTimeout(4000)

    const result = await page.evaluate((man) => {
      const source = window.__map.getSource('route')
      const data = source && (source._data ?? source.serialize?.().data)
      const points = []
      const walk = (node) => {
        if (Array.isArray(node)) {
          if (node.length === 2 && typeof node[0] === 'number') points.push(node)
          else node.forEach(walk)
        } else if (node && typeof node === 'object') Object.values(node).forEach(walk)
      }
      if (data) walk(data)
      return {
        points: points.length,
        reach: points.length
          ? Math.max(...points.map(([lng, lat]) => Math.hypot(lng - man[0], lat - man[1])))
          : null,
        readout: document.body.innerText,
      }
    }, man)
    await ctx.close()
    assert(result.points > 0, `${label}: a route is drawn at all (${result.points} points)`)
    return result
  }

  // A degree is about 111km here, so the whole city and the road in fit inside a
  // third of one. San Francisco is four degrees away and unmissable.
  const near = await reachFrom('near fix', { latitude: 40.7772, longitude: -119.1893 })
  const far = await reachFrom('distant fix', { latitude: 37.7749, longitude: -122.4194 })
  assert(near.reach < 0.35, `a fix in the city routes from the fix (${near.reach.toFixed(3)}°)`)
  assert(/toward \d/.test(near.readout), 'a fix in the city gives a bearing to walk')
  assert(
    far.reach < 0.35,
    `a distant fix does not drag the route off the map (${far.reach.toFixed(3)}° from the Man)`,
  )
  assert(
    /from the Man/.test(far.readout),
    'a distant fix says the distance is measured from the Man',
  )
}

console.log(problems.length ? `\n${problems.length} problem(s):\n` + problems.join('\n') : '\nno console or network errors')
await browser.close()
process.exit(problems.length || process.exitCode ? 1 : 0)

function assert(ok, label) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) process.exitCode = 1
}
