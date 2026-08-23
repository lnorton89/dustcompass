# Playa Map

A modern, offline-first web map of Black Rock City. React 19 + MUI 9 +
MapLibre GL JS 6.

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
static JSON. The map renders with the network switched off. If you later want
surrounding desert, `src/map/protocols.ts` registers `pmtiles://` — a single
static archive read with HTTP range requests, no backend.

**Dark by default.** A white screen at 3am destroys night vision for everyone
standing near you.

## Getting started

```sh
npm install
npm run fetch-data      # vendors iBurn-Data 2025 into public/ (defaults to 2025)
npm run dev
```

`npm run fetch-data 2024` pulls a different year.

## Data and licensing

City layout, geometry and listings come from
[iBurn-Data](https://github.com/iburnapp/iBurn-Data) (MPL-2.0). Camp, art and
event listings originate from the [Burning Man public
API](https://innovate.burningman.org/apis-page/), which requires a key and
carries terms of service.

Those terms embargo location data: **camp locations may not be shown before the
Sunday preceding the event, and art locations not until Gates open.** That is a
licence condition, so it is enforced on the data as it loads
(`src/data/embargo.ts`), not as a UI filter. The embargo strips the address
string as well as the coordinates — a playa address geocodes back to within a
metre of the published GPS, so leaving it in place would hand back exactly the
position the embargo exists to withhold.

For 2026, drop in the published `layout.json` and point `VITE_DATA_YEAR` at it.

## Stack notes

| Package | Version | Note |
|---|---|---|
| `maplibre-gl` | 6.5.0 | ESM-only, WebGL2-required as of v6 |
| `@vis.gl/react-maplibre` | 8.1.2 | vis.gl's MapLibre binding, split out of `react-map-gl` v8 |
| `@mui/material` | 9.3.1 | v9 realigned majors with MUI X |
| `pmtiles` | 4.5.0 | optional basemap, single static archive |
| `react` | 19.2 | |
| `vite` | 8.2 | |

Two integration details worth knowing, both of which cost real debugging time:

- **MapLibre 6 resolves its web worker from `import.meta.url`.** Once a bundler
  emits the library as a hashed chunk, the sibling `maplibre-gl-worker.mjs` no
  longer exists and 404s. Because every GeoJSON source is parsed in the worker,
  the map paints its background and then *silently never fires `load`* — no
  error. `src/map/worker.ts` fixes it with `setWorkerUrl` and Vite's
  `?worker&url`, which bundles the worker together with the shared chunk it
  imports.
- **MUI 9 `Stack` dropped `alignItems`/`justifyContent`/`gap` as direct props**
  (use `spacing` and `sx`), and `Autocomplete`'s `renderInput` params now expose
  `slotProps` rather than `InputProps`. Spread `params.slotProps` when you
  override it, or you drop the ref to the underlying `<input>`.

## Testing

```sh
npm run dev &
node scripts/smoke.mjs http://127.0.0.1:5173/ smoke.png
```

Boots the app in Chromium, asserts the city actually rendered (streets, labels,
camp clusters), drives a search through the UI, and confirms the camera flew to
the geocoded address.
