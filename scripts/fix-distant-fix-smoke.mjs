import fs from 'node:fs'

const path = 'scripts/smoke.mjs'
let text = fs.readFileSync(path, 'utf8')
const before = `  const far = await reachFrom('distant fix', { latitude: 37.7749, longitude: -122.4194 })
  assert(near.reach < 0.35, \`a fix in the city routes from the fix (\${near.reach.toFixed(3)}°)\`)
  assert(/toward \\d/.test(near.readout), 'a fix in the city gives a bearing to walk')
  assert(
    far.reach < 0.35,
    \`a distant fix does not drag the route off the map (\${far.reach.toFixed(3)}° from the Man)\`,
  )
  assert(
    /from the Man/.test(far.readout),
    'a distant fix says the distance is measured from the Man',
  )`
const after = `  const far = await reachFrom('distant fix', { latitude: 37.7749, longitude: -122.4194 })
  assert(near.reach != null && near.reach < 0.35, \`a fix in the city routes from the fix (\${near.reach?.toFixed(3) ?? 'no route'}°)\`)
  assert(/toward \\d/.test(near.readout), 'a fix in the city gives a bearing to walk')
  // A live-origin route is deliberately withheld until there is a usable
  // on-playa fix. The navigation readout may fall back to the Man for context,
  // but drawing that fallback as if it were the user's path would be misleading.
  assert(
    far.points === 0 && far.reach == null,
    \`a distant fix does not draw a fake route from the Man (\${far.points} points)\`,
  )
  assert(
    /from the Man/.test(far.readout),
    'a distant fix says the distance is measured from the Man',
  )`
if (!text.includes(before)) throw new Error('target smoke block not found')
text = text.replace(before, after)
fs.writeFileSync(path, text)
