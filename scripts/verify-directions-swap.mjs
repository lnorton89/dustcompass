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
  return camp && { name: camp.name }
})
if (!fixture) throw new Error('No camp fixture')
await page.getByRole('button', { name: 'Directions', exact: true }).first().click()
const from = page.getByRole('combobox', { name: 'From' })
const to = page.getByRole('combobox', { name: 'To' })
await to.fill(fixture.name)
await page.getByRole('option').filter({ hasText: fixture.name }).first().click()
await page.getByTestId('directions-summary').waitFor({ timeout: 10000 })
const originalFrom = await from.inputValue()
await page.getByLabel('Swap directions endpoints').click()
await page.waitForFunction((name) => {
  const labels = [...document.querySelectorAll('label')]
  const label = labels.find((candidate) => candidate.textContent?.startsWith('From'))
  const id = label?.getAttribute('for')
  const input = id ? document.getElementById(id) : null
  return input instanceof HTMLInputElement && input.value.includes(name)
}, fixture.name, { timeout: 3000 })
if (!(await from.inputValue()).includes(fixture.name)) throw new Error('Destination did not render in From after swap')
if (!(await to.inputValue()).includes(originalFrom)) throw new Error('Original From did not render in To after swap')
await page.getByLabel('Swap directions endpoints').click()
await page.waitForFunction((name) => {
  const labels = [...document.querySelectorAll('label')]
  const label = labels.find((candidate) => candidate.textContent?.startsWith('To'))
  const id = label?.getAttribute('for')
  const input = id ? document.getElementById(id) : null
  return input instanceof HTMLInputElement && input.value.includes(name)
}, fixture.name, { timeout: 3000 })
console.log(`PASS swap round-trip: ${originalFrom} <-> ${fixture.name}`)
await browser.close()
