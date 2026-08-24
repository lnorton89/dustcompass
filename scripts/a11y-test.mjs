/**
 * Accessibility audit across the states the app actually has. Runs axe against
 * the map, each panel, and the phone layout.
 *
 *   npm run dev & node scripts/a11y-test.mjs http://127.0.0.1:5173/
 */
import { chromium, devices } from 'playwright'
import AxeBuilder from '@axe-core/playwright'

const url = process.argv[2] ?? 'http://127.0.0.1:5173/'
// CHROME_PATH points at a pinned build in some sandboxes; elsewhere (CI,
// a normal checkout) Playwright resolves its own download.
const CHROME = process.env.CHROME_PATH || undefined
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

const browser = await chromium.launch({
  ...(CHROME ? { executablePath: CHROME } : {}),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-proxy-server', '--no-sandbox'],
})

let failed = false

async function audit(page, label) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  if (violations.length === 0) {
    console.log(`PASS  ${label}`)
    return
  }
  failed = true
  console.log(`FAIL  ${label} — ${violations.length} violation(s)`)
  for (const v of violations) {
    console.log(`        [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`)
    console.log(`        ${(v.nodes[0].failureSummary ?? '').split('\n').join(' | ')}`)
  }
}

async function ready(page) {
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForFunction(() => document.documentElement.dataset.mapReady === 'true', null, {
    timeout: 30000,
  })
  await page.waitForTimeout(2500)
}

/**
 * The first-run explainer is a modal, so it owns the pointer until it is gone.
 * Audited on the way past rather than suppressed: it is the first thing a new
 * user meets, which makes it the last thing that should go unchecked.
 */
async function clearFirstRun(page, label) {
  const dismiss = page.getByRole('button', { name: /Show me the map/i })
  if (!(await dismiss.count())) return
  await audit(page, label)
  await dismiss.click()
  await page.waitForTimeout(500)
}

// Desktop: map, events, a listing, and navigation.
{
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    geolocation: { latitude: 40.7772, longitude: -119.1893 },
    permissions: ['geolocation'],
  })
  const page = await context.newPage()
  await ready(page)
  await clearFirstRun(page, 'first run')
  await audit(page, 'map')

  // Red night mode drops contrast deliberately; it still has to pass.
  await page.getByLabel('Switch to light mode').click()
  await page.waitForTimeout(900)
  await page.getByLabel('Switch to red night mode').click()
  await page.waitForTimeout(1200)
  await audit(page, 'red night mode')
  await page.getByLabel('Switch to dark mode').click()
  await page.waitForTimeout(900)

  await page.getByLabel('Show events').click()
  await page.waitForTimeout(800)
  await audit(page, 'events panel')
  await page.getByLabel('Close events').click()
  await page.waitForTimeout(500)

  // Take a camp from the year's own listings. Naming one keeps working right
  // up until the placement changes, and then fails for a reason that has
  // nothing to do with accessibility.
  const campName = await page.evaluate(async (year) => {
    const root = window.location.pathname.replace(/[/]$/, '')
    const camps = await (await fetch(`${root}/data/${year}/camp.json`)).json()
    const placed = camps.filter(
      (camp) => camp.location_string?.includes('&') && /^[\w' -]{6,28}$/.test(camp.name ?? ''),
    )
    return placed[Math.floor(placed.length / 2)]?.name
  }, process.env.NEXT_PUBLIC_DATA_YEAR ?? '2026')
  if (!campName) throw new Error('No addressed camp in the published listings to audit with.')

  const search = page.getByPlaceholder(/Camp, art, or an address/)
  await search.fill(campName)
  await page.waitForTimeout(700)
  await audit(page, 'search suggestions')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1200)
  await audit(page, 'listing details')

  await page.getByRole('button', { name: /Take me there/i }).click()
  await page.waitForTimeout(1200)
  await audit(page, 'navigating')
  await context.close()
}

// Phone: the compact toolbar and the filter sheet.
{
  const context = await browser.newContext({ ...devices['Pixel 7'] })
  const page = await context.newPage()
  await ready(page)
  await clearFirstRun(page, 'phone first run')
  await audit(page, 'phone map')
  await page.getByLabel('Filters and saved spots').click()
  await page.waitForTimeout(800)
  await audit(page, 'phone filter sheet')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)

  // The save dialog, reached by tapping bare playa.
  await page.locator('canvas').click({ position: { x: 200, y: 400 } })
  await page.waitForTimeout(900)
  const save = page.getByRole('button', { name: 'Save', exact: true })
  if (await save.count()) {
    await save.click()
    await page.waitForTimeout(600)
    await audit(page, 'save spot dialog')
  }
  await context.close()
}

await browser.close()
process.exit(failed ? 1 : 0)
