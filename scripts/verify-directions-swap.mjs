import { chromium } from 'playwright'

const url = process.env.VERIFY_URL ?? 'http://127.0.0.1:4173/dustcompass/'
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  geolocation: { latitude: 40.7772, longitude: -119.1893 },
  permissions: ['geolocation'],
})
await context.addInitScript(() => {
  localStorage.setItem('dust-compass:first-run:1', 'seen')
  localStorage.setItem('dust-compass:embargo-notice:2026', 'seen')
  localStorage.setItem('dust-compass:disclaimer-surface:1', 'dismissed')
})
const page = await context.newPage()
await page.goto(url, { waitUntil: 'load' })
await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 30000 })
const fixture = await page.evaluate(async () => {
  const root = location.pathname.replace(/\/$/, '')
  const camps = await (await fetch(`${root}/data/2026/camp.json`)).json()
  const camp = camps.find((candidate) => typeof candidate?.name === 'string' && candidate.name.length >= 10 && candidate.name.length <= 28 && typeof candidate?.location_string === 'string' && candidate.location_string.includes('&') && /^[A-Za-z0-9 '&().,-]+$/.test(candidate.name))
  return camp && { uid: camp.uid, name: camp.name, address: camp.location_string }
})
if (!fixture) throw new Error('No fixture')
console.log(`fixture=${fixture.name}`)
await page.getByRole('button', { name: 'Directions', exact: true }).first().click()
const from = page.getByRole('combobox', { name: 'From' })
const to = page.getByRole('combobox', { name: 'To' })
await to.fill(fixture.name)
await page.getByRole('option').filter({ hasText: fixture.name }).first().click()
await page.getByTestId('directions-summary').waitFor({ timeout: 10000 })
console.log(`before from=${JSON.stringify(await from.inputValue())} to=${JSON.stringify(await to.inputValue())}`)
await page.getByLabel('Swap directions endpoints').click()
for (const delay of [0, 20, 50, 100, 250, 500, 1000]) {
  if (delay) await page.waitForTimeout(delay)
  console.log(`after+${delay} from=${JSON.stringify(await from.inputValue())} to=${JSON.stringify(await to.inputValue())}`)
}
await page.waitForFunction((name) => {
  const input = document.querySelector('input[aria-label="From"]') ?? [...document.querySelectorAll('input')].find((el) => el.closest('.MuiAutocomplete-root')?.querySelector('label')?.textContent?.startsWith('From'))
  return input instanceof HTMLInputElement && input.value.includes(name)
}, fixture.name, { timeout: 3000 }).catch(() => null)
const finalFrom = await from.inputValue()
console.log(`final from=${JSON.stringify(finalFrom)}`)
if (!finalFrom.includes(fixture.name)) throw new Error(`Destination never moved into From; got ${finalFrom}`)
await browser.close()
