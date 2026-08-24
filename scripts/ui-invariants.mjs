/**
 * The three things the UI review measured, kept measured.
 *
 *   npm run build && node scripts/serve-export.mjs &
 *   node scripts/ui-invariants.mjs http://127.0.0.1:4173/dustcompass/
 *
 * Each of these was a real defect found by reading numbers out of the page
 * rather than by looking at it, and each is the kind that comes back quietly:
 * a control added to the toolbar squeezes the search box again, a surface added
 * to the map forgets the palette again, one `size="small"` undoes the touch
 * floor for a whole layout. None of them break a flow, so nothing else here
 * catches them.
 */
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'http://127.0.0.1:4173/dustcompass/'
const CHROME = process.env.CHROME_PATH || undefined

/** Below this the layout is the phone one: actions in the bottom bar, no chips. */
const COMPACT_MAX = 899
/** Every platform guideline agrees on 44px. See TOUCH in src/ui/theme.ts. */
const TOUCH = 44

const VIEWPORTS = [
  { name: '320', width: 320, height: 640 },
  { name: '375', width: 375, height: 812 },
  { name: '414', width: 414, height: 896 },
  { name: '768', width: 768, height: 1024 },
  { name: '812x375-landscape', width: 812, height: 375 },
  { name: '900', width: 900, height: 800 },
  { name: '1024', width: 1024, height: 768 },
  { name: '1280', width: 1280, height: 800 },
  { name: '1440', width: 1440, height: 900 },
  { name: '1920', width: 1920, height: 1080 },
]

let failed = false
const pass = (label) => console.log(`PASS  ${label}`)
const fail = (label, detail) => {
  failed = true
  console.log(`FAIL  ${label}`)
  if (detail) console.log(`        ${detail}`)
}
const skip = (label) => console.log(`SKIP  ${label}`)

const browser = await chromium.launch({
  ...(CHROME ? { executablePath: CHROME } : {}),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-proxy-server', '--no-sandbox'],
})

/**
 * The first-run explainer is a modal and would measure itself instead of the
 * app. Marked seen before boot; it has its own coverage in the a11y pass.
 */
async function open(viewport, reading = 'normal') {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.width <= COMPACT_MAX,
    hasTouch: viewport.width <= COMPACT_MAX,
    geolocation: { latitude: 40.7772, longitude: -119.1893 },
    permissions: ['geolocation'],
  })
  const page = await context.newPage()
  await page.addInitScript((size) => {
    try {
      localStorage.setItem('dust-compass:first-run:1', 'seen')
      localStorage.setItem('dust-compass:embargo-notice:2026', 'seen')
      localStorage.setItem('dust-compass:reading-size', size)
    } catch {
      /* private-mode storage throws; the notices are harmless if they appear */
    }
  }, reading)
  await page.goto(url, { waitUntil: 'load' })
  await page
    .waitForFunction(() => document.documentElement.dataset.mapReady === 'true', null, {
      timeout: 45000,
    })
    .catch(() => {})
  await page.waitForTimeout(2000)
  return { context, page }
}

/**
 * Anything a finger lands on, measured at the box that actually takes the tap
 * rather than at the glyph inside it — a text field's hit area is the outlined
 * root, not the `<input>`, and a chip's is the chip, not its label.
 */
const measureTargets = (page) =>
  page.evaluate(() => {
    const selector = 'button, [role="button"], a[href], .MuiOutlinedInput-root'
    const small = []
    for (const el of document.querySelectorAll(selector)) {
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      if (getComputedStyle(el).visibility === 'hidden') continue
      if (rect.width < 44 || rect.height < 44) {
        small.push({
          label: (el.getAttribute('aria-label') || el.textContent || el.tagName)
            .trim()
            .slice(0, 32),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        })
      }
    }
    return small
  })

const measureOverflow = (page) =>
  page.evaluate(() => {
    const doc = document.documentElement
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth }
  })

const measureSearch = (page) =>
  page.evaluate(() => {
    const field = document.querySelector('.MuiOutlinedInput-root')
    return field ? Math.round(field.getBoundingClientRect().width) : null
  })

// ---------------------------------------------------------------------------
// 1. The touch floor holds wherever a finger is the pointer.
// 2. The search field never gets narrower as the window gets wider.
// ---------------------------------------------------------------------------

const widths = []

for (const viewport of VIEWPORTS) {
  const { context, page } = await open(viewport)
  const compact = viewport.width <= COMPACT_MAX

  if (compact) {
    const small = await measureTargets(page)
    if (small.length === 0) {
      pass(`${viewport.name}: every target is at least ${TOUCH}px`)
    } else {
      fail(
        `${viewport.name}: ${small.length} target(s) under ${TOUCH}px`,
        small.map((t) => `${t.w}x${t.h} "${t.label}"`).join(', '),
      )
    }
  }

  const width = await measureSearch(page)
  if (width === null) fail(`${viewport.name}: no search field found`)
  else widths.push({ ...viewport, compact, width })
  await context.close()
}

// ---------------------------------------------------------------------------
// 1b. Raw, non-MUI map controls hold the touch floor too — not just the
// MUI-styled chrome the sweep above happens to catch on every load. The
// dropped-pin marker (#57) is a `<button>` styled by hand inside a MapLibre
// `<Marker>`, so none of MUI's IconButton/ToggleButton touch-floor rules
// reach it — and it does not exist in the DOM at all until a pin has
// actually been dropped, which is why the generic sweep above never caught
// it on a page load with nothing tapped yet.
// ---------------------------------------------------------------------------

{
  const { context, page } = await open({ name: '375', width: 375, height: 812 })
  const result = await page.evaluate(() => {
    const map = window.__map
    // `window.__map` is a test-only hook (see MapView.tsx), deliberately
    // built only into the `NEXT_PUBLIC_E2E=1` build and never the real
    // production one — this check needs live access to the map instance to
    // find a tappable patch of open playa, which a production build has no
    // way to offer. That is a property of the artifact under test, not a
    // real UI defect, so it is reported distinctly from an actual failure
    // rather than folded into the same "could not find open playa" case a
    // genuinely broken map would also produce.
    if (!map) return { ok: false, reason: 'no-map-handle' }
    const layers = ['poi-dot', 'poi-cluster', 'poi-label', 'saved-dot', 'toilet-dot', 'service-dot'].filter(
      (id) => map.getLayer(id),
    )
    const { x, y } = map.project(map.getCenter())
    const width = map.getCanvas().clientWidth
    const height = map.getCanvas().clientHeight
    const reach = Math.min(width, height) / 2 - 30
    for (let radius = 60; radius <= reach; radius += 30) {
      for (let step = 0; step < 24; step += 1) {
        const angle = (step / 24) * Math.PI * 2
        const candidate = {
          x: Math.round(x + Math.cos(angle) * radius),
          y: Math.round(y + Math.sin(angle) * radius),
        }
        if (candidate.x < 40 || candidate.y < 120 || candidate.x > width - 40 || candidate.y > height - 60) continue
        const hit = map.queryRenderedFeatures(
          [[candidate.x - 14, candidate.y - 14], [candidate.x + 14, candidate.y + 14]],
          { layers },
        )
        if (hit.length === 0) return { ok: true, x: candidate.x, y: candidate.y }
      }
    }
    return { ok: false, reason: 'not-found' }
  })
  if (!result.ok && result.reason === 'no-map-handle') {
    skip("dropped-pin marker hit target: needs the E2E build's window.__map, not exposed here")
  } else if (!result.ok) {
    fail('dropped-pin marker: could not find open playa to tap')
  } else {
    const at = { x: result.x, y: result.y }
    await page.locator('canvas').click({ position: at, force: true })
    await page.waitForTimeout(700)
    const pinBox = await page.evaluate(() => {
      const marker = document.querySelector('[aria-label^="Marked location:"]')
      if (!marker) return null
      const rect = marker.getBoundingClientRect()
      return { w: Math.round(rect.width), h: Math.round(rect.height) }
    })
    if (!pinBox) {
      fail('dropped-pin marker: tapping open playa did not drop a pin to measure')
    } else if (pinBox.w >= TOUCH && pinBox.h >= TOUCH) {
      pass(`dropped-pin marker hit target is at least ${TOUCH}px (${pinBox.w}x${pinBox.h})`)
    } else {
      fail(`dropped-pin marker hit target is under ${TOUCH}px`, `${pinBox.w}x${pinBox.h}`)
    }
  }
  await context.close()
}

/*
 * Checked within each layout rather than straight across, because the step from
 * the phone layout to the desktop one legitimately costs the search box width:
 * the brand mark, the filter keys and two control groups all arrive at once.
 * The bug this guards against lived inside the desktop layout — the filter
 * labels used to switch on at `lg` and take 240px out of search, so the field
 * was narrower on a 1280 desktop than on a 1024 laptop.
 */
for (const layout of ['compact', 'desktop']) {
  const run = widths.filter((w) => (layout === 'compact') === w.compact)
  const trail = run.map((w) => `${w.name}:${w.width}`).join(' → ')
  const dip = run.find((w, i) => i > 0 && w.width < run[i - 1].width)
  if (dip) {
    fail(`search width never shrinks as the ${layout} window grows`, trail)
  } else {
    pass(`search width never shrinks as the ${layout} window grows (${trail})`)
  }
}

// ---------------------------------------------------------------------------
// 2b. And all of it still holds with the text turned up.
//
// "Bigger text and labels" moves the whole type scale, which is exactly the
// change that overflows a 320px toolbar or pushes a control back under the
// touch floor. The setting is no use if switching it on breaks the layout it
// was meant to rescue.
// ---------------------------------------------------------------------------

for (const viewport of VIEWPORTS.filter((v) => v.width <= COMPACT_MAX)) {
  const { context, page } = await open(viewport, 'large')

  const small = await measureTargets(page)
  if (small.length === 0) {
    pass(`${viewport.name} at large text: every target is at least ${TOUCH}px`)
  } else {
    fail(
      `${viewport.name} at large text: ${small.length} target(s) under ${TOUCH}px`,
      small.map((t) => `${t.w}x${t.h} "${t.label}"`).join(', '),
    )
  }

  const { scrollWidth, clientWidth } = await measureOverflow(page)
  if (scrollWidth <= clientWidth) {
    pass(`${viewport.name} at large text: nothing overflows sideways`)
  } else {
    fail(
      `${viewport.name} at large text: the page scrolls sideways`,
      `scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`,
    )
  }

  await context.close()
}

// ---------------------------------------------------------------------------
// 3. All three palettes reach every surface, and night stays dark.
// ---------------------------------------------------------------------------

/** Relative luminance, WCAG's definition. 0 is black, 1 is white. */
const LUMA = `(rgb) => {
  const parts = String(rgb).match(/[\\d.]+/g)
  if (!parts) return null
  const [r, g, b] = parts.slice(0, 3).map(Number)
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}`

/**
 * The surfaces the review caught ignoring the palette: the disclaimer hard-coded
 * its colours, the app bar took MUI's grey, and MapLibre's chrome was white in
 * every mode. Named rather than swept, so a failure says which one broke.
 */
/**
 * Nothing pinned to the top of the map may sit on top of anything else there.
 *
 * There are four of them now — the credit footnote and three notices — and they
 * used to be positioned by hand at 56, 104 and 152 pixels, which is a guess
 * about how tall a line of text is. The guess was wrong the moment the footnote
 * above them grew a line, and it would have been wrong again the first time a
 * reader turned the text size up. They share a column now; this is what says so.
 */
async function noticesDoNotOverlap(page, label) {
  const overlaps = await page.evaluate(() => {
    const boxes = [
      ...document.querySelectorAll('[data-testid="api-disclaimer"], .MuiPaper-root'),
    ]
      .map((node) => ({ text: node.innerText.replace(/\s+/g, ' ').slice(0, 40), box: node.getBoundingClientRect() }))
      .filter(({ box }) => box.top < 0.6 * window.innerHeight && box.width > 40 && box.height > 10)
    const bad = []
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i].box
        const b = boxes[j].box
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
          bad.push(`"${boxes[i].text}" over "${boxes[j].text}"`)
        }
      }
    }
    return { bad, found: boxes.length }
  })
  // Finding nothing is not a pass. That is how the theme sweep quietly went on
  // reporting clean over a scale bar that had been deleted.
  if (overlaps.found < 2) {
    fail(
      `${label}: found nothing pinned to the top to check`,
      `expected the credit footnote and at least one notice, saw ${overlaps.found}`,
    )
  } else if (overlaps.bad.length === 0) {
    pass(`${label}: none of the ${overlaps.found} boxes pinned to the top overlap`)
  } else {
    fail(`${label}: notices are on top of each other`, overlaps.bad.join('; '))
  }
}

const SURFACES = {
  'app bar': '.MuiAppBar-root',
  disclaimer: '[data-testid="api-disclaimer"]',
  'bottom bar': 'nav.MuiPaper-root',
  'map controls': '.maplibregl-ctrl-group',
}

const readSurfaces = (page) =>
  page.evaluate(
    ([surfaces, lumaSource]) => {
      const luma = eval(lumaSource)
      const out = {}
      for (const [name, selector] of Object.entries(surfaces)) {
        const el = document.querySelector(selector)
        if (!el) continue
        const style = getComputedStyle(el)
        out[name] = {
          bg: style.backgroundColor,
          fg: style.color,
          bgLuma: luma(style.backgroundColor),
          area: Math.round(el.getBoundingClientRect().width * el.getBoundingClientRect().height),
        }
      }
      return out
    },
    [SURFACES, LUMA],
  )

{
  // A phone, because that is where the bottom bar and the compact chrome are.
  const { context, page } = await open({ name: '375', width: 375, height: 812 })
  await noticesDoNotOverlap(page, '375')
  const byMode = {}

  byMode.dark = await readSurfaces(page)
  await page.getByLabel(/Switch to light mode/i).click()
  await page.waitForTimeout(1200)
  byMode.light = await readSurfaces(page)
  await page.getByLabel(/Switch to red night mode/i).click()
  await page.waitForTimeout(1200)
  byMode.night = await readSurfaces(page)

  // Every surface has to look different in all three, or it is not themed.
  for (const name of Object.keys(SURFACES)) {
    const seen = ['dark', 'light', 'night'].map((mode) => byMode[mode][name]?.bg).filter(Boolean)
    // A surface that has stopped rendering used to skip silently, so this
    // kept reporting a clean theme sweep over elements that no longer
    // existed — a scale bar and an attribution pill, both since removed.
    // A named surface that cannot be found is a broken check, not a pass.
    if (seen.length < 3) {
      fail(`${name} was not found to check`, `${SURFACES[name]} matched nothing in ${3 - seen.length} of 3 themes`)
      continue
    }
    // Attribution text is transparent-backed; it is judged on its colour.
    const values = name.includes('text')
      ? ['dark', 'light', 'night'].map((mode) => byMode[mode][name].fg)
      : seen
    if (new Set(values).size === 3) {
      pass(`${name} is a different surface in each of the three themes`)
    } else {
      fail(
        `${name} renders the same in more than one theme`,
        `dark=${values[0]} light=${values[1]} night=${values[2]}`,
      )
    }
  }

  /*
   * Red night mode exists so the screen stops being a flashlight pointed at
   * your own night vision, and at everyone standing near you. A lit panel in it
   * is not a cosmetic slip, it is the mode failing to do its one job. The
   * ceiling is generous: night paper sits near 0.006, and MapLibre's white
   * chrome — the thing that was actually wrong — was 1.0.
   */
  const CEILING = 0.12
  const lit = Object.entries(byMode.night)
    .filter(([, surface]) => surface.bgLuma !== null && surface.bgLuma > CEILING)
    .map(([name, surface]) => `${name} ${surface.bg} (luma ${surface.bgLuma.toFixed(3)})`)
  if (lit.length === 0) {
    pass(`no surface in red night mode is brighter than ${CEILING} luminance`)
  } else {
    fail(`red night mode has lit surfaces`, lit.join(', '))
  }

  /*
   * And the same for what is written on them. The defect that started this was
   * not a lit panel — it was the disclaimer's text, hard-coded to the dust
   * cream and so rendering at 14.46:1 on near-black, the brightest thing on the
   * night screen. A background ceiling alone reads that as dark and passes it.
   *
   * The ceiling clears night's own brightest text (#ff8f8f, ~0.43) and catches
   * the cream (#e8e0cf, ~0.75) that was there before.
   */
  const TEXT_CEILING = 0.55
  const glaring = await page.evaluate(
    ([surfaces, lumaSource, ceiling]) => {
      const luma = eval(lumaSource)
      const out = []
      for (const [name, selector] of Object.entries(surfaces)) {
        const el = document.querySelector(selector)
        if (!el) continue
        const color = getComputedStyle(el).color
        const value = luma(color)
        if (value !== null && value > ceiling) out.push(`${name} ${color} (luma ${value.toFixed(3)})`)
      }
      return out
    },
    [SURFACES, LUMA, TEXT_CEILING],
  )
  if (glaring.length === 0) {
    pass(`no text in red night mode is brighter than ${TEXT_CEILING} luminance`)
  } else {
    fail(`red night mode has glaring text`, glaring.join(', '))
  }

  await context.close()
}

await browser.close()
console.log(failed ? '\nsome UI invariants regressed' : '\nall UI invariants hold')
process.exit(failed ? 1 : 0)
