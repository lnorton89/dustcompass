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
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  embargoNote,
  ENDPOINTS,
  redactEmbargoedLocations,
  releaseForYear,
  summarize,
  validateDataset,
} from './lib/api.mjs'

const YEAR = process.argv[2] ?? String(new Date().getFullYear())
// BMORG_API_KEY is accepted too, for checkouts set up before the rename.
const KEY = process.env.BURNING_MAN_API_KEY ?? process.env.BMORG_API_KEY
const BASE = process.env.BMORG_API_BASE ?? 'https://api.burningman.org/api'
const OUT = resolve(import.meta.dirname, '..', 'public', 'data', YEAR)
const RELEASE = releaseForYear(YEAR)

if (!KEY) {
  console.error(
    'BMORG_API_KEY is not set.\n' +
      'Request a key at https://api.burningman.org/api-key-request/, then:\n' +
      '  export BMORG_API_KEY=your-key-here',
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

await mkdir(OUT, { recursive: true })

let refused = false
for (const kind of ENDPOINTS) {
  let records
  try {
    records = await fetchKind(kind)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
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
    await writeFile(`${OUT}/${kind}.json`, JSON.stringify(publishable))
    // Summarise what was written, not what arrived. Reporting the API's own
    // location count next to an embargoed dataset reads as though embargoed
    // positions had just been published.
    console.log(`  ✓ ${summarize(kind, validateDataset(kind, publishable))}`)
  }
}

// The event window used to come from a third-party file. The occurrences the
// API already returns describe it exactly, and they are the same records the
// schedule is built from, so the two can never disagree.
try {
  const events = JSON.parse(await readFile(`${OUT}/event.json`, 'utf8'))
  const times = events
    .flatMap((event) => event.occurrence_set ?? [])
    .flatMap((slot) => [slot.start_time, slot.end_time])
    .filter(Boolean)
    .sort()
  if (times.length > 0) {
    const rangeInfo = { startDate: times[0], endDate: times[times.length - 1] }
    await writeFile(`${OUT}/dates_info.json`, JSON.stringify({ rangeInfo }))
    console.log(`  ✓ event window ${rangeInfo.startDate.slice(0, 10)} to ${rangeInfo.endDate.slice(0, 10)}`)
  }
} catch {
  console.warn('  · could not derive the event window from the occurrences')
}

await writeFile(
  `${OUT}/LISTINGS-ATTRIBUTION.md`,
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

if (refused) {
  console.error(
    `\nSome datasets were not written because their shape did not match what the app reads.\n` +
      `Nothing was overwritten for those, so the previous data is still in place.`,
  )
  process.exit(1)
}
console.log(`\nWrote public/data/${YEAR}. Set VITE_DATA_YEAR=${YEAR} to use it.`)
