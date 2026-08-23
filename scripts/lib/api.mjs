/**
 * Shape checks for Burning Man API responses.
 *
 * These exist because the failure mode otherwise is silent: a renamed field or
 * a changed nesting produces a dataset the app loads happily and renders as an
 * empty map. Better to refuse loudly at fetch time and say exactly which field
 * is missing.
 */

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

  for (const field of REQUIRED[kind] ?? []) {
    const missing = records.filter((r) => r?.[field] === undefined).length
    if (missing) problems.push(`${kind}: ${missing}/${records.length} records have no "${field}"`)
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

export const RELEASE_2026 = {
  camp: new Date('2026-08-23T00:00:00-07:00'),
  art: new Date('2026-08-30T00:01:00-07:00'),
}

export const RELEASES = {
  2025: {
    camp: new Date('2025-08-17T00:00:00-07:00'),
    art: new Date('2025-08-24T00:01:00-07:00'),
  },
  2026: RELEASE_2026,
}
