import { chromium } from 'playwright'

const URL = 'https://lnorton89.github.io/dustcompass/'
const failures = []
const assert = (ok, why) => { if (!ok) throw new Error(why) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function run(label, page, fn) {
  try { await fn(); console.log(`PASS: ${label}`) }
  catch (e) {
    const safe = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 55)
    await page.screenshot({ path: `human-failure-${safe}.png`, fullPage: true }).catch(() => {})
    const msg = `${label}: ${e?.message ?? e}`
    failures.push(msg); console.error(`HUMAN_E2E_FAILURE: ${msg}`)
  }
}
async function waitMap(page) { await page.locator('canvas').first().waitFor({ timeout: 30000 }); await sleep(1200) }
async function dismissFirst(page) { const b = page.getByRole('button', { name: /Show me the map/i }); if (await b.count()) { await b.click(); await sleep(300) } }
async function dismissEmbargo(page) {
  const text = page.getByText(/Art locations are embargoed until Gates open\./)
  if (await text.count()) { const b = text.locator('xpath=..').getByRole('button', { name: 'Dismiss' }); if (await b.count()) { await b.click(); await sleep(250) } }
}
const layersButton = (page) => page.getByRole('button', { name: /Filters and saved spots/i })
const eventsButton = (page) => page.getByRole('button', { name: /Show events/i })

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })

// Phone planner from home.
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, geolocation: { latitude: 45.99, longitude: -122.84 }, permissions: ['geolocation'] })
  const page = await context.newPage(); await page.goto(URL); await dismissFirst(page); await waitMap(page); await dismissEmbargo(page)

  await run('address search immediately exposes a human-visible way to save the dropped place', page, async () => {
    const search = page.getByPlaceholder(/Camp, art, or an address|Search the playa/)
    await search.fill('7:30 & Esplanade'); await sleep(700)
    await page.getByRole('option', { name: /Esplanade & 7:30/ }).first().click(); await sleep(800)
    const save = page.getByRole('button', { name: /^Save$/ })
    assert((await save.count()) > 0, `no Save action appeared after choosing the address; visible text was: ${(await page.locator('body').innerText()).slice(0, 1200)}`)
    await save.last().click(); await page.getByRole('dialog').getByText('My camp', { exact: true }).click(); await sleep(350)
    await page.reload({ waitUntil: 'load' }); await dismissFirst(page); await waitMap(page); await dismissEmbargo(page)
    await layersButton(page).click(); await page.getByText('Saved spots', { exact: true }).waitFor()
    const text = await page.locator('.MuiDrawer-paper').innerText()
    assert(text.includes('My camp'), 'My camp did not survive reload')
    await page.getByRole('button', { name: /Close filters/i }).click()
  })

  await run('pre-event Events defaults to a useful opening-day planning view', page, async () => {
    await eventsButton(page).click(); await page.getByRole('heading', { name: 'Events' }).waitFor()
    const today = page.getByRole('button', { name: 'Today', exact: true })
    assert((await today.getAttribute('aria-pressed')) === 'true', 'Today is not selected in preview mode')
    const rows = page.locator('.MuiDrawer-paper .MuiListItemButton-root'); await rows.first().waitFor({ timeout: 10000 })
    assert((await rows.count()) > 20, `only ${await rows.count()} events are visible in opening-day preview`)
    const body = await page.locator('.MuiDrawer-paper').innerText()
    assert(/Sun|Aug 30/i.test(body), 'opening Sunday is absent from the default preview')
    await page.getByRole('button', { name: /Close events/i }).click()
  })

  await run('nearest toilet from home terminates instead of leaving a location request hanging', page, async () => {
    await layersButton(page).click(); await page.getByText('Nearest toilet', { exact: true }).click()
    await page.getByText(/too far from Black Rock City|outside Black Rock City|near Black Rock City/i).waitFor({ timeout: 12000 })
  })

  await run('Events search native textbox has the intended accessible name', page, async () => {
    await eventsButton(page).click()
    const input = page.getByRole('textbox', { name: 'Search events' })
    assert((await input.count()) === 1, `expected one textbox named Search events, found ${await input.count()}`)
    await input.fill('coffee'); await sleep(500)
    assert((await page.locator('.MuiDrawer-paper .MuiListItemButton-root').count()) > 0, 'coffee search returned no rows')
    await page.getByRole('button', { name: /Close events/i }).click()
  })
  await context.close()
}

// On-playa user.
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, geolocation: { latitude: 40.7772, longitude: -119.1893 }, permissions: ['geolocation'] })
  await context.addInitScript(() => { localStorage.setItem('dust-compass:first-run:1', 'seen'); localStorage.setItem('dust-compass:embargo-notice:2026', 'seen') })
  const page = await context.newPage(); await page.goto(URL); await waitMap(page)

  await run('saved-event flow works as a continuous human task', page, async () => {
    await eventsButton(page).click(); await page.getByRole('button', { name: 'All', exact: true }).click()
    const row = page.locator('.MuiDrawer-paper .MuiListItemButton-root').first(); await row.waitFor({ timeout: 10000 }); await row.click()
    const dialog = page.getByRole('dialog'); const title = await dialog.locator('h2').innerText()
    await page.getByRole('button', { name: 'Save this event' }).click(); await page.getByRole('button', { name: 'Close event details' }).click()
    await page.getByRole('button', { name: 'Saved', exact: true }).click(); await sleep(500)
    assert((await page.locator('.MuiDrawer-paper').innerText()).includes(title), `saved event ${title} is missing from Saved`)
    await page.getByRole('button', { name: /Close events/i }).click()
  })

  await run('saved event remains reachable after a warm offline reload', page, async () => {
    await page.reload({ waitUntil: 'load' }); await waitMap(page); await context.setOffline(true); await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.locator('canvas').first().waitFor({ timeout: 20000 }); await eventsButton(page).click(); await page.getByRole('button', { name: 'Saved', exact: true }).click()
    const rows = page.locator('.MuiDrawer-paper .MuiListItemButton-root'); await rows.first().waitFor({ timeout: 10000 }); assert((await rows.count()) > 0, 'no saved events survived offline reload')
    await context.setOffline(false)
  })
  await context.close()
}

// Desktop planner: this deliberately uses the accessibility tree, not CSS internals.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await context.addInitScript(() => { localStorage.setItem('dust-compass:first-run:1', 'seen'); localStorage.setItem('dust-compass:embargo-notice:2026', 'seen') })
  const page = await context.newPage(); await page.goto(URL); await waitMap(page)
  await run('desktop event-search textbox is accessible and editable through its semantic name', page, async () => {
    await page.keyboard.press('e'); await page.getByRole('heading', { name: 'Events' }).waitFor()
    const input = page.getByRole('textbox', { name: 'Search events' })
    assert((await input.count()) === 1, `expected one textbox named Search events, found ${await input.count()}`)
    await input.fill('coffee'); await sleep(500); assert((await page.locator('.MuiDrawer-paper .MuiListItemButton-root').count()) > 0, 'coffee search returned no rows')
  })
  await context.close()
}

await browser.close()
console.log('--- HUMAN E2E FAILURES ---'); for (const f of failures) console.log(`- ${f}`)
if (failures.length) process.exit(1)
