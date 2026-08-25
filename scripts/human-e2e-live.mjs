import { chromium } from 'playwright'

const baseUrl = process.env.HUMAN_E2E_URL ?? 'https://lnorton89.github.io/dustcompass/'
const failures = []
const observations = []

function note(message) {
  observations.push(message)
  console.log(`OBSERVATION: ${message}`)
}
function fail(message) {
  failures.push(message)
  console.error(`HUMAN_E2E_FAILURE: ${message}`)
}
async function check(label, fn) {
  try {
    await fn()
    console.log(`PASS: ${label}`)
  } catch (error) {
    fail(`${label}: ${error?.message ?? error}`)
  }
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}
const sleep = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms))

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })

async function dismissFirstRun(page) {
  const button = page.getByRole('button', { name: /Show me the map/i })
  if (await button.count()) {
    await button.click()
    await sleep(500)
  }
}

async function clearTransientNotices(page) {
  const embargo = page.getByText(/Art locations are embargoed until Gates open\./)
  if (await embargo.count()) {
    const paper = embargo.locator('xpath=..')
    const dismiss = paper.getByRole('button', { name: 'Dismiss' })
    if (await dismiss.count()) {
      await dismiss.click()
      await sleep(300)
    }
  }
}

async function waitForMap(page) {
  await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 30000 })
  await sleep(1800)
}

// Journey 1: a real first-time participant planning on a phone from home.
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: 45.99, longitude: -122.84 },
    permissions: ['geolocation'],
  })
  const page = await context.newPage()
  await page.goto(baseUrl, { waitUntil: 'load' })

  await check('fresh phone explains the app before demanding interaction', async () => {
    await page.getByRole('heading', { name: 'Before you set off' }).waitFor({ timeout: 15000 })
    const body = await page.getByRole('dialog').innerText()
    assert(body.includes('Addresses are a time and a street'), 'address vocabulary is not explained')
    assert(body.includes('Save where you left things'), 'saving is not explained')
    assert(body.includes('It works with no signal'), 'offline behavior is not explained')
    await page.getByRole('button', { name: /Show me the map/i }).click()
    await waitForMap(page)
  })

  await check('required non-affiliation disclosure is actually present', async () => {
    const disclosure = page.getByTestId('api-disclaimer')
    await disclosure.waitFor({ timeout: 10000 })
    const text = await disclosure.innerText()
    assert(text.includes('This app is not affiliated, endorsed, or verified by Burning Man Project.'), 'required disclaimer text is missing')
    const dismiss = disclosure.getByRole('button', { name: /dismiss|close/i })
    if ((await dismiss.count()) === 0) {
      note('The always-on survey/non-affiliation surface has no dismiss control; this is tracked as #119.')
    }
  })

  await check('embargo notice can be dismissed and stays gone after reload', async () => {
    const embargo = page.getByText(/Art locations are embargoed until Gates open\./)
    if ((await embargo.count()) === 0) return
    const parent = embargo.locator('xpath=..')
    await parent.getByRole('button', { name: 'Dismiss' }).click()
    await sleep(300)
    assert((await embargo.count()) === 0, 'embargo notice remains after dismiss')
    await page.reload({ waitUntil: 'load' })
    await dismissFirstRun(page)
    await waitForMap(page)
    assert((await page.getByText(/Art locations are embargoed until Gates open\./).count()) === 0, 'embargo notice returns after reload')
  })

  await check('a planner can search a playa address, save it as My camp, and recover it after reload', async () => {
    const search = page.getByPlaceholder(/Camp, art, or an address|Search the playa/)
    await search.fill('7:30 & Esplanade')
    await sleep(700)
    const option = page.getByRole('option', { name: /Esplanade & 7:30/ }).first()
    await option.click()
    await sleep(600)
    const save = page.getByRole('button', { name: /^Save$/ }).last()
    await save.click()
    await page.getByRole('dialog').getByText('My camp', { exact: true }).click()
    await sleep(500)
    await page.reload({ waitUntil: 'load' })
    await dismissFirstRun(page)
    await waitForMap(page)
    await clearTransientNotices(page)
    await page.getByRole('button', { name: 'Layers', exact: true }).click()
    await page.getByText('Saved spots', { exact: true }).waitFor()
    const layerText = await page.locator('.MuiDrawer-paper').innerText()
    assert(layerText.includes('My camp'), 'saved camp is missing after reload')
    assert(/Esplanade.*7:30|7:30.*Esplanade/.test(layerText), 'saved camp lost its address')
    await page.getByRole('button', { name: /Close filters/i }).click()
  })

  await check('pre-event Events opens as an actual planning day, including opening-day rows', async () => {
    await page.getByRole('button', { name: 'Events', exact: true }).click()
    await page.getByRole('heading', { name: 'Events' }).waitFor()
    const today = page.getByRole('button', { name: 'Today', exact: true })
    assert((await today.getAttribute('aria-pressed')) === 'true', 'pre-event planner is not defaulted to Today')
    const rows = page.locator('.MuiDrawer-paper .MuiListItemButton-root')
    await rows.first().waitFor({ timeout: 10000 })
    assert((await rows.count()) > 20, 'opening-day planning has suspiciously few events')
    const drawer = await page.locator('.MuiDrawer-paper').innerText()
    assert(/Sun|Aug 30/i.test(drawer), 'opening Sunday is not represented in preview planning')
    await page.getByRole('button', { name: /Close events/i }).click()
  })

  await check('nearest-service lookup from home terminates with an explanation instead of hanging GPS', async () => {
    await page.getByRole('button', { name: 'Layers', exact: true }).click()
    await page.getByText('Nearest toilet', { exact: true }).click()
    const message = page.getByText(/too far from Black Rock City|outside Black Rock City|near Black Rock City/i)
    await message.waitFor({ timeout: 12000 })
  })

  await check('valid-prefix-plus-prose is not accepted as a confident open-playa address', async () => {
    const search = page.getByPlaceholder(/Camp, art, or an address|Search the playa/)
    await search.fill('7:30 2000 feet near the Temple')
    await sleep(900)
    const options = await page.getByRole('option').allInnerTexts()
    assert(!options.some((text) => /7:30.*2000/i.test(text)), `ambiguous prefix was offered as an address: ${options.join(' | ')}`)
  })

  await page.screenshot({ path: 'human-mobile-planning.png', fullPage: true })
  await context.close()
}

// Journey 2: someone already on playa who wants one destination, not a test harness.
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: 40.7772, longitude: -119.1893 },
    permissions: ['geolocation'],
  })
  await context.addInitScript(() => {
    localStorage.setItem('dust-compass:first-run:1', 'seen')
    localStorage.setItem('dust-compass:embargo-notice:2026', 'seen')
  })
  const page = await context.newPage()
  await page.goto(baseUrl, { waitUntil: 'load' })
  await waitForMap(page)

  const campName = await page.evaluate(async () => {
    const root = location.pathname.replace(/\/$/, '')
    const camps = await (await fetch(`${root}/data/2026/camp.json`)).json()
    return camps.find((camp) => typeof camp.location_string === 'string' && camp.location_string.includes('&') && (camp.name ?? '').length >= 8)?.name
  })

  await check('on-playa user can find a real camp and start navigation from ordinary UI', async () => {
    assert(campName, 'published data did not provide a searchable addressed camp')
    const search = page.getByPlaceholder(/Camp, art, or an address|Search the playa/)
    await search.fill(campName)
    await sleep(900)
    await page.getByRole('option').filter({ hasText: campName }).first().click()
    await page.getByRole('button', { name: /Take me there/i }).waitFor({ timeout: 10000 })
    await page.getByRole('button', { name: /Take me there/i }).click()
    const stop = page.getByRole('button', { name: /Stop navigating/i })
    await stop.waitFor({ timeout: 12000 })
    const screen = await page.locator('body').innerText()
    assert(screen.includes(campName), 'navigation does not name the destination')
    assert(!/\b1\d\d h\b|\b\d{3,} h\b/.test(screen), 'navigation is showing an absurd fallback travel time')
    await stop.click()
  })

  await check('event saving survives a realistic open-read-save-close cycle', async () => {
    await page.getByRole('button', { name: 'Events', exact: true }).click()
    await page.getByRole('button', { name: 'All', exact: true }).click()
    const rows = page.locator('.MuiDrawer-paper .MuiListItemButton-root')
    await rows.first().waitFor({ timeout: 10000 })
    await rows.first().click()
    const save = page.getByRole('button', { name: 'Save this event' })
    await save.waitFor({ timeout: 5000 })
    const title = await page.getByRole('dialog').locator('h2').innerText()
    await save.click()
    await page.getByRole('button', { name: 'Close event details' }).click()
    await page.getByRole('button', { name: 'Saved', exact: true }).click()
    await sleep(500)
    const panel = await page.locator('.MuiDrawer-paper').innerText()
    assert(panel.includes(title), `saved event "${title}" is not in Saved`)
    await page.getByRole('button', { name: /Close events/i }).click()
  })

  await check('prepared app still exposes saved planning state after the network disappears', async () => {
    await page.reload({ waitUntil: 'load' })
    await waitForMap(page)
    await context.setOffline(true)
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 20000 })
    await page.getByRole('button', { name: 'Events', exact: true }).click()
    await page.getByRole('button', { name: 'Saved', exact: true }).click()
    const rows = page.locator('.MuiDrawer-paper .MuiListItemButton-root')
    await rows.first().waitFor({ timeout: 10000 })
    assert((await rows.count()) > 0, 'saved events disappeared after offline reload')
    await context.setOffline(false)
  })

  await page.screenshot({ path: 'human-on-playa.png', fullPage: true })
  await context.close()
}

// Journey 3: desktop week planning and keyboard use.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript(() => {
    localStorage.setItem('dust-compass:first-run:1', 'seen')
    localStorage.setItem('dust-compass:embargo-notice:2026', 'seen')
  })
  const page = await context.newPage()
  await page.goto(baseUrl, { waitUntil: 'load' })
  await waitForMap(page)

  await check('desktop planner can use the documented keyboard-first flow without fighting the map', async () => {
    await page.keyboard.press('/')
    const search = page.getByPlaceholder(/Camp, art, or an address|Search the playa/)
    assert(await search.evaluate((el) => el === document.activeElement), '/ did not focus search')
    await page.keyboard.press('Escape')
    await page.keyboard.press('e')
    await page.getByRole('heading', { name: 'Events' }).waitFor({ timeout: 5000 })
    await page.getByLabel('Search events').fill('coffee')
    await sleep(700)
    const rows = page.locator('.MuiDrawer-paper .MuiListItemButton-root')
    await rows.first().waitFor({ timeout: 10000 })
    assert((await rows.count()) > 0, 'description/title search for coffee returned no event')
    await page.keyboard.press('Escape')
  })

  await page.screenshot({ path: 'human-desktop-planning.png', fullPage: true })
  await context.close()
}

await browser.close()
console.log('\n--- HUMAN E2E OBSERVATIONS ---')
for (const item of observations) console.log(`- ${item}`)
console.log('--- HUMAN E2E FAILURES ---')
for (const item of failures) console.log(`- ${item}`)
if (failures.length) process.exit(1)
