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

function searchBox(page) {
  return page.getByPlaceholder(/Camp, art, or an address|Search the playa/)
}

/**
 * Establish the search interaction from scratch for every independent journey.
 * A previous version called fill(name) when the input already contained name;
 * React/MUI then had no input transition to reopen its options and the test
 * falsely blamed navigation for a search setup failure (#126/#128).
 */
async function chooseSearchResult(page, query, optionText = query) {
  const search = searchBox(page)
  await search.click()
  await search.fill('')
  await search.type(query, { delay: 18 })
  const option = page.getByRole('option').filter({ hasText: optionText }).first()
  await option.waitFor({ timeout: 10000 })
  await option.click()
  return search
}

async function closeDetailIfOpen(page) {
  const close = page.getByLabel('Close details')
  if (await close.count()) await close.click()
}

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})

// Journey 1: a first-time participant planning from home on a phone.
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: 45.99, longitude: -122.84 },
    permissions: ['geolocation', 'clipboard-read', 'clipboard-write'],
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
    await chooseSearchResult(page, '7:30 & Esplanade', /Esplanade.*7:30|7:30.*Esplanade/)

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

  await journey(page, 'dropped address pin recovers share and clear actions after snackbar timeout', async () => {
    await chooseSearchResult(page, '6:00 & Esplanade', /Esplanade.*6:00|6:00.*Esplanade/)
    await page.getByRole('button', { name: 'Share', exact: true }).waitFor({ timeout: 4000 })

    // Let the transient action snackbar disappear the way it does in a real
    // planning session, then recover the actions by tapping the visible pin.
    await sleep(6500)
    assert((await page.getByRole('button', { name: 'Share', exact: true }).count()) === 0, 'pin action snackbar did not auto-hide')
    const marker = page.getByRole('button', { name: /Marked location: .*Reopen save and share options/i })
    await marker.click()
    await page.getByRole('button', { name: 'Share', exact: true }).click()
    await page.getByText(/Link copied|Could not copy the link/).waitFor({ timeout: 5000 })

    await marker.click()
    await page.getByRole('button', { name: 'Clear', exact: true }).click()
    assert((await marker.count()) === 0, 'Clear left the dropped marker on the map')
  })

  await journey(page, 'theme orientation and reading preferences survive reloads', async () => {
    const light = page.getByRole('button', { name: 'Switch to light mode' })
    await light.click()
    await page.getByRole('button', { name: 'Switch to red night mode' }).waitFor()
    await page.reload({ waitUntil: 'load' })
    await waitForMap(page)
    assert((await page.getByRole('button', { name: 'Switch to red night mode' }).count()) === 1, 'light theme did not survive reload')

    // Complete the full three-mode cycle rather than only testing one edge.
    await page.getByRole('button', { name: 'Switch to red night mode' }).click()
    await page.getByRole('button', { name: 'Switch to dark mode' }).waitFor()
    await page.getByRole('button', { name: 'Switch to dark mode' }).click()
    await page.getByRole('button', { name: 'Switch to light mode' }).waitFor()

    const orient = page.getByRole('button', { name: 'Orient the map so 12:00 points up' })
    await orient.click()
    await sleep(900)
    const storedCityUp = await page.evaluate(() => localStorage.getItem('dust-compass:city-up'))
    assert(storedCityUp === 'false', `orientation preference was not stored as north-up: ${storedCityUp}`)

    await page.getByRole('button', { name: /Filters and saved spots/i }).click()
    const bigger = page.getByLabel('Bigger text and labels')
    if (!(await bigger.isChecked())) await bigger.check()
    await page.getByRole('button', { name: /Close filters/i }).click()

    await page.reload({ waitUntil: 'load' })
    await waitForMap(page)
    const orientAfter = page.getByRole('button', { name: 'Orient the map so 12:00 points up' })
    assert((await orientAfter.getAttribute('aria-pressed')) === 'false', 'north-up orientation did not survive reload')
    await page.getByRole('button', { name: /Filters and saved spots/i }).click()
    assert(await page.getByLabel('Bigger text and labels').isChecked(), 'bigger-text preference did not survive reload')
    await page.getByLabel('Bigger text and labels').uncheck()
    await page.getByRole('button', { name: /Close filters/i }).click()
  })

  await journey(page, 'nearest service from far outside BRC terminates for every safety category', async () => {
    for (const label of ['Nearest toilet', 'Nearest ranger', 'Nearest medical']) {
      await page.getByRole('button', { name: /Filters and saved spots/i }).click()
      await page.getByText(label, { exact: true }).click()
      await page.getByText(/too far from Black Rock City|outside Black Rock City|near Black Rock City/i).waitFor({ timeout: 12000 })
    }
  })

  await journey(page, 'ambiguous open-playa prose is not promoted to a confident address', async () => {
    const search = searchBox(page)
    await search.click()
    await search.fill('')
    await search.type('7:30 2000 feet near the Temple', { delay: 18 })
    await sleep(900)
    const options = await page.getByRole('option').allInnerTexts()
    assert(!options.some((text) => /7:30.*2000/i.test(text)), `ambiguous address offered: ${options.join(' | ')}`)
  })

  await journey(page, 'malformed shared address does not create a confident pin', async () => {
    await page.goto(`${BASE_URL}?at=13%3A00&ll=-119.2%2C40.7`, { waitUntil: 'load' })
    await waitForMap(page)
    assert((await page.getByRole('button', { name: /Marked location:/ }).count()) === 0, 'malformed 13:00 deep link created a dropped pin')
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
    localStorage.setItem('dust-compass:disclaimer-surface:1', 'dismissed')
    localStorage.setItem('dust-compass:reading-size', 'large')
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
    await chooseSearchResult(page, fixture.name)
    const detail = page.getByTestId('detail-panel')
    await detail.waitFor({ timeout: 8000 })
    assert((await detail.innerText()).includes('Take me there'), 'selected camp has no obvious navigation action')

    const addFavorite = page.getByLabel('Add to favourites')
    if (await addFavorite.count()) await addFavorite.click()
    await page.getByLabel('Close details').click()

    await page.reload({ waitUntil: 'load' })
    await waitForMap(page)
    await chooseSearchResult(page, fixture.name)
    assert((await page.getByLabel('Remove from favourites').count()) === 1, 'favorite did not survive reload')
    await page.getByLabel('Close details').click()
  })

  await journey(page, 'nearest toilet ranger and medical all resolve from an on-playa fix', async () => {
    for (const label of ['Nearest toilet', 'Nearest ranger', 'Nearest medical']) {
      await page.getByRole('button', { name: /Filters and saved spots/i }).click()
      await page.getByText(label, { exact: true }).click()
      const detail = page.getByTestId('detail-panel')
      await detail.waitFor({ timeout: 12000 })
      assert((await detail.innerText()).length > 0, `${label} opened an empty detail surface`)
      await page.getByLabel('Close details').click()
    }
  })

  await journey(page, 'navigation starts reads cleanly stays above the map and stops cleanly', async () => {
    const search = await chooseSearchResult(page, fixture.name)
    await page.getByRole('button', { name: /Take me there/i }).click()
    const nav = page.getByTestId('navigation-bar')
    await nav.waitFor({ timeout: 12000 })

    assert(!(await search.evaluate((element) => element === document.activeElement)), 'Search regained focus when navigation started; mobile keyboard would reopen')
    const text = await nav.innerText()
    assert(text.includes(fixture.name), 'navigation no longer names the destination')
    assert(/\b(?:\d+(?:\.\d+)? mi|\d+ ft)\b/.test(text), 'navigation has no distance')
    assert(/toward \d{1,2}:\d{2}/.test(text), 'navigation has no playa-clock direction')

    const navZ = await nav.evaluate((element) => Number.parseInt(getComputedStyle(element).zIndex || '0', 10))
    const targetZ = await page.getByTestId('navigation-target').evaluate((element) => {
      const marker = element.closest('.maplibregl-marker')
      return Number.parseInt(marker ? getComputedStyle(marker).zIndex || '0' : '0', 10)
    })
    assert(navZ > targetZ, `navigation strip z-index ${navZ} is not above target marker ${targetZ}`)

    const box = await nav.boundingBox()
    assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844, 'large-text navigation strip escapes the mobile viewport')

    await page.getByLabel('Stop navigating').click()
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

  await journey(page, 'saved event remains available after a prepared offline cold launch', async () => {
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
    assert(await searchBox(page).isEnabled(), 'prepared offline cold launch left search disabled')
    await page.getByRole('button', { name: /Show events/i }).click()
    await page.getByRole('button', { name: 'Saved', exact: true }).click()
    const saved = page.locator('.MuiDrawer-paper .MuiListItemButton-root').filter({ hasText: title }).first()
    await saved.waitFor({ timeout: 10000 })
    await context.setOffline(false)
    await page.getByRole('button', { name: /Close events/i }).click()
  })

  await journey(page, 'official art audio survives offline reload and does not leak across art UIDs', async () => {
    const arts = await page.evaluate(async () => {
      const root = location.pathname.replace(/\/$/, '')
      const list = await (await fetch(`${root}/data/2026/art.json`)).json()
      return list
        .filter((item) => typeof item?.uid === 'string' && typeof item?.name === 'string' && typeof item?.location_string === 'string' && item.location_string.length > 0)
        .slice(0, 20)
        .map((item) => ({ uid: item.uid, name: item.name }))
    })

    if (arts.length === 0) {
      observe('Art-audio journey is armed but skipped because the deployed dataset still has no located art before the embargo release.')
      return
    }

    let audioArt
    for (const candidate of arts) {
      await closeDetailIfOpen(page)
      try {
        await chooseSearchResult(page, candidate.name)
      } catch {
        continue
      }
      const guide = page.getByText('Official Art Discovery Audio Guide', { exact: true })
      try {
        await guide.waitFor({ timeout: 3500 })
        audioArt = candidate
        break
      } catch {
        await closeDetailIfOpen(page)
      }
    }

    if (!audioArt) {
      observe('No located art fixture among the sampled published records had an official audio track; audio journey remains executable when one is present.')
      return
    }

    await page.getByRole('button', { name: 'Download for offline' }).click()
    const audio = page.locator('audio')
    await audio.waitFor({ timeout: 30000 })
    const firstSrc = await audio.getAttribute('src')
    assert(firstSrc?.startsWith('blob:'), 'downloaded art audio did not produce a playable object URL')

    const other = arts.find((candidate) => candidate.uid !== audioArt.uid)
    if (other) {
      await closeDetailIfOpen(page)
      await chooseSearchResult(page, other.name)
      await sleep(1200)
      const currentAudio = page.locator('audio')
      if (await currentAudio.count()) {
        const nextSrc = await currentAudio.getAttribute('src')
        assert(nextSrc !== firstSrc, 'previous art piece audio leaked into a different UID detail')
      }
    }

    await page.goto(`${BASE_URL}?poi=${encodeURIComponent(audioArt.uid)}`, { waitUntil: 'load' })
    await waitForMap(page)
    await page.locator('audio').waitFor({ timeout: 10000 })
    await context.setOffline(true)
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
    await waitForMap(page)
    await page.locator('audio').waitFor({ timeout: 10000 })
    await context.setOffline(false)
    await page.getByRole('button', { name: 'Remove offline audio' }).click()
    assert((await page.locator('audio').count()) === 0, 'removing cached art audio left its player active')
  })

  await context.close()
}

// Journey 3: desktop planning with the keyboard rather than phone controls.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript(() => {
    localStorage.setItem('dust-compass:first-run:1', 'seen')
    localStorage.setItem('dust-compass:embargo-notice:2026', 'seen')
    localStorage.setItem('dust-compass:disclaimer-surface:1', 'dismissed')
  })
  const page = await context.newPage()
  await page.goto(BASE_URL, { waitUntil: 'load' })
  await waitForMap(page)

  await journey(page, 'desktop planner can move from keyboard search to event browsing', async () => {
    await page.keyboard.press('/')
    const search = searchBox(page)
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
