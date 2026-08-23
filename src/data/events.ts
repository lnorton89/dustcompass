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

  const horizon = new Date(now)
  if (window === 'next3h') horizon.setHours(horizon.getHours() + 3)
  if (window === 'today') horizon.setHours(23, 59, 59, 999)

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

function toLive(event: EventItem, occurrence: Occurrence): LiveEvent {
  return {
    event,
    occurrence,
    start: new Date(occurrence.start_time),
    end: new Date(occurrence.end_time),
  }
}

const byStart = (a: LiveEvent, b: LiveEvent) => a.start.getTime() - b.start.getTime()

export function formatWhen(live: LiveEvent, now: Date = new Date()): string {
  if (live.start <= now && live.end > now) {
    const left = Math.round((live.end.getTime() - now.getTime()) / 60000)
    return left < 60 ? `on now · ${left} min left` : 'on now'
  }
  const mins = Math.round((live.start.getTime() - now.getTime()) / 60000)
  if (mins > 0 && mins < 180) return `in ${mins} min`
  return live.start.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
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
