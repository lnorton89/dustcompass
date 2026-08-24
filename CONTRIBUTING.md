# Contributing to Dust Compass

Thanks for helping make Dust Compass dependable when people need it most. This
project is an independent, offline-first map and guide for Black Rock City;
changes to map, location, and listing behavior need the same care as changes to
the interface.

Please read the [Code of Conduct](CODE_OF_CONDUCT.md) before participating. For
security vulnerabilities or accidental disclosure of sensitive data, follow
[SECURITY.md](SECURITY.md) instead of opening a public issue.

## Start here

Use Node.js 24 (the version used by CI) and npm:

```sh
git clone https://github.com/lnorton89/dustcompass.git
cd dustcompass
npm ci
```

For a no-key local setup with completed-event data:

```sh
npm run fetch-data -- 2025
npm run fetch-archive -- 2025
NEXT_PUBLIC_DATA_YEAR=2025 npm run dev
```

For current-year work, run `npm run fetch-data -- 2026`, then use
`npm run fetch-api -- 2026` with `BURNING_MAN_API_KEY` set in your shell. The
key is for the fetch script only; do not put it in client code, commit it, or
include it in a screenshot. `.env` is ignored and `.env.example` records the
supported local secret name.

## Data and geographic trust

- Treat Burning Man's annual GIS survey as the source of truth for city
  geometry, streets, civic points, and service locations. Keep geographic
  claims traceable to that survey or to an official listing source.
- Use the official archive for completed years. Do not substitute copied or
  scraped third-party datasets.
- Location embargoes are a licence condition, not a display preference. Before
  the configured release times, camp and art coordinates *and address strings*
  must stay out of client-visible data. Preserve the redaction enforced by
  `scripts/fetch-api.mjs`, `scripts/lib/api.mjs`, and `src/data/embargo.ts`.
- Never commit `public/data/`, `public/fonts/`, generated `out/` files, API
  responses, or screenshots that could expose unpublished locations. These are
  intentionally ignored or generated locally.

## Make and check a change

Keep each change narrow and add or update regression coverage alongside it.
Before opening a pull request, run:

```sh
npm run typecheck
npm run lint
npm test
```

For user-facing, map, navigation, data-loading, PWA, responsive-layout, or
accessibility changes, test the exported production app as well. Build it with
the same subpath and test flag used by CI, start the export, then run the
relevant suites (run all four when the change crosses those areas):

```sh
NEXT_PUBLIC_BASE_PATH=/dustcompass NEXT_PUBLIC_E2E=1 npm run build
NEXT_PUBLIC_BASE_PATH=/dustcompass npm run preview
```

In a second terminal:

```sh
npm run test:smoke -- http://127.0.0.1:4173/dustcompass/
npm run test:a11y -- http://127.0.0.1:4173/dustcompass/
npm run test:ui -- http://127.0.0.1:4173/dustcompass/
npm run test:offline -- http://127.0.0.1:4173/dustcompass/
```

`test:smoke` exercises core production flows, `test:a11y` runs axe checks,
`test:ui` protects layout and interaction invariants, and `test:offline`
verifies that a cached export still starts and geocodes without a network. The
browser suites need Chromium; install it with `npx playwright install chromium`
when Playwright has not already downloaded it.

## Pull requests

- Work from a focused branch and use a focused commit. A conventional prefix
  such as `fix(map):` or `feat(nav):` is the established repository style.
- Explain the user-visible result, how you tested it, and the data source for
  any location or schedule change.
- Keep unrelated formatting, refactors, generated files, and data refreshes
  out of the same PR.
- Include before/after screenshots for visual changes only when they do not
  disclose embargoed data or secrets.
- CI runs the typed checks, unit tests, and a Chromium production build with
  smoke, accessibility, UI-invariant, and offline coverage. Address failures
  before requesting review.

Use the pull-request template when opening a PR. Pushing to the default branch
also triggers the deployment workflow, which fetches fresh current-year data
and re-runs release checks before publishing GitHub Pages.

## Issues

Search existing issues first, then use the bug or feature template. A good bug
report states the affected data year, browser/device, exact URL or playbook,
steps to reproduce, expected behavior, and actual behavior. Do not paste API
keys, unpublished coordinates, embargoed address strings, or private contact
details into an issue.

For broader setup and product information, see [README.md](README.md).
