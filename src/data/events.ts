import type { EventItem, Occurrence } from './types'

export interface LiveEvent {
  event: EventItem
  occurrence: Occurrence
  start: Date
  end: Date
}

export type EventWindow = 'now' | 'next3h' | 'today' | 'all'

/**
 * Flatten events to individual occurrences and pick the ones inside a window.
 * Events repeat across the week, so an event is only interesting here as
 * "this showing of it", not as a record.
 */
export function occurrencesInWindow(
  events: EventItem[],
  window: EventWindow,
  now: Date = new Date(),
): LiveEvent[] {
  if (window === 'all') {
    return events
      .flatMap((event) => event.occurrence_set.map((occurrence) => toLive(event, occurrence)))
      .sort(byStart)
  }

  const horizon =
    window === 'today' ? endOfPlayaDay(now) : new Date(now.getTime() + 3 * 60 * 60 * 1000)

  const out: LiveEvent[] = []
  for (const event of events) {
    for (const occurrence of event.occurrence_set) {
      const live = toLive(event, occurrence)
      if (Number.isNaN(live.start.getTime())) continue
      const running = live.start <= now && live.end > now
      if (window === 'now' ? running : running || (live.start > now && live.start <= horizon)) {
        out.push(live)
      }
    }
  }
  return out.sort(byStart)
}

/** Black Rock City runs on Pacific time whatever your phone thinks. */
export const PLAYA_TIME_ZONE = 'America/Los_Angeles'

function playaOffsetMs(at: Date): number {
  const local = new Date(at.toLocaleString('en-US', { timeZone: PLAYA_TIME_ZONE }))
  const utc = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }))
  return local.getTime() - utc.getTime()
}

/**
 * "Today" has to mean the playa's day, not the device's. Plenty of people
 * arrive with a phone still set to the timezone they flew from, and a schedule
 * that rolls over at the wrong midnight is worse than no schedule.
 *
 * The offset is sampled at `now` rather than assumed, so this stays correct
 * either side of a DST change.
 */
function endOfPlayaDay(now: Date): Date {
  const offset = playaOffsetMs(now)
  const local = new Date(now.getTime() + offset)
  local.setUTCHours(23, 59, 59, 999)
  return new Date(local.getTime() - offset)
}

function toLive(event: EventItem, occurrence: Occurrence): LiveEvent {
  return {
    event,
    occurrence,
    start: new Date(occurrence.start_time),
    end: new Date(occurrence.end_time),
  }
}

const byStart = (a: LiveEvent, b: LiveEvent) => a.start.getTime() - b.start.getTime()

export interface RelevantOccurrence {
  occurrence: Occurrence
  state: 'running' | 'upcoming' | 'ended'
}

/**
 * Which showing of a repeating event is worth showing right now: the one
 * running, otherwise the next one coming up, otherwise (for an event whose
 * week is entirely behind it) the one that ran most recently.
 */
export function relevantOccurrence(event: EventItem, now: Date): RelevantOccurrence | undefined {
  let upcoming: RelevantOccurrence | undefined
  let past: RelevantOccurrence | undefined
  for (const occurrence of event.occurrence_set) {
    const start = new Date(occurrence.start_time)
    const end = new Date(occurrence.end_time)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue
    if (start <= now && end > now) return { occurrence, state: 'running' }
    if (start > now && (!upcoming || start < new Date(upcoming.occurrence.start_time))) {
      upcoming = { occurrence, state: 'upcoming' }
    }
    if (end <= now && (!past || end > new Date(past.occurrence.end_time))) {
      past = { occurrence, state: 'ended' }
    }
  }
  return upcoming ?? past
}

export function formatWhen(live: LiveEvent, now: Date = new Date()): string {
  if (live.start <= now && live.end > now) {
    const left = Math.round((live.end.getTime() - now.getTime()) / 60000)
    return left < 60 ? `on now · ${left} min left` : 'on now'
  }
  const mins = Math.round((live.start.getTime() - now.getTime()) / 60000)
  if (mins > 0 && mins < 180) return `in ${mins} min`
  return live.start.toLocaleString(undefined, {
    timeZone: PLAYA_TIME_ZONE,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export interface EventRange {
  startDate: string
  endDate: string
}

export interface Clock {
  /** The moment the schedule is evaluated against. */
  now: Date
  /** True when the real clock is outside the event week and `now` is the burn. */
  preview: boolean
}

/**
 * Off-playa, the wall clock is useless for "what's on now" — it is eleven
 * months from the event and every window comes back empty. When the real time
 * falls outside the event week, scrub to the start of the burn and say so,
 * rather than showing an empty schedule that reads as a broken app.
 */
export function scheduleClock(range: EventRange | undefined, real: Date = new Date()): Clock {
  if (!range) return { now: real, preview: false }
  const start = new Date(range.startDate)
  const end = new Date(range.endDate)
  if (Number.isNaN(start.getTime()) || (real >= start && real <= end)) {
    return { now: real, preview: false }
  }
  return { now: start, preview: true }
}
