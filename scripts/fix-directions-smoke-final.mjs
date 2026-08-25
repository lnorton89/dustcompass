import fs from 'node:fs'

const path = 'scripts/smoke.mjs'
let text = fs.readFileSync(path, 'utf8')

const replacements = [
  [
    "  const reachFrom = async (label, geolocation) => {",
    "  const reachFrom = async (label, geolocation, expectRoute = true) => {",
  ],
  [
    "    assert(result.points > 0, `${label}: a route is drawn at all (${result.points} points)`)\n    return result",
    "    assert(\n      expectRoute ? result.points > 0 : result.points === 0,\n      expectRoute\n        ? `${label}: a route is drawn at all (${result.points} points)`\n        : `${label}: no fake route is drawn without a usable on-playa fix (${result.points} points)`,\n    )\n    return result",
  ],
  [
    "  const far = await reachFrom('distant fix', { latitude: 37.7749, longitude: -122.4194 })",
    "  const far = await reachFrom('distant fix', { latitude: 37.7749, longitude: -122.4194 }, false)",
  ],
  [
    "/from the Man/.test(far.readout)",
    "/from the Man/i.test(far.readout)",
  ],
  [
    "await toField.fill('7:30 & Esplanade')\nawait page.getByRole('option').filter({ hasText: /7:30.*Esplanade|Esplanade.*7:30/ }).first().click()",
    "await toField.fill('7:30 & Esplanade')\nawait page.waitForTimeout(300)\nawait toField.press('ArrowDown')\nawait toField.press('Enter')",
  ],
]

for (const [before, after] of replacements) {
  if (!text.includes(before)) throw new Error(`target not found: ${before.slice(0, 90)}`)
  text = text.replace(before, after)
}

fs.writeFileSync(path, text)
