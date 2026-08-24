import { describe, expect, it } from 'vitest'
import { deriveEventRange } from '../event-range.mjs'

/**
 * #67: the live API importer used to trust the absolute min/max occurrence
 * timestamp for `dates_info.json`'s preview-mode range. A single otherwise-
 * valid record months before or after the burn — a rehearsal, a data-entry
 * mistake — is structurally fine and passes validateDataset(), so it would
 * silently expand the whole range to include a month nobody would call "the
 * event". `deriveEventRange()` anchors to the month containing the most
 * occurrences and bounds the window to 14 days past its start, the same
 * protection `fetch-archive.mjs` already used for archived years.
 */

const occurrence = (start, end) => ({ start_time: start, end_time: end })

const event = (uid, title, ...occurrences) => ({ uid, title, occurrence_set: occurrences })

describe('deriveEventRange', () => {
  it('returns undefined when there are no valid occurrences', () => {
    expect(deriveEventRange([])).toBeUndefined()
    expect(deriveEventRange([event('e1', 'No occurrences')])).toBeUndefined()
  })

  it('excludes an early rehearsal outlier from the range, without deleting it', () => {
    const events = [
      event('rehearsal', 'June Rehearsal', occurrence('2026-06-01T10:00:00Z', '2026-06-01T12:00:00Z')),
      ...Array.from({ length: 5 }, (_, i) =>
        event(`e${i}`, `Event ${i}`, occurrence(`2026-08-3${i}T10:00:00Z`, `2026-08-3${i}T12:00:00Z`)),
      ),
    ]
    const range = deriveEventRange(events)

    expect(range.rangeInfo.startDate.startsWith('2026-08')).toBe(true)
    expect(range.outliers).toHaveLength(1)
    expect(range.outliers[0]).toMatchObject({ uid: 'rehearsal', title: 'June Rehearsal' })
  })

  it('excludes a late data-entry outlier from the range, without deleting it', () => {
    const events = [
      ...Array.from({ length: 5 }, (_, i) =>
        event(`e${i}`, `Event ${i}`, occurrence(`2026-08-2${i}T10:00:00Z`, `2026-08-2${i}T12:00:00Z`)),
      ),
      event('typo', 'October Typo', occurrence('2026-10-15T10:00:00Z', '2026-10-15T12:00:00Z')),
    ]
    const range = deriveEventRange(events)

    expect(range.rangeInfo.endDate.startsWith('2026-10')).toBe(false)
    expect(range.outliers).toHaveLength(1)
    expect(range.outliers[0]).toMatchObject({ uid: 'typo', title: 'October Typo' })
  })

  it('keeps a real event week that spans August into September', () => {
    // Dominant month is August (4 occurrences) but the burn's own final days
    // legitimately land in September, inside the 14-day window from the
    // month's first occurrence.
    const events = [
      event('mon', 'Monday', occurrence('2026-08-31T10:00:00Z', '2026-08-31T12:00:00Z')),
      event('tue', 'Tuesday', occurrence('2026-09-01T10:00:00Z', '2026-09-01T12:00:00Z')),
      event('wed', 'Wednesday', occurrence('2026-09-02T10:00:00Z', '2026-09-02T12:00:00Z')),
      event('mon2', 'Another Monday event', occurrence('2026-08-31T14:00:00Z', '2026-08-31T16:00:00Z')),
    ]
    const range = deriveEventRange(events)

    expect(range.rangeInfo.startDate).toBe('2026-08-31T10:00:00.000Z')
    expect(range.rangeInfo.endDate).toBe('2026-09-02T12:00:00.000Z')
    expect(range.outliers).toHaveLength(0)
  })

  it('drops occurrences with unparseable timestamps rather than corrupting the range', () => {
    const events = [
      event('bad', 'Bad Timestamp', occurrence('not-a-date', 'also-not-a-date')),
      event('good', 'Good Event', occurrence('2026-08-30T10:00:00Z', '2026-08-30T12:00:00Z')),
    ]
    const range = deriveEventRange(events)

    expect(range.rangeInfo.startDate).toBe('2026-08-30T10:00:00.000Z')
    expect(range.outliers).toHaveLength(0)
  })
})
