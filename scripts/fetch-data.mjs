#!/usr/bin/env node
/**
 * Vendor one year of city geometry from iBurn-Data (MPL-2.0) into public/,
 * plus the Latin glyph ranges the map needs to render labels offline.
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
const OFFICIAL_GIS = 'https://raw.githubusercontent.com/burningmantech/innovate-GIS-data/master'
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
      ...GLYPH_RANGES.map((r) => `data/${YEAR}/Map/Map.bundle/glyphs/Open Sans Regular/${r}.pbf`),
    ],
    repo,
  )
  git(['checkout', 'HEAD'], repo)

  const src = join(repo, 'data', YEAR)
  if (!existsSync(src)) throw new Error(`iBurn-Data has no data for ${YEAR}`)

  await mkdir(OUT, { recursive: true })
  await mkdir(FONTS, { recursive: true })

  // Geometry fetches must never leave an older third-party listing payload in
  // place where a later build could mistake it for an official fetch.
  for (const stale of ['art.json', 'camp.json', 'event.json', 'points.json', 'dates_info.json', 'LISTINGS-ATTRIBUTION.md']) {
    await rm(join(OUT, stale), { force: true })
  }

  await cp(join(src, 'layouts', 'layout.json'), join(OUT, 'layout.json'))

  // Named city services (medical, rangers, airport, DPW) are clock addresses in
  // the layout spec, so they geocode like anything else.
  const poi = join(src, 'layouts', 'poi.json')
  if (existsSync(poi)) await cp(poi, join(OUT, 'services.json'))

  // Use Burning Man's own public, no-key datasets for the publishable geometry.
  const officialGeometry = {
    'toilets.geojson': `${OFFICIAL_GIS}/${YEAR}/GeoJSON/toilets.geojson`,
    'camp_outlines.geojson': `https://bm-innovate.s3.amazonaws.com/${YEAR}/camp_outlines_${YEAR}.geojson`,
  }
  for (const [name, url] of Object.entries(officialGeometry)) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`)
    await writeFile(join(OUT, name), await response.text())
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
      'The compact runtime layout adapter and offline glyphs come from [iBurn-Data]',
      '(https://github.com/iburnapp/iBurn-Data), licensed MPL-2.0 and derived from',
      'the published city plan. Toilets and camp outlines are fetched from the',
      'official Burning Man Innovate no-key datasets.',
      '',
      'https://innovate.burningman.org/dataset/',
      '',
      'Listings are intentionally not copied from this repository. Run',
      '`npm run fetch-api -- YEAR` with the key issued for this app so Event Data',
      'is obtained from the official API under its terms of service.',
      '',
    ].join('\n'),
  )

  const files = await readdir(OUT)
  console.log(`Wrote public/data/${YEAR}: ${files.join(', ')}`)
  console.log(`Wrote glyphs to public/fonts/Open Sans Regular`)
  console.log(`Fetch official listings next: fetch-archive for completed years, fetch-api for the current year.`)
} finally {
  await rm(work, { recursive: true, force: true })
}
