# Dust Compass

A free, modern, offline-first map, event guide, and compass for the playa.
React 19 + MUI 9 + MapLibre GL JS 6.

> This app is not affiliated, endorsed, or verified by Burning Man Project.

**Live: https://lnorton89.github.io/dustcompass/**

iBurn is mobile-only and has no web map; this is that map. It borrows iBurn's
excellent open data (MPL-2.0) but none of its 2017-era tile pipeline.

## Why it works the way it does

**The city is generated, not downloaded.** Black Rock City does not exist in
OpenStreetMap — it is surveyed and rebuilt every year. The whole city is
described by one declarative spec (`layout.json`): the Man's coordinates, a
rotation, annular streets at fixed radii, and radial streets named by clock
position. `src/brc/city.ts` turns that into GeoJSON in the browser, so a new
year is a data drop, not a tile build.

**Addresses are polar, so the geocoder is too.** `bearing = layout.bearing +
(hour%12·60 + minute)/720·360`, radius in feet from the Man. Verified against
iBurn's own geocoded camp GPS to sub-metre agreement. `src/brc/geocode.ts`
parses the forms that appear in the real data and on street signs — `D & 3:15`,
`7:30 & Esplanade`, `12:00 2500'` — and reverses them, so clicking bare playa
answers "where am I?" in the only vocabulary that works out there.

**The map rotates.** 12:00 sits at compass bearing 45°, and the map is rotated
to match by default so the city reads the way the street signs do. This is the
single feature that makes a playa map legible, and it is why Leaflet was not an
option.

**No tile server, no API key, no network.** There is no cell service on playa.
The city geometry is generated locally, glyphs are bundled, and listings are
static JSON. It installs as a PWA and precaches everything up front — shell,
worker, listings, glyphs, ~7.9MB — because a cache that fills as you browse is
useless when you are already in the desert. `scripts/offline-test.mjs` proves
this rather than asserting it: it loads the app, cuts the network entirely,
reloads, and requires the city to still render and addresses to still geocode.
That install happens once, on whatever connection someone has before they drive
out, so each asset gets three attempts and several are fetched at a time. It
still fails as a whole if anything is unreachable — a partial cache reporting
success would be a lie told at the worst possible moment — but it says so, and
the status chip offers a retry rather than freezing on the count it died at.
The offline test drops a request mid-install to prove the retry works.
If you later want surrounding desert, `src/map/protocols.ts` registers
`pmtiles://` — a single static archive read with HTTP range requests, no
backend.

**Dark by default, with a red night mode.** A white screen at 3am destroys
night vision for everyone standing near you; red preserves it, which is why red
headlamps are the convention out here. Night mode puts the whole interface on a
single low-luminance red, not just the map — a bright white dialog would undo
the point of it.

**Saved spots are the point at 4am.** Where the tent is, where the bike got
left, where you agreed to meet. They live on the device, never touch the
network, and survive a corrupted or truncated write — losing the file is
acceptable, crashing the map on the one night it is needed is not. Toilets and services stay on their own layer that survives
filtering camps and art away, for the same reason.

**"What's on now" is only half the question.** The other half is whether you
can get there before it ends, so the events list sorts by distance as well as
time. Choosing that sort is also when it asks for your location — offering it
only once a fix exists means it is never there when it is first wanted.

**The share image is built, not committed.** `scripts/lib/og-plate.mjs`
describes the card once — palette, wordmark, compass rosette, the required
non-affiliation line — and [metaplate](https://github.com/lnorton89/metaplate)
renders it to `public/og-image.png` on every build, embedding real Inter bytes
rather than trusting the build machine to have the font. The old pipeline
screenshotted an SVG in headless Chromium, so the committed card was silently
set in whatever the machine had installed. `metaplate verify` then checks the
PNG header of both the source and exported copies, because a share image that
404s or decodes wrong is invisible until someone posts the link. It is the one
asset deliberately excluded from the offline precache: it is for crawlers, and
the first-run download has to finish before the user reaches the desert.

**Time is playa time.** "What's on now" uses Black Rock City's clock, not the
device's — people arrive with phones still set to wherever they flew from. And
outside the event week the wall clock makes every window empty, so the schedule
scrubs to the start of the burn and says it is previewing, rather than showing
an empty list that reads as a broken app.

## Getting started

```sh
npm install
npm run fetch-data      # vendors geometry only (defaults to 2025)
npm run fetch-archive -- 2025                # official historical listings
BMORG_API_KEY=... npm run fetch-api -- 2026  # keyed current-year listings
npm run dev
```

`npm run fetch-data 2024` pulls a different year.

### Live listings

`fetch-data` vendors iBurn's snapshot, which lags the current year. To pull
camps, art and events straight from the source:

```sh
export BMORG_API_KEY=...            # https://api.burningman.org/api-key-request/
npm run fetch-api 2026
NEXT_PUBLIC_DATA_YEAR=2026 npm run dev
```

The city layout still comes from `fetch-data` — only the listings are replaced,
which is the part published late each year. Records without coordinates are left
alone rather than geocoded at fetch time: the app geocodes `location_string` at
load using the same code that powers search, so doing it twice would be two
places to get it wrong.

The script validates every response against the fields the app reads and
**refuses to overwrite good data with a shape it does not recognise** — the
alternative failure mode is silent, producing a dataset that loads happily and
renders an empty map. It also distinguishes "locations are still embargoed" from
"your key cannot see locations", which look identical in the response.

## What it does

- Renders Black Rock City generated from its layout spec, rotated so 12:00 is up,
  with surveyed camp footprints once you zoom in
- Search by camp or art name, or by address — `D & 3:15`, `7:30 & Esplanade`,
  `9:00 B Plaza @ 4:45`, `12:00 2500'`
- Tap bare playa to get its street address back
- Toilets, medical, rangers and civic landmarks on a layer of their own
- Events filtered to now / next 3h / today, sorted by time or by how close they
  are, jumping to the hosting camp
- Favourites, and walk/bike estimates from your GPS fix or the Man
- "Take me there" draws a line from where you are, with distance, walk and
  bike estimates, and the direction as a clock position
- Save where your camp, tent or bike is, and find your way back to it
- Dark, light, and a red night mode that preserves night vision
- Share any listing or dropped pin as a link that carries a playa address
- Installs as an app and works with no connectivity at all

## Deploying

Pushing to the default branch builds and publishes to GitHub Pages
(`.github/workflows/deploy.yml`). The site lands at
`https://<owner>.github.io/<repo>/`.

**Setup:** Pages must be on, with *Settings → Pages → Source* set to **GitHub
Actions** rather than "Deploy from a branch". The workflow cannot enable Pages
itself — creating the site needs a permission the default `GITHUB_TOKEN` does
not carry. Left on the branch source, Pages publishes the repository as-is,
which serves the unbuilt `index.html` and a blank page.

A Pages project site is served from a subpath, so the build takes the prefix
from the repo name via `BASE_PATH`. Everything that loads data, fonts or icons
goes through `NEXT_PUBLIC_BASE_PATH`, and the service worker's scope and
`start_url` follow it, so the offline install works from the subpath too — the
offline test passes against a production `/dustcompass/` Next.js export.

To deploy anywhere else, build with the prefix that host serves from and publish
`out/`:

```sh
npm run fetch-data 2025
NEXT_PUBLIC_BASE_PATH= npm run build   # a root domain, e.g. Netlify or Cloudflare Pages
```

HTTPS is required, not optional: service workers and geolocation both refuse to
run without it, and those are the two things this app is for.

## Data and licensing

The compact runtime layout adapter and offline glyphs come from
[iBurn-Data](https://github.com/iburnapp/iBurn-Data) (MPL-2.0); publishable GIS
geometry comes from Burning Man's official no-key dataset. Camp, art and
event listings are fetched directly from Burning Man's official public
[dataset archive](https://innovate.burningman.org/dataset/) for completed years,
or from the [Burning Man public API](https://innovate.burningman.org/apis-page/)
for the current year.

The fetch and deploy pipeline intentionally does not copy Event Data from
iBurn-Data. The current historical build uses Burning Man's no-key 2025 JSON
archive. A current-year build obtains listings from the official API using the
key issued for this app, stored only as the masked `BMORG_API_KEY` GitHub Actions
secret; the key is never inlined into the client bundle or shipped to browsers. The app is
free, contains no advertising, uses an original name and compass mark, and
includes the required non-affiliation disclaimer in the live interface and share image.
See the current [API and dataset terms](https://innovate.burningman.org/terms-of-service-for-burning-man-apis-and-datasets/).

Those terms embargo location data: **camp locations may not be shown before the
Sunday preceding the event, and art locations not until Gates open.** That is a
licence condition, so `scripts/fetch-api.mjs` removes confidential locations
before writing anything into `public/` or the offline cache. The client repeats
the check in `src/data/embargo.ts` as defense in depth; this is never merely a
UI filter. Both stages strip the address string as well as the coordinates — a
playa address geocodes back to within a metre of the published GPS, so leaving
it in place would hand back exactly the position the embargo exists to withhold.

For 2026, drop in the published `layout.json` and point `NEXT_PUBLIC_DATA_YEAR` at it.

## Stack notes

| Package | Version | Note |
|---|---|---|
| `maplibre-gl` | 6.5.0 | ESM-only, WebGL2-required as of v6 |
| `@vis.gl/react-maplibre` | 8.1.2 | vis.gl's MapLibre binding, split out of `react-map-gl` v8 |
| `@mui/material` | 9.3.1 | v9 realigned majors with MUI X |
| `pmtiles` | 4.5.0 | optional basemap, single static archive |
| `react` | 19.2 | |
| `next` | 16.3 | App Router, `output: 'export'` — no server anywhere |
| `metaplate` | 0.1.2 | renders and verifies the share image at build time |
| `vitest` | 4.1 | |

Two integration details worth knowing, both of which cost real debugging time:

- **MapLibre 6 resolves its web worker from `import.meta.url`.** Once a bundler
  emits the library as a hashed chunk, the sibling `maplibre-gl-worker.mjs` no
  longer exists and 404s. Because every GeoJSON source is parsed in the worker,
  the map paints its background and then *silently never fires `load`* — no
  error. `scripts/copy-map-worker.mjs` copies the official module worker and
  its shared runtime into `public/`, and `src/map/worker.ts` points
  `setWorkerUrl` at that fixed path — which also survives a strict CSP.
- **MUI 9 `Stack` dropped `alignItems`/`justifyContent`/`gap` as direct props**
  (use `spacing` and `sx`), and `Autocomplete`'s `renderInput` params now expose
  `slotProps` rather than `InputProps`. Spread `params.slotProps` when you
  override it, or you drop the ref to the underlying `<input>`.

## Testing

Four layers, all runnable locally.

```sh
npm test                                                 # 74 unit + component tests
NEXT_PUBLIC_E2E=1 npm run build && npm run preview &
npm run test:smoke  http://127.0.0.1:4173/dustcompass/   # browser assertions
npm run test:a11y   http://127.0.0.1:4173/dustcompass/   # axe, 8 UI states
npm run test:offline http://127.0.0.1:4173/dustcompass/  # proves offline works
```

**Unit** — the geocoder is held against Burning Man's own surveyed GPS rather
than a handful of fixtures. All 1,369 published camp addresses parse, and every
one that is a street intersection or plaza rim lands **within one metre** of the
surveyed position. Portal addresses are held to a looser bound because a portal
is a gap in the street ring spanning an arc, not a point. The embargo has its
own regression test asserting that no embargoed listing retains anything the map
could plot.

**Smoke** — boots Chromium, asserts the city rendered (streets, labels, camp
clusters, toilets, services), toggles a filter and checks the layer actually
empties and refills, drives a search, opens a listing, stars it and confirms it
persisted.

**Accessibility** — axe against WCAG 2.1 AA across the map, events panel,
search suggestions, listing details, navigation, the save dialog, red night mode
and the phone layout including its filter sheet. Night mode drops contrast
deliberately and still has to pass — it caught a 4.37:1 chip that would
otherwise have shipped.

**Offline** — loads the app, waits for the service worker to finish precaching,
disables the network, reloads, and requires the map to paint and addresses to
geocode with nothing available from the server.
