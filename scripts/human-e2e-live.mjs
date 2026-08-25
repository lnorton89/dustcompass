import { chromium } from 'playwright'

/**
 * Stateful, human-oriented journeys against the deployed site.
 *
 * This deliberately differs from smoke.mjs: it carries preferences and saved
 * state across multiple actions/reloads, chooses real published fixtures, and
 * asks whether a normal person can discover and complete a task without using
 * window.__map or other test-only controls.
 */
const BASE_URL = process.env.HUMAN_E2E_URL ?? 'https://lnorton89.github.io/dustcompass/'
const failures = []
const observations = []
const sleep = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms))
const assert = (condition, message) => { if (!condition) throw new Error(message) }

function safeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 55)
}

async function journey(page, name, fn) {
  try {
    await fn()
    console.log(`PASS: ${name}`)
  } catch (error) {
    const message = `${name}: ${error?.message ?? error}`
    failures.push(message)
    console.error(`HUMAN_E2E_FAILURE: ${message}`)
    await page.screenshot({ path: `human-e2e-${safeName(name)}.png`, fullPage: true }).catch(() => {})
  }
}

function observe(message) {
  observations.push(message)
  console.log(`OBSERVATION: ${message}`)
}

async function waitForMap(page) {
  await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 30000 })
  await sleep(1000)
}

async function dismissFirstRun(page) {
  const button = page.getByRole('button', { name: /Show me the map/i })
  if (await button.count()) await button.click()
}

async function dismissEmbargoIfPresent(page) {
  const text = page.getByText(/Art locations are embargoed until Gates open\./)
  if (!(await text.count())) return
  const dismiss = text.locator('xpath=..').getByRole('button', { name: 'Dismiss' })
  if (await dismiss.count()) await dismiss.click()
}

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})

// Journey 1: a first-time participant planning from home on a phone.
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: 45.99, longitude: -122.84 },
    permissions: ['geolocation'],
  })
  const page = await context.newPage()
  await page.goto(BASE_URL, { waitUntil: 'load' })

  await journey(page, 'first run teaches the tasks a new user needs', async () => {
    const dialog = page.getByRole('dialog')
    await page.getByRole('heading', { name: 'Before you set off' }).waitFor({ timeout: 15000 })
    const text = await dialog.innerText()
    assert(text.includes('Addresses are a time and a street'), 'address vocabulary is not explained')
    assert(text.includes('Save where you left things'), 'saving is not explained')
    assert(text.includes('It works with no signal'), 'offline behavior is not explained')
    await page.getByRole('button', { name: /Show me the map/i }).click()
    await waitForMap(page)
  })

  await journey(page, 'survey disclosure can be dismissed without losing the disclosure', async () => {
    const surface = page.getByTestId('api-disclaimer')
    await surface.waitFor({ timeout: 10000 })
    assert((await surface.innerText()).includes('This app is not affiliated, endorsed, or verified by Burning Man Project.'), 'required disclaimer is missing')
    await page.getByRole('button', { name: 'Dismiss survey and disclaimer' }).click()
    assert((await surface.count()) === 0, 'disclaimer surface did not disappear')

    await page.reload({ waitUntil: 'load' })
    await dismissFirstRun(page)
    await waitForMap(page)
    assert((await page.getByTestId('api-disclaimer').count()) === 0, 'dismissed disclaimer surface returned after reload')

    await page.getByRole('button', { name: /Filters and saved spots/i }).click()
    const drawer = page.locator('.MuiDrawer-paper')
    const about = await drawer.innerText()
    assert(about.includes('About this map'), 'persistent disclosure has no About section')
    assert(about.includes('City survey & listings: Burning Man Project.'), 'survey attribution disappeared after dismiss')
    assert(about.includes('This app is not affiliated, endorsed, or verified by Burning Man Project.'), 'required disclaimer disappeared after dismiss')
    await page.getByRole('button', { name: /Close filters/i }).click()
  })

  await dismissEmbargoIfPresent(page)

  await journey(page, 'address search immediately supports save and survives reload', async () => {
    const search = page.getByPlaceholder(/Camp, art, or an address|Search the playa/)
    await search.fill('7:30 & Esplanade')
    await sleep(700)
    const option = page.getByRole('option').filter({ hasText: /Esplanade.*7:30|7:30.*Esplanade/ }).first()
    await option.waitFor({ timeout: 8000 })
    await option.click()

    const save = page.getByRole('button', { name: /^Save$/ }).last()
    await save.waitFor({ timeout: 3000 })
    await save.click()
    await page.getByRole('dialog').getByText('My camp', { exact: true }).click()

    await page.reload({ waitUntil: 'load' })
    await waitForMap(page)
    await page.getByRole('button', { name: /Filters and saved spots/i }).click()
    const drawer = await page.locator('.MuiDrawer-paper').innerText()
    assert(drawer.includes('My camp'), 'saved camp disappeared after reload')
    assert(/Esplanade.*7:30|7:30.*Esplanade/.test(drawer), 'saved camp lost its playa address')
    await page.getByRole('button', { name: /Close filters/i }).click()
  })

  await journey(page, 'nearest service from far outside BRC terminates with useful feedback', async () => {
    await page.getByRole('button', { name: /Filters and saved spots/i }).click()
    await page.getByText('Nearest toilet', { exact: true }).click()
    await page.getByText(/too far from Black Rock City|outside Black Rock City|near Black Rock City/i).waitFor({ timeout: 12000 })
  })

  await journey(page, 'ambiguous open-playa prose is not promoted to a confident address', async () => {
    const search = page.getByPlaceholder(/Camp, art, or an address|Search the playa/)
    await search.fill('7:30 2000 feet near the Temple')
    await sleep(900)
    const options = await page.getByRole('option').allInnerTexts()
    assert(!options.some((text) => /7:30.*2000/i.test(text)), `ambiguous address offered: ${options.join(' | ')}`)
  })

  await context.close()
}

// Journey 2: a participant already on playa, carrying state through the task.
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: 40.7772, longitude: -119.1893 },
    permissions: ['geolocation'],
  })
  await context.addInitScript(() => {
    localStorage.setItem('dust-compass:first-run:1', 'seen')
    localStorage.setItem('dust-compass:embargo-notice:2026', 'seen')
    localStorage.setItem('dust-compass:api-disclaimer:2026', 'seen')
  })
  const page = await context.newPage()
  await page.goto(BASE_URL, { waitUntil: 'load' })
  await waitForMap(page)

  const fixture = await page.evaluate(async () => {
    const root = location.pathname.replace(/\/$/, '')
    const camps = await (await fetch(`${root}/data/2026/camp.json`)).json()
    const camp = camps.find((candidate) =>
      typeof candidate?.name === 'string' && candidate.name.length >= 10 && candidate.name.length <= 28 &&
      typeof candidate?.location_string === 'string' && candidate.location_string.includes('&') &&
      /^[A-Za-z0-9 '&().,-]+$/.test(candidate.name)
    )
    return camp && { uid: camp.uid, name: camp.name, address: camp.location_string }
  })
  assert(fixture, 'could not choose an ordinary addressed camp from published data')
  observe(`Using published camp fixture: ${fixture.name} at ${fixture.address}`)

  await journey(page, 'camp search detail favorite and reload form one continuous task', async () => {
    const search = page.getByPlaceholder(/Camp, art, or an address|Search the playa/)
    await search.fill(fixture.name)
    await sleep(800)
    await page.getByRole('option').filter({ hasText: fixture.name }).first().click()
    const detail = page.getByTestId('detail-panel')
    await detail.waitFor({ timeout: 8000 })
    assert((await detail.innerText()).includes('Take me there'), 'selected camp has no obvious navigation action')

    const addFavorite = page.getByLabel('Add to favourites')
    if (await addFavorite.count()) await addFavorite.click()
    await page.getByLabel('Close details').click()

    await page.reload({ waitUntil: 'load' })
    await waitForMap(page)
    await search.fill(fixture.name)
    await sleep(700)
    await page.getByRole('option').filter({ hasText: fixture.name }).first().click()
    assert((await page.getByLabel('Remove from favourites').count()) === 1, 'favorite did not survive reload')
    await page.getByLabel('Close details').click()
  })

  await journey(page, 'navigation starts reads like a human instruction and stops cleanly', async () => {
    const search = page.getByPlaceholder(/Camp, art, or an address|Search the playa/)
    await search.fill(fixture.name)
    await sleep(700)
    await page.getByRole('option').filter({ hasText: fixture.name }).first().click()
    await page.getByRole('button', { name: /Take me there/i }).click()
    const stop = page.getByLabel('Stop navigating')
    await stop.waitFor({ timeout: 12000 })
    const text = await page.locator('body').innerText()
    assert(text.includes(fixture.name), 'navigation no longer names the destination')
    assert(/\b(?:\d+(?:\.\d+)? mi|\d+ ft)\b/.test(text), 'navigation has no distance')
    assert(/toward \d{1,2}:\d{2}/.test(text), 'navigation has no playa-clock direction')
    await stop.click()
    assert((await page.getByLabel('Stop navigating').count()) === 0, 'navigation remained active after Stop')
  })

  await journey(page, 'listing deep link cold-opens the intended listing', async () => {
    await page.goto(`${BASE_URL}?poi=${encodeURIComponent(fixture.uid)}`, { waitUntil: 'load' })
    await waitForMap(page)
    const detail = page.getByTestId('detail-panel')
    await detail.waitFor({ timeout: 10000 })
    assert((await detail.innerText()).includes(fixture.name), 'deep link opened the wrong listing')
    assert(new URL(page.url()).searchParams.get('poi') === fixture.uid, 'valid poi query was erased while opening')
    await page.getByLabel('Close details').click()
  })

  await journey(page, 'stale deep link explains itself and has an escape path', async () => {
    await page.goto(`${BASE_URL}?poi=human-e2e-does-not-exist`, { waitUntil: 'load' })
    await waitForMap(page)
    const notice = page.getByText('This shared listing is no longer in the current map.')
    await notice.waitFor({ timeout: 10000 })
    assert(new URL(page.url()).searchParams.has('poi'), 'stale link was silently erased before explanation')
    await page.getByRole('button', { name: 'Show map' }).click()
    assert((await notice.count()) === 0, 'stale-link explanation did not dismiss')
    assert(!new URL(page.url()).searchParams.has('poi'), 'stale poi remained after choosing Show map')
  })

  await journey(page, 'saved event remains available after reload and offline transition', async () => {
    await page.getByRole('button', { name: /Show events/i }).click()
    await page.getByRole('button', { name: 'All', exact: true }).click()
    const row = page.locator('.MuiDrawer-paper .MuiListItemButton-root').first()
    await row.waitFor({ timeout: 10000 })
    await row.click()
    const dialog = page.getByRole('dialog')
    const title = (await dialog.locator('h2').innerText()).trim()
    const save = page.getByRole('button', { name: 'Save this event' })
    if (await save.count()) await save.click()
    await page.getByRole('button', { name: 'Close event details' }).click()
    await page.getByRole('button', { name: /Close events/i }).click()

    // One online reload lets a real browser finish service-worker/cache work,
    // exactly as a participant preparing the app before losing signal would.
    await page.reload({ waitUntil: 'load' })
    await waitForMap(page)
    await context.setOffline(true)
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
    await waitForMap(page)
    await page.getByRole('button', { name: /Show events/i }).click()
    await page.getByRole('button', { name: 'Saved', exact: true }).click()
    const saved = page.locator('.MuiDrawer-paper .MuiListItemButton-root').filter({ hasText: title }).first()
    await saved.waitFor({ timeout: 10000 })
    await context.setOffline(false)
  })

  await context.close()
}

// Journey 3: desktop planning with the keyboard rather than phone controls.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript(() => {
    localStorage.setItem('dust-compass:first-run:1', 'seen')
    localStorage.setItem('dust-compass:embargo-notice:2026', 'seen')
    localStorage.setItem('dust-compass:api-disclaimer:2026', 'seen')
  })
  const page = await context.newPage()
  await page.goto(BASE_URL, { waitUntil: 'load' })
  await waitForMap(page)

  await journey(page, 'desktop planner can move from keyboard search to event browsing', async () => {
    await page.keyboard.press('/')
    const search = page.getByPlaceholder(/Camp, art, or an address|Search the playa/)
    assert(await search.evaluate((element) => element === document.activeElement), '/ did not focus the main search')
    await page.keyboard.press('Escape')
    await page.keyboard.press('e')
    await page.getByRole('heading', { name: 'Events' }).waitFor({ timeout: 5000 })
    const eventSearch = page.getByRole('textbox', { name: 'Search events' })
    await eventSearch.fill('coffee')
    await sleep(700)
    const rows = page.locator('.MuiDrawer-paper .MuiListItemButton-root')
    await rows.first().waitFor({ timeout: 10000 })
    assert((await rows.count()) > 0, 'event search returned no coffee results')
    await page.keyboard.press('Escape')
  })

  await context.close()
}

await browser.close()

console.log('\n--- HUMAN E2E OBSERVATIONS ---')
for (const item of observations) console.log(`- ${item}`)
console.log('--- HUMAN E2E FAILURES ---')
for (const item of failures) console.log(`- ${item}`)
if (failures.length) process.exit(1)
