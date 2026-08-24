#!/usr/bin/env node
/**
 * Fetch a completed year's public listings from Burning Man's official archive.
 * These files are a no-key dataset published by Burning Man Innovate, so the
 * app does not need to copy API payloads from a third-party repository.
 *
 *   node scripts/fetch-archive.mjs 2025
 */
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { commitAtomically, discardStaged, stageTempDir } from './lib/atomic-write.mjs'
import { summarize, validateDataset } from './lib/api.mjs'
import { deriveEventRange } from './lib/event-range.mjs'

const YEAR = process.argv[2] ?? '2025'
const FIRST_ARCHIVE_YEAR = 2015
const LAST_ARCHIVE_YEAR = 2025
const numericYear = Number(YEAR)
const OUT = resolve(import.meta.dirname, '..', 'public', 'data', YEAR)
const FILES = { art: 'art.json', camp: 'camps.json', event: 'events.json' }
let events = []

if (!Number.isInteger(numericYear) || numericYear < FIRST_ARCHIVE_YEAR || numericYear > LAST_ARCHIVE_YEAR) {
  throw new Error(
    `Official JSON archives are available for ${FIRST_ARCHIVE_YEAR}–${LAST_ARCHIVE_YEAR}; ` +
      `use fetch-api with the key issued for this app for current-year data.`,
  )
}

// Fetched and validated into a staging directory, a sibling of OUT, and never
// touches OUT until every kind has succeeded. OUT can also hold geometry
// files fetch-data.mjs owns for this year, so the eventual commit only
// overwrites the listing files this script writes.
const stage = await stageTempDir(OUT)

try {
  for (const [kind, filename] of Object.entries(FILES)) {
    const url = `https://bm-innovate.s3.amazonaws.com/archive/${YEAR}/${filename}`
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`)
    const records = await response.json()
    const result = validateDataset(kind, records)
    if (result.problems.length) throw new Error(result.problems.join('\n'))
    await writeFile(resolve(stage, `${kind}.json`), JSON.stringify(records))
    if (kind === 'event') events = records
    console.log(`  ✓ ${summarize(kind, result)}`)
  }

  const range = deriveEventRange(events)
  if (range) {
    await writeFile(resolve(stage, 'dates_info.json'), JSON.stringify({ rangeInfo: range.rangeInfo }))
    for (const outlier of range.outliers) {
      console.warn(`  · outside the event range, excluded from preview: ${outlier.title ?? outlier.uid} (${outlier.start})`)
    }
  }

  await writeFile(
    resolve(stage, 'LISTINGS-ATTRIBUTION.md'),
    [
      `# ${YEAR} listings`,
      '',
      'Fetched from the official Burning Man Innovate JSON archive.',
      '',
      `https://bm-innovate.s3.amazonaws.com/archive/${YEAR}/`,
      'https://innovate.burningman.org/dataset/',
      '',
    ].join('\n'),
  )

  await commitAtomically(stage, OUT)
} catch (error) {
  await discardStaged(stage)
  throw error
}

console.log(`\nWrote official archived listings to public/data/${YEAR}.`)
