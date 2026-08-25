import { chromium } from 'playwright'

const URL = 'https://lnorton89.github.io/dustcompass/'
const failures = []
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const assert = (ok, message) => { if (!ok) throw new Error(message) }
async function test(page, name, fn) {
  try {
    await fn()
    console.log(`PASS: ${name}`)
  } catch (error) {
    const message = `${name}: ${error?.message ?? error}`
    failures.push(message)
    console.error(`HUMAN_E2E_FAILURE: ${message}`)
    const safe = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 45)
    await page.screenshot({ path: `human-v4-${safe}.png`, fullPage: true }).catch(() => {})
  }
}

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
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
await page.goto(URL, { waitUntil: 'load' })
await page.locator('canvas').first().waitFor({ timeout: 30000 })
await sleep(1200)

const search = () => page.getByPlaceholder(/Camp, art, or an address|Search the playa/)
const eventsButton = () => page.getByRole('button', { name: /Show events/i })
const layersButton = () => page.getByRole('button', { name: /Filters and saved spots/i })

const fixture = await page.evaluate(async () => {
  const root = location.pathname.replace(/\/$/, '')
  const camps = await (await fetch(`${root}/data/2026/camp.json`)).json()
  const camp = camps.find((c) =>
    typeof c?.name === 'string' && c.name.length >= 10 && c.name.length <= 28 &&
    typeof c?.location_string === 'string' && c.location_string.includes('&') &&
    /^[A-Za-z0-9 '&().,-]+$/.test(c.name)
  )
  return camp && { uid: camp.uid, name: camp.name, address: camp.location_string }
})
assert(fixture, 'could not choose a normal addressed camp fixture from the published data')
console.log(`FIXTURE: ${fixture.name} (${fixture.uid}) at ${fixture.address}`)

await test(page, 'camp search opens readable detail and favorite survives reload', async () => {
  await search().fill(fixture.name)
  await sleep(900)
  const option = page.getByRole('option').filter({ hasText: fixture.name }).first()
  await option.waitFor({ timeout: 8000 })
  await option.click()
  await page.getByTestId('detail-panel').waitFor({ timeout: 8000 })
  const detail = await page.getByTestId('detail-panel').innerText()
  assert(detail.includes(fixture.name), 'detail panel does not name selected camp')
  assert(detail.includes('Take me there'), 'detail panel has no clear navigation action')
  const add = page.getByLabel('Add to favourites')
  if (await add.count()) await add.click()
  await page.getByLabel('Close details').click()
  await page.reload({ waitUntil: 'load' })
  await page.locator('canvas').first().waitFor({ timeout: 30000 })
  await sleep(800)
  await search().fill(fixture.name)
  await sleep(700)
  await page.getByRole('option').filter({ hasText: fixture.name }).first().click()
  await page.getByTestId('detail-panel').waitFor()
  assert((await page.getByLabel('Remove from favourites').count()) === 1, 'favorite state did not survive reload')
  await page.getByLabel('Close details').click()
})

await test(page, 'camp navigation is a continuous start-read-stop task', async () => {
  await search().fill(fixture.name)
  await sleep(700)
  await page.getByRole('option').filter({ hasText: fixture.name }).first().click()
  await page.getByRole('button', { name: /Take me there/i }).click()
  const stop = page.getByLabel('Stop navigating')
  await stop.waitFor({ timeout: 12000 })
  const body = await page.locator('body').innerText()
  assert(body.includes(fixture.name), 'navigation strip does not name destination')
  assert(/\b(?:\d+(?:\.\d+)? mi|\d+ ft)\b/.test(body), 'navigation does not show a distance')
  assert(/toward \d{1,2}:\d{2}/.test(body), 'navigation does not show a playa clock heading')
  await stop.click()
  await sleep(350)
  assert((await page.getByLabel('Stop navigating').count()) === 0, 'navigation did not clear after Stop')
})

await test(page, 'listing deep link cold-opens the intended camp', async () => {
  await page.goto(`${URL}?poi=${encodeURIComponent(fixture.uid)}`, { waitUntil: 'load' })
  await page.locator('canvas').first().waitFor({ timeout: 30000 })
  await page.getByTestId('detail-panel').waitFor({ timeout: 10000 })
  const text = await page.getByTestId('detail-panel').innerText()
  assert(text.includes(fixture.name), `deep link opened wrong detail: ${text.slice(0, 300)}`)
  assert(new URL(page.url()).searchParams.get('poi') === fixture.uid, 'app erased valid poi deep link while opening it')
  await page.getByLabel('Close details').click()
})

await test(page, 'stale listing deep link explains itself and then returns to normal map state', async () => {
  await page.goto(`${URL}?poi=human-audit-does-not-exist`, { waitUntil: 'load' })
  await page.locator('canvas').first().waitFor({ timeout: 30000 })
  const notice = page.getByText('This shared listing is no longer in the current map.')
  await notice.waitFor({ timeout: 10000 })
  assert(new URL(page.url()).searchParams.get('poi') === 'human-audit-does-not-exist', 'dead link was erased before explanation')
  await page.getByRole('button', { name: 'Show map' }).click()
  await sleep(500)
  assert((await notice.count()) === 0, 'stale-link notice did not dismiss')
  assert(new URL(page.url()).searchParams.get('poi') === null, 'dead poi query remained after choosing Show map')
})

await test(page, 'theme preference survives a normal reload', async () => {
  const theme = page.getByRole('button', { name: 'Switch to light mode' })
  await theme.click()
  await page.getByRole('button', { name: 'Switch to red night mode' }).waitFor({ timeout: 4000 })
  await page.reload({ waitUntil: 'load' })
  await page.locator('canvas').first().waitFor({ timeout: 30000 })
  assert((await page.getByRole('button', { name: 'Switch to red night mode' }).count()) === 1, 'light mode did not survive reload')
  await page.getByRole('button', { name: 'Switch to red night mode' }).click()
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
})

await test(page, 'large-text preference survives closing Layers and reloading', async () => {
  await layersButton().click()
  const bigger = page.getByLabel('Bigger text and labels')
  if (!(await bigger.isChecked())) await bigger.check()
  await page.getByRole('button', { name: /Close filters/i }).click()
  await page.reload({ waitUntil: 'load' })
  await page.locator('canvas').first().waitFor({ timeout: 30000 })
  await layersButton().click()
  assert(await page.getByLabel('Bigger text and labels').isChecked(), 'large-text preference reset on reload')
  await page.getByLabel('Bigger text and labels').uncheck()
  await page.getByRole('button', { name: /Close filters/i }).click()
})

await test(page, 'saved event survives reload and can be opened again from Saved', async () => {
  await eventsButton().click()
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
  await page.reload({ waitUntil: 'load' })
  await page.locator('canvas').first().waitFor({ timeout: 30000 })
  await eventsButton().click()
  await page.getByRole('button', { name: 'Saved', exact: true }).click()
  const savedRow = page.locator('.MuiDrawer-paper .MuiListItemButton-root').filter({ hasText: title }).first()
  await savedRow.waitFor({ timeout: 10000 })
  await savedRow.click()
  assert((await page.getByRole('dialog').innerText()).includes(title), 'saved event could not be reopened after reload')
  await page.getByRole('button', { name: 'Close event details' }).click()
  await page.getByRole('button', { name: /Close events/i }).click()
})

await browser.close()
console.log('--- HUMAN E2E FAILURES ---')
for (const failure of failures) console.log(`- ${failure}`)
if (failures.length) process.exit(1)
