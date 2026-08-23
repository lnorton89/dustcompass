#!/usr/bin/env node
/**
 * Vendor one year of Black Rock City data from iBurn-Data (MPL-2.0) into
 * public/, plus the Latin glyph ranges the map needs to render labels offline.
 *
 *   node scripts/fetch-data.mjs [year]
 *
 * For 2026, drop in the layout.json Burning Man publishes and point the app at
 * it — the city geometry is generated from that spec at runtime, so no tile
 * build is involved. Camp and art listings come from the Burning Man API,
 * which requires a key: https://api.burningman.org/api-key-request/
 */
import { execFileSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const YEAR = process.argv[2] ?? '2025'
const REPO = 'https://github.com/iburnapp/iBurn-Data.git'
const ROOT = resolve(import.meta.dirname, '..')
const OUT = join(ROOT, 'public', 'data', YEAR)
const FONTS = join(ROOT, 'public', 'fonts', 'Open Sans Regular')

// Latin-1 plus punctuation and symbols. The full Open Sans set is ~1,600 files;
// these five cover every camp and art name in the listings.
const GLYPH_RANGES = ['0-255', '256-511', '512-767', '8192-8447', '8448-8703']

const git = (args, cwd) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] })

const work = await mkdtemp(join(tmpdir(), 'iburn-'))
const repo = join(work, 'iBurn-Data')

try {
  console.log(`Fetching iBurn-Data ${YEAR}…`)
  git(['clone', '--depth', '1', '--filter=blob:none', '--no-checkout', REPO, repo])
  git(['sparse-checkout', 'init', '--no-cone'], repo)
  git(
    [
      'sparse-checkout',
      'set',
      `data/${YEAR}/layouts/*`,
      `data/${YEAR}/geo/*`,
      `data/${YEAR}/APIData/APIData.bundle/*.json`,
      ...GLYPH_RANGES.map((r) => `data/${YEAR}/Map/Map.bundle/glyphs/Open Sans Regular/${r}.pbf`),
    ],
    repo,
  )
  git(['checkout', 'HEAD'], repo)

  const src = join(repo, 'data', YEAR)
  if (!existsSync(src)) throw new Error(`iBurn-Data has no data for ${YEAR}`)

  await mkdir(OUT, { recursive: true })
  await mkdir(FONTS, { recursive: true })

  await cp(join(src, 'layouts', 'layout.json'), join(OUT, 'layout.json'))
  for (const name of ['art', 'camp', 'event', 'points']) {
    const from = join(src, 'APIData', 'APIData.bundle', `${name}.json`)
    if (existsSync(from)) await cp(from, join(OUT, `${name}.json`))
  }

  const glyphSrc = join(src, 'Map', 'Map.bundle', 'glyphs', 'Open Sans Regular')
  if (existsSync(glyphSrc)) {
    for (const file of await readdir(glyphSrc)) {
      await cp(join(glyphSrc, file), join(FONTS, file))
    }
  }

  await writeFile(
    join(OUT, 'ATTRIBUTION.md'),
    [
      `# ${YEAR} data`,
      '',
      'City layout, geometry and listings vendored from [iBurn-Data]',
      '(https://github.com/iburnapp/iBurn-Data), licensed MPL-2.0.',
      '',
      'Camp, art and event listings originate from the Burning Man Project public',
      'API and remain subject to its terms of service, including the embargo on',
      'location data enforced in `src/data/embargo.ts`.',
      '',
    ].join('\n'),
  )

  const files = await readdir(OUT)
  console.log(`Wrote public/data/${YEAR}: ${files.join(', ')}`)
  console.log(`Wrote glyphs to public/fonts/Open Sans Regular`)
} finally {
  await rm(work, { recursive: true, force: true })
}
