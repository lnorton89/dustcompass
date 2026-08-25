import fs from 'node:fs'

const path = 'src/App.tsx'
let source = fs.readFileSync(path, 'utf8')
const before = `      const routeOrigin: DirectionsEndpoint = usableFix || location.status === 'idle' || location.status === 'locating'\n        ? { kind: 'live' }\n        : { kind: 'man' }\n`
const after = `      const routeOrigin = defaultDirectionsOrigin(\n        Boolean(usableFix) || location.status === 'idle' || location.status === 'locating',\n      )\n`
if (!source.includes(before)) throw new Error('navigateTo routeOrigin block changed')
source = source.replace(before, after)
fs.writeFileSync(path, source)
fs.rmSync('scripts/use-directions-origin-helper.mjs')
fs.rmSync('.github/workflows/use-directions-origin-helper.yml')
