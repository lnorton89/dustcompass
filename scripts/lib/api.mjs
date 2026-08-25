/**
 * Shape checks for Burning Man API responses.
 *
 * These exist because the failure mode otherwise is silent: a renamed field or
 * a changed nesting produces a dataset the app loads happily and renders as an
 * empty map. Better to refuse loudly at fetch time and say exactly which field
 * is missing.
 */
import { EMBARGO_RELEASES } from '../../src/data/embargoDates.mjs'

export const ENDPOINTS = ['art', 'camp', 'event']

/** Fields the app actually reads, per dataset. */
const REQUIRED = {
  art: ['uid', 'name'],
  camp: ['uid', 'name'],
  event: ['uid', 'title', 'occurrence_set'],
}

/** Fields the app can work without but that signal a shape change if all absent. */
const EXPECTED = {
  art: ['location', 'location_string'],
  camp: ['location', 'location_string'],
  event: ['event_type', 'hosted_by_camp'],
}

/**
 * Required fields the app reads as an array (`Array.prototype.map`/`.flatMap`
 * calls right into them — see `occurrencesInWindow` in `src/data/events.ts`),
 * as opposed to the required string fields, which the app reads as text.
 */
const REQUIRED_ARRAY_FIELDS = new Set(['occurrence_set'])

const isPlainRecord = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0
const isFiniteInRange = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max

/**
 * A single occurrence with an unparseable or non-positive start/end time is
 * a data-entry mistake in one showing of one event, not evidence the whole
 * fetch is untrustworthy — the same shape of problem `deriveEventRange`
 * already excludes individual outlier occurrences for rather than discard
 * the range they were computed from. The app's own occurrence-consuming
 * code (`occurrencesInWindow`, `relevantOccurrence`) already skips a NaN
 * start outright, but not a parseable-yet-backwards pair, so this is real
 * protection, not a redundant check — dropping just the bad occurrence and
 * keeping the event's other showings (and every other event) is what lets
 * this be *fixed* rather than refused outright, so one bad upstream record
 * cannot block every scheduled refresh until whoever filed it notices.
 *
 * Only `event` records carry `occurrence_set`; anything else passes through
 * unchanged.
 */
export function sanitizeEventOccurrences(kind, records) {
  if (kind !== 'event') return { records, dropped: [] }
  const dropped = []
  const sanitized = records.map((record) => {
    if (!Array.isArray(record?.occurrence_set)) return record
    const kept = record.occurrence_set.filter((occurrence) => {
      const start = Date.parse(occurrence?.start_time)
      const end = Date.parse(occurrence?.end_time)
      const ok = Number.isFinite(start) && Number.isFinite(end) && end > start
      if (!ok) {
        dropped.push({
          uid: record.uid,
          title: record.title,
          start: occurrence?.start_time,
          end: occurrence?.end_time,
        })
      }
      return ok
    })
    if (kept.length === record.occurrence_set.length) return record
    return { ...record, occurrence_set: kept }
  })
  return { records: sanitized, dropped }
}

export function validateDataset(kind, records) {
  const problems = []

  if (!Array.isArray(records)) {
    problems.push(`${kind}: expected an array, got ${typeof records}`)
    return { problems, located: 0, total: 0 }
  }
  if (records.length === 0) {
    problems.push(`${kind}: empty — the year may not be published yet`)
    return { problems, located: 0, total: 0 }
  }

  const notRecords = records.filter((r) => !isPlainRecord(r)).length
  if (notRecords) {
    problems.push(`${kind}: ${notRecords}/${records.length} records are not objects`)
  }

  // `=== undefined` alone lets `null`, `{}` and other wrong-shaped values
  // through — they satisfy "present" but not "usable", and every one of them
  // is a real API response that has shipped before. Check the runtime shape
  // the app actually needs: a non-empty string for text fields, an array for
  // `occurrence_set`.
  for (const field of REQUIRED[kind] ?? []) {
    const invalid = records.filter((r) =>
      REQUIRED_ARRAY_FIELDS.has(field) ? !Array.isArray(r?.[field]) : !isNonEmptyString(r?.[field]),
    ).length
    if (invalid) problems.push(`${kind}: ${invalid}/${records.length} records have no "${field}"`)
  }

  // A duplicate uid does not just fail a uniqueness rule — it collides in every
  // Map the client indexes by uid, so one record silently overwrites another
  // in favorites, deep links and feature identity.
  if ((REQUIRED[kind] ?? []).includes('uid')) {
    const counts = new Map()
    for (const r of records) {
      if (!isNonEmptyString(r?.uid)) continue
      counts.set(r.uid, (counts.get(r.uid) ?? 0) + 1)
    }
    for (const [uid, count] of counts) {
      if (count > 1) problems.push(`${kind}: uid "${uid}" appears ${count} times`)
    }
  }

  // Every occurrence the client iterates (`occurrencesInWindow`) needs a
  // start strictly before its end, both parseable as dates — a bad pair here
  // either throws downstream or schedules an event that never shows or never
  // ends.
  if (kind === 'event') {
    let badOccurrences = 0
    for (const r of records) {
      if (!Array.isArray(r?.occurrence_set)) continue
      for (const occurrence of r.occurrence_set) {
        const start = Date.parse(occurrence?.start_time)
        const end = Date.parse(occurrence?.end_time)
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) badOccurrences++
      }
    }
    if (badOccurrences) {
      problems.push(`${kind}: ${badOccurrences} occurrence(s) have an unparseable or non-positive start/end time`)
    }
  }

  // GPS is optional (see the embargo), but when present it has to be a real
  // coordinate — a string, an out-of-range value or a NaN reaches the map
  // layer as-is and either crashes it or drops a pin off the earth.
  if (kind !== 'event') {
    let badGps = 0
    for (const r of records) {
      const location = r?.location
      if (!isPlainRecord(location)) continue
      const { gps_latitude: lat, gps_longitude: lon } = location
      const latOk = lat === undefined || isFiniteInRange(lat, -90, 90)
      const lonOk = lon === undefined || isFiniteInRange(lon, -180, 180)
      if (!latOk || !lonOk) badGps++
    }
    if (badGps) {
      problems.push(`${kind}: ${badGps}/${records.length} records have invalid GPS coordinates`)
    }
  }

  for (const field of EXPECTED[kind] ?? []) {
    if (records.every((r) => r?.[field] === undefined)) {
      problems.push(`${kind}: no record has "${field}" — the response shape may have changed`)
    }
  }

  const located = records.filter(
    (r) => r?.location?.gps_latitude != null || r?.location_string,
  ).length

  return { problems, located, total: records.length }
}

/** Human summary of a fetched dataset, for the console. */
export function summarize(kind, { located, total }) {
  if (kind === 'event') return `${total} events`
  const share = total ? Math.round((located / total) * 100) : 0
  return `${total} ${kind}s, ${located} with a location (${share}%)`
}

/**
 * Location data is embargoed by the API terms of service until camps are
 * released (the Sunday before) and art at Gates. Before those dates the API
 * legitimately returns listings without positions, so an unlocated dataset is
 * only worth warning about once the embargo has lifted.
 */
export function embargoNote(kind, { located, total }, now = new Date(), release = RELEASE_2026) {
  if (kind === 'event' || total === 0) return undefined
  const lifted = kind === 'art' ? now >= release.art : now >= release.camp
  if (located > 0) return undefined
  return lifted
    ? `${kind}: locations have been released but none are present — check your API key's access`
    : `${kind}: locations are still embargoed, so listings arrive without positions`
}

/**
 * Confidential coordinates must never enter the public build or service-worker
 * cache. Client-side hiding remains useful, but it cannot make a downloaded
 * JSON response confidential.
 */
export function redactEmbargoedLocations(kind, records, now, release) {
  if (kind === 'event') return records
  const released = now >= (kind === 'art' ? release.art : release.camp)
  if (released) return records
  return records.map((record) => {
    const safe = { ...record }
    delete safe.location
    delete safe.location_string
    return safe
  })
}

export function releaseForYear(year) {
  const release = RELEASES[year]
  if (!release) throw new Error(`No reviewed location-release schedule is configured for ${year}.`)
  return release
}

function releaseFor(dates) {
  return { camp: new Date(dates.campRelease), art: new Date(dates.gatesOpen) }
}

export const RELEASE_2026 = releaseFor(EMBARGO_RELEASES['2026'])

export const RELEASES = {
  2025: releaseFor(EMBARGO_RELEASES['2025']),
  2026: RELEASE_2026,
}
