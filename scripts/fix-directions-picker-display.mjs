import fs from 'node:fs'

const path = 'src/ui/DirectionsPanel.tsx'
let source = fs.readFileSync(path, 'utf8')
const before = `      value={selected}\n      inputValue={query}\n      onInputChange={(_, next) => setQuery(next)}\n`
const after = `      value={selected}\n      onInputChange={(_, next, reason) => setQuery(reason === 'input' ? next : '')}\n`
if (!source.includes(before)) throw new Error('DirectionsPanel autocomplete control block changed')
source = source.replace(before, after)
source = source.replace(
  `      onChange={(_, option) => {\n        onChange(option?.endpoint)\n        setQuery('')\n      }}\n`,
  `      onChange={(_, option) => onChange(option?.endpoint)}\n`,
)
fs.writeFileSync(path, source)
fs.rmSync('scripts/fix-directions-picker-display.mjs')
fs.rmSync('.github/workflows/fix-directions-picker-display.yml')
