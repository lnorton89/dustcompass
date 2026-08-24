/**
 * The schedule-preview window (`dates_info.json`'s `rangeInfo`) that
 * `scheduleClock()` uses to decide whether "now" falls inside the event, so
 * a scheduled deploy between events can scrub to the burn's own week instead
 * of showing an empty `Now`/`Next 3h` window against the real calendar date.
 *
 * A few occurrence records — rehearsals, data-entry mistakes — carry a
 * perfectly valid timestamp months away from the actual event, and
 * `validateDataset()` cannot catch that: the record is structurally fine, it
 * is just describing the wrong week. Trusting the absolute min/max timestamp
 * (as `fetch-api.mjs` used to) lets one such record expand the whole range to
 * include a month nobody would call "the event" — the same failure the
 * archive importer already guards against by anchoring to the month
 * containing the most occurrences, then bounding the window to fourteen days
 * past its start.
 */

const WINDOW_MS = 14 * 24 * 60 * 60 * 1000

/**
 * @param {Array<{uid?: string, event_id?: number, title?: string, occurrence_set?: Array<{start_time?: string, end_time?: string}>}>} events
 * @returns {{ rangeInfo: { startDate: string, endDate: string }, outliers: Array<{uid: string|number|undefined, title: string|undefined, start: string, end: string}> } | undefined}
 */
export function deriveEventRange(events) {
  const occurrences = events
    .flatMap((event) => (event.occurrence_set ?? []).map((occurrence) => ({ event, occurrence })))
    .map(({ event, occurrence }) => ({
      event,
      start: Date.parse(occurrence.start_time ?? ''),
      end: Date.parse(occurrence.end_time ?? ''),
    }))
    .filter(({ start, end }) => Number.isFinite(start) && Number.isFinite(end))

  if (occurrences.length === 0) return undefined

  const months = new Map()
  for (const { start } of occurrences) {
    const key = new Date(start).toISOString().slice(0, 7)
    months.set(key, (months.get(key) ?? 0) + 1)
  }
  const [eventMonth] = [...months].sort((a, b) => b[1] - a[1])[0]

  const inMonth = occurrences.filter(({ start }) => new Date(start).toISOString().startsWith(eventMonth))
  const start = Math.min(...inMonth.map((o) => o.start))
  const windowEnd = start + WINDOW_MS
  const inWindow = occurrences.filter(({ end }) => end >= start && end <= windowEnd)
  const end = Math.max(...inWindow.map((o) => o.end))

  // Not deleted from the schedule this describes — only excluded from the
  // metadata range used for preview mode. See the module comment.
  const outliers = occurrences
    .filter((o) => o.start < start || o.end > windowEnd)
    .map((o) => ({
      uid: o.event.uid ?? o.event.event_id,
      title: o.event.title,
      start: new Date(o.start).toISOString(),
      end: new Date(o.end).toISOString(),
    }))

  return {
    rangeInfo: { startDate: new Date(start).toISOString(), endDate: new Date(end).toISOString() },
    outliers,
  }
}
