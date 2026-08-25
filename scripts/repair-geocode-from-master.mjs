import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

let source = execFileSync('git', ['show', 'origin/master:src/brc/geocode.ts'], { encoding: 'utf8' })
const pattern = /const open = new RegExp\(String\.raw`\^\(\$\{CLOCK\}\)\\s\*\[,\&@\]\?\\s\*\(\\d\{1,5\}\)\(\?!\[\\d:\.\]\)\\s\*\(\?:'\|ft\|feet\)\?`, 'i'\)\.exec\(raw\)/
const match = source.match(pattern)
if (!match) throw new Error('master open-playa parser pattern not found')
const anchored = match[0].replace("?`, 'i').exec(raw)", "?\\s*$`, 'i').exec(raw)")
source = source.replace(pattern, () => anchored)
writeFileSync('src/brc/geocode.ts', source)
