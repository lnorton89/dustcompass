import { chromium } from 'playwright'
import { resolve } from 'node:path'

const COLS = 72
const ROWS = 72
const browser = await chromium.launch({ args: ['--no-sandbox', '--no-proxy-server'] })
const page = await browser.newPage()
for (const theme of ['dark', 'light', 'night']) {
  await page.goto(`file://${resolve('public/playa', `${theme}.png`).replace(/\\/g, '/')}`)
  const art = await page.evaluate(async (cols, rows) => {
    const img = document.querySelector('img')
    const c = document.createElement('canvas')
    c.width = cols
    c.height = rows
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0, cols, rows)
    const d = ctx.getImageData(0, 0, cols, rows).data
    const chars = ' .:-=+*#%@'
    let out = []
    for (let y = 0; y < rows; y += 1) {
      let line = ''
      for (let x = 0; x < cols; x += 1) {
        const i = (y * cols + x) * 4
        const lum = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255
        line += chars[Math.min(chars.length - 1, Math.floor(lum * chars.length))]
      }
      out.push(line)
    }
    return out.join('\n')
  }, COLS, ROWS)
  console.log(`\n=== ${theme} ===`)
  console.log(art)
}
await browser.close()
