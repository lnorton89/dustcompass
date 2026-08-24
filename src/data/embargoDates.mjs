/**
 * The single source of truth for Burning Man's location-embargo release
 * timestamps — the Sunday preceding the event (camps) and Gates opening
 * (art) — imported by both the app's own embargo check (`embargo.ts`) and
 * the build-time redaction that decides what ever reaches disk
 * (`scripts/lib/api.mjs`). Plain JS, not TypeScript: `scripts/lib/api.mjs`
 * runs as a plain Node script with no build step (`node scripts/fetch-api.mjs`),
 * so it has to import this exactly as written, with no compiler in the way.
 *
 * ISO strings rather than `Date` objects: a `Date` constructed once here at
 * module-load time would be a single shared mutable object every importer
 * held the same reference to. Each side constructs its own from these.
 */
export const EMBARGO_RELEASES = {
  2025: {
    campRelease: '2025-08-17T00:00:00-07:00',
    gatesOpen: '2025-08-24T00:01:00-07:00',
  },
  2026: {
    campRelease: '2026-08-23T00:00:00-07:00',
    gatesOpen: '2026-08-30T00:01:00-07:00',
  },
}
