#!/usr/bin/env node
/**
 * Vendor one year of city geometry from Burning Man's own published survey,
 * plus the Latin glyph ranges the map needs to render labels offline.
 *
 *   node scripts/fetch-data.mjs [year]
 *
 * Everything about the city comes from github.com/burningmantech/innovate-GIS-data,
 * which Burning Man republishes each year after the city is surveyed. The polar
 * layout spec the app generates the city from is derived from that survey by
 * `scripts/derive-layout.mjs`, and checked against the survey's own control
 * points, so a new year is a data drop rather than a code change.
 *
 * Camp and art listings come from the Burning Man API, which requires a key:
 * https://api.burningman.org/api-key-request/
 */
import { readdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { commitAtomically, discardStaged, stageTempDir } from './lib/atomic-write.mjs'

const YEAR = process.argv[2] ?? '2026'
const ROOT = resolve(import.meta.dirname, '..')
const OUT = join(ROOT, 'public', 'data', YEAR)
const FONTS = join(ROOT, 'public', 'fonts', 'Open Sans Regular')
const GIS = `https://raw.githubusercontent.com/burningmantech/innovate-GIS-data/master/${YEAR}/GeoJSON`

// Open Sans, prebuilt into the SDF ranges MapLibre wants, from the font project
// that maintains them. This is a typeface, not map data — Burning Man does not
// publish glyphs, and the map cannot draw a label offline without them.
const GLYPHS = 'https://raw.githubusercontent.com/openmaptiles/fonts/gh-pages/Open%20Sans%20Regular'

// Latin-1 plus punctuation and symbols. The full Open Sans set is ~1,600 files;
// these five cover every camp and art name in the listings.
const GLYPH_RANGES = ['0-255', '256-511', '512-767', '8192-8447', '8448-8703']

/**
 * Survey layers the app ships. The city itself is generated from `layout.json`,
 * so these are the things that cannot be derived: where the toilets are, and
 * which named places the survey marks.
 */
const LAYERS = {
  'toilets.geojson': { path: 'toilets.geojson', required: true },
  'cpns.geojson': { path: 'cpns.geojson', required: true },
  'city_blocks.geojson': { path: 'city_blocks.geojson', required: false },
}

async function get(url, required, label) {
  const response = await fetch(url)
  if (!response.ok) {
    if (required) throw new Error(`${label}: ${response.status} ${response.statusText}`)
    console.log(`  - ${label} is not published for ${YEAR}; skipping`)
    return null
  }
  return response
}

console.log(`Fetching Burning Man's published ${YEAR} survey...`)

// Everything below is staged into temp directories, siblings of the real
// ones, and never touches public/data or public/fonts until every fetch and
// derivation has succeeded. A geometry fetch must never leave an older
// listing payload in place where a later build could mistake it for a fresh
// official fetch — but that invalidation happens in the final swap below,
// as part of the same all-or-nothing commit, not as an eager pre-step that
// could outlive a failed fetch.
const outStage = await stageTempDir(OUT)
const fontsStage = await stageTempDir(FONTS)

try {
  for (const [name, { path, required }] of Object.entries(LAYERS)) {
    const response = await get(`${GIS}/${path}`, required, name)
    if (!response) continue
    await writeFile(join(outStage, name), await response.text())
    console.log(`  ${name}`)
  }

  // The layout is derived from the same survey, and refuses to write itself
  // if the fitted city centre disagrees with the surveyed Man. It writes
  // straight into the staged directory, not the live one.
  execFileSync(
    process.execPath,
    [join(import.meta.dirname, 'derive-layout.mjs'), YEAR, join(outStage, 'layout.json')],
    { stdio: 'inherit' },
  )

  console.log('Fetching offline glyphs...')
  for (const range of GLYPH_RANGES) {
    const response = await get(`${GLYPHS}/${range}.pbf`, true, `glyph range ${range}`)
    await writeFile(join(fontsStage, `${range}.pbf`), Buffer.from(await response.arrayBuffer()))
  }

  await writeFile(
    join(outStage, 'ATTRIBUTION.md'),
    [
      `# ${YEAR} city geometry`,
      '',
      "Every part of the city comes from Burning Man's own published survey:",
      'https://github.com/burningmantech/innovate-GIS-data',
      '',
      '`layout.json` is not copied from anywhere. It is derived from that survey by',
      '`scripts/derive-layout.mjs`, which fits the annular street centrelines to',
      'recover the polar spec the app generates the city from, and refuses to write',
      'a layout unless that fitted centre agrees with the surveyed "The Man" control',
      'point. See https://innovate.burningman.org/dataset/ for the dataset terms.',
      '',
      'Offline map glyphs are Open Sans (Apache-2.0), prebuilt into SDF ranges by',
      'https://github.com/openmaptiles/fonts. They are a typeface, not map data.',
      '',
      'Listings are intentionally not vendored here. Run `npm run fetch-api -- YEAR`',
      'with the key issued for this app so Event Data is obtained from the official',
      'API under its terms of service.',
      '',
    ].join('\n'),
  )

  // Nothing below this line can fail, so this is the one moment the live
  // directories are touched — and only with fully-fetched, fully-derived
  // data. `replaceAll` is what invalidates any listings a previous
  // fetch-api/fetch-archive run left in OUT: a new geometry year makes them
  // stale, and that has to happen atomically with everything else here.
  await commitAtomically(outStage, OUT, { replaceAll: true })
  await commitAtomically(fontsStage, FONTS, { replaceAll: true })
} catch (error) {
  await discardStaged(outStage)
  await discardStaged(fontsStage)
  throw error
}

const files = await readdir(OUT)
console.log(`\nWrote public/data/${YEAR}: ${files.join(', ')}`)
console.log(`Wrote ${GLYPH_RANGES.length} glyph ranges to public/fonts/Open Sans Regular`)
console.log('Fetch listings next: `npm run fetch-api -- YEAR` with BURNING_MAN_API_KEY set.')
