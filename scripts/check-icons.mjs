import { chromium } from 'playwright'
import { resolve } from 'node:path'

const browser = await chromium.launch({ args: ['--no-sandbox', '--no-proxy-server'] })
const page = await browser.newPage()
for (const f of ['favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png']) {
  await page.goto(`file://${resolve('public', f).replace(/\\/g, '/')}`)
  const px = await page.evaluate(() => {
    const img = document.querySelector('img')
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    const at = (x, y) => Array.from(d.slice((y * c.width + x) * 4, (y * c.width + x) * 4 + 4))
    return { corner: at(0, 0), corner5: at(5, 5), mid: at(Math.floor(c.width / 2), Math.floor(c.height / 2)) }
  })
  console.log(f, JSON.stringify(px))
}
await browser.close()
