/**
 * Burning Man's API terms of service embargo location data: camp locations may
 * not be shown before the Sunday preceding the event, and art locations may not
 * be shown until Gates open. This is a licence condition, so it is enforced on
 * the data as it is loaded rather than hidden in the UI — a filter someone can
 * toggle off is not compliance.
 *
 * https://innovate.burningman.org/terms-of-service-for-burning-man-apis-and-datasets/
 */
import { EMBARGO_RELEASES } from './embargoDates.mjs'

export interface EmbargoWindow {
  /** Gates open. Art locations are withheld until this moment. */
  gatesOpen: Date
  /** Sunday preceding the event. Camp locations are withheld until this moment. */
  campRelease: Date
}

function windowFor(dates: { campRelease: string; gatesOpen: string }): EmbargoWindow {
  return { campRelease: new Date(dates.campRelease), gatesOpen: new Date(dates.gatesOpen) }
}

/** Burning Man 2026: Gates open 12:01am Sunday 30 August (PDT, UTC-7). */
export const BRC_2026: EmbargoWindow = windowFor(EMBARGO_RELEASES['2026'])

export const BRC_2025: EmbargoWindow = windowFor(EMBARGO_RELEASES['2025'])

export function embargoWindowForYear(year: string): EmbargoWindow {
  if (year === '2025') return BRC_2025
  if (year === '2026') return BRC_2026
  throw new Error(`No reviewed location-release schedule is configured for ${year}.`)
}

export interface EmbargoState {
  campsReleased: boolean
  artReleased: boolean
}

export function embargoState(window: EmbargoWindow, now: Date = new Date()): EmbargoState {
  return {
    campsReleased: now >= window.campRelease,
    artReleased: now >= window.gatesOpen,
  }
}

/**
 * Strip location from records still under embargo, keeping the listing itself.
 *
 * This removes the address string as well as the coordinates, and it has to:
 * a playa address geocodes back to within a metre of the published GPS, so
 * leaving "12:00 2500', Open Playa" in place would hand back exactly the
 * position the embargo exists to withhold.
 */
export function applyEmbargo<
  T extends {
    location?: { gps_latitude?: number; gps_longitude?: number }
    location_string?: string
  },
>(items: T[], released: boolean): T[] {
  if (released) return items
  return items.map((item) => ({ ...item, location: undefined, location_string: undefined }))
}
