#!/usr/bin/env node
/**
 * Pull a year's listings straight from the Burning Man public API.
 *
 *   export BURNING_MAN_API_KEY=...  # https://api.burningman.org/api-key-request/
 *   node scripts/fetch-api.mjs 2026
 *
 * The city layout still comes from `npm run fetch-data`, which vendors it from
 * iBurn-Data. This only replaces the listings, which is the part that changes
 * every year and is published late.
 *
 * Records without coordinates are left alone rather than geocoded here: the app
 * geocodes `location_string` at load time using the same code that powers
 * search, so doing it twice would just be two places to get it wrong.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { commitAtomically, discardStaged, stageTempDir } from './lib/atomic-write.mjs'
import {
  embargoNote,
  ENDPOINTS,
  redactEmbargoedLocations,
  releaseForYear,
  summarize,
  validateDataset,
} from './lib/api.mjs'
import { deriveEventRange } from './lib/event-range.mjs'

const YEAR = process.argv[2] ?? String(new Date().getFullYear())
// BMORG_API_KEY is accepted too, for checkouts set up before the rename.
const KEY = process.env.BURNING_MAN_API_KEY ?? process.env.BMORG_API_KEY
const BASE = process.env.BURNING_MAN_API_BASE ?? process.env.BMORG_API_BASE ?? 'https://api.burningman.org/api'
const OUT = resolve(import.meta.dirname, '..', 'public', 'data', YEAR)
const RELEASE = releaseForYear(YEAR)

if (!KEY) {
  console.error(
    'BURNING_MAN_API_KEY is not set.\n' +
      'Request a key at https://api.burningman.org/api-key-request/, then put\n' +
      'it in .env, which is git-ignored, or export it:\n' +
      '  export BURNING_MAN_API_KEY=your-key-here',
  )
  process.exit(2)
}

async function fetchKind(kind) {
  const response = await fetch(`${BASE}/${kind}?year=${YEAR}`, {
    headers: { 'X-API-Key': KEY, Accept: 'application/json' },
  })
  if (response.status === 401) {
    throw new Error('The API rejected the key (401). Check BURNING_MAN_API_KEY.')
  }
  if (response.status === 403) {
    throw new Error('The API refused the request (403). The key may lack access to this year.')
  }
  if (!response.ok) {
    throw new Error(`${kind}: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

// Everything below is fetched and validated into a staging directory, a
// sibling of OUT, and never touches OUT until the whole refresh is known
// good. OUT also holds geometry files fetch-data.mjs owns, so the eventual
// commit only overwrites the listing files this script writes, leaving that
// geometry untouched.
const stage = await stageTempDir(OUT)

try {
  let refused = false
  for (const kind of ENDPOINTS) {
    const records = await fetchKind(kind)
    const result = validateDataset(kind, records)

    for (const problem of result.problems) {
      console.error(`  ! ${problem}`)
      refused = true
    }
    const now = new Date()
    const note = embargoNote(kind, result, now, RELEASE)
    if (note) console.warn(`  · ${note}`)

    if (result.problems.length === 0) {
      const publishable = redactEmbargoedLocations(kind, records, now, RELEASE)
      await writeFile(`${stage}/${kind}.json`, JSON.stringify(publishable))
      // Summarise what was written, not what arrived. Reporting the API's own
      // location count next to an embargoed dataset reads as though embargoed
      // positions had just been published.
      console.log(`  ✓ ${summarize(kind, validateDataset(kind, publishable))}`)
    }
  }

  if (refused) {
    throw new Error(
      'Some datasets did not match what the app reads. Refusing to publish any part\n' +
        'of this refresh — the previous public/data is still in place, unchanged.',
    )
  }

  // The event window used to come from a third-party file. The occurrences
  // the API already returns describe it exactly, and they are the same
  // records the schedule is built from, so the two can never disagree.
  //
  // The absolute min/max timestamp used to be trusted directly, but a single
  // otherwise-valid record months before or after the burn — a rehearsal, a
  // data-entry mistake — is structurally fine and passes validateDataset(),
  // so it would silently expand the whole preview window to include a month
  // nobody would call "the event". deriveEventRange() applies the same
  // dominant-month-plus-bounded-window protection fetch-archive.mjs already
  // used for archived years (#67).
  try {
    const events = JSON.parse(await readFile(`${stage}/event.json`, 'utf8'))
    const range = deriveEventRange(events)
    if (range) {
      await writeFile(`${stage}/dates_info.json`, JSON.stringify({ rangeInfo: range.rangeInfo }))
      console.log(`  ✓ event window ${range.rangeInfo.startDate.slice(0, 10)} to ${range.rangeInfo.endDate.slice(0, 10)}`)
      for (const outlier of range.outliers) {
        console.warn(`  · outside the event range, excluded from preview: ${outlier.title ?? outlier.uid} (${outlier.start})`)
      }
    }
  } catch {
    console.warn('  · could not derive the event window from the occurrences')
  }

  await writeFile(
    `${stage}/LISTINGS-ATTRIBUTION.md`,
    [
      `# ${YEAR} listings`,
      '',
      'Fetched from the Burning Man Project public API and subject to its terms of',
      'service, including the embargo on location data that `src/data/embargo.ts`',
      'enforces at load time.',
      '',
      'https://innovate.burningman.org/terms-of-service-for-burning-man-apis-and-datasets/',
      '',
    ].join('\n'),
  )

  await commitAtomically(stage, OUT)
} catch (error) {
  await discardStaged(stage)
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
console.log(`\nWrote public/data/${YEAR}. Set VITE_DATA_YEAR=${YEAR} to use it.`)
