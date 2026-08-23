# Dust Compass — Fresh UI / PWA Review

**Audited:** 2026-08-23  
**Baseline:** Abstract polished, offline-first mobile-map and PWA standards; requested Next.js migration  
**Screenshots:** Captured at 1440×900, 768×1024, and 375×812. The former `/burningman/` URL returns a GitHub Pages 404. The renamed `/dustcompass/` URL returns a blank document: it serves source `index.html` with `/src/main.tsx`, no production assets, manifest, or service worker.

---

## Ship blockers

1. **BLOCKER — the public app is unavailable.** `https://lnorton89.github.io/burningman/` is a 404. `https://lnorton89.github.io/dustcompass/` is HTTP 200 but blank; it exposes Vite source HTML and has no `assets/`, `manifest.webmanifest`, or `sw.js`. A user cannot open, install, or use the PWA. This points to GitHub Pages serving the repository branch/root instead of the Actions Pages artifact, or an incomplete/stale deployment. Fix Pages to use **GitHub Actions**, rerun the deployment, and gate release on a deployed smoke test.
2. **BLOCKER — repo rename still points at the old product URL.** Canonical, Open Graph, Twitter image URLs, `BRAND.siteUrl`, README live link, and regression documentation hard-code `/burningman/` ([index.html](index.html):10-28, [src/brand.ts](src/brand.ts):5, [README.md](README.md):8,137). Shared links and social previews will be wrong after the rename even once the bundle deploys. Derive absolute metadata from one `NEXT_PUBLIC_SITE_URL`/build-time site origin and set it to `https://lnorton89.github.io/dustcompass/`.

---

## Pillar scores

| Pillar | Score | Key finding |
|---|---:|---|
| 1. Copywriting | 2/4 | Helpful destination copy, but no install/offline guidance and production error text is developer-facing. |
| 2. Visuals | 2/4 | Strong map markers in source, but live users see 404/blank and map interaction cursor is misleading. |
| 3. Color | 3/4 | The three intentional palettes are coherent, though semantic status and contrast verification are absent. |
| 4. Typography | 3/4 | A restrained hierarchy, but critical map labels and navigation details are too small for outdoor use. |
| 5. Spacing | 2/4 | Main shell is orderly; fixed 70dvh sheets and unbounded map-label collisions compromise small screens. |
| 6. Experience design | 1/4 | The live product is unavailable; install/update, resilient loading, and destructive-action safeguards are incomplete. |

**Overall: 13/24**

---

## Top fixes, in delivery order

1. **Restore a verifiable deployment before feature work.** Configure Pages for Actions, ensure `dist` is the published artifact, set `BASE_PATH=/dustcompass/`, and add an end-to-end job against the actual deployed URL that asserts shell, manifest, service worker, data fetch, and one map interaction.
2. **Make the Next.js migration a static, offline-first migration—not merely a framework swap.** Use Next App Router with `output: 'export'`, `basePath`/`assetPrefix` from one env var, metadata/manifest generated from that same origin, and a tested service-worker integration compatible with static export. Keep the map client-only and preserve today’s precache coverage for data, glyphs, icons, and app shell.
3. **Add a first-run “ready for playa” flow.** Give users explicit install status, download/cache progress, last data-updated year/date, storage size, update/reload control, and a clear offline-ready confirmation. Do not imply the map is available offline while initial data is still loading.

---

## Detailed findings

### 1. Copywriting — 2/4

- **WARNING:** The first runtime failure says “run `npm run fetch-data` first” ([src/App.tsx](src/App.tsx):372-375). That is a maintainer instruction shown to a burner. Replace it with a user recovery state: “Map data could not load. Check your connection, then retry,” plus a retry button and an optional technical-details disclosure.
- **WARNING:** The loading surface is only a spinner ([src/App.tsx](src/App.tsx):377-381). It gives no offline/download expectation, cache state, year, or recovery action. A polished PWA should distinguish **Downloading map for offline use**, **Opening saved map**, and **Could not load**.
- **WARNING:** Event empty copy—“Nothing scheduled in this window” ([src/ui/EventsPanel.tsx](src/ui/EventsPanel.tsx):178-182)—does not suggest a useful next action. Add “Try Today”/“Show all events,” especially when date data is previewed.
- **WARNING:** Destination naming is much clearer than before, but the navigation bar can collapse the useful context into a dense inline sentence at the bottom ([src/ui/NavBar.tsx](src/ui/NavBar.tsx):51-68). State the mode explicitly: “Heading to Sound Garden · 2:00 & E,” then distance and direction on a separate, scannable line.

### 2. Visuals — 2/4

- **BLOCKER:** No visual assessment of the functional app is possible from production screenshots because the old URL is a 404 and the new URL is blank. This is a visual failure, not a neutral test omission.
- **WARNING:** `MapView` sets a pointer cursor for the entire map on mouse entry rather than only on interactive features ([src/map/MapView.tsx](src/map/MapView.tsx):131-134). This falsely signals that clicking empty playa selects something and makes desktop map behavior feel less deliberate. Use `onMouseMove` plus `queryRenderedFeatures`, or restore the default cursor over bare map.
- **WARNING:** POI labels use 10–12px map text ([src/map/PoiLayers.tsx](src/map/PoiLayers.tsx):72,99; [src/map/ServiceLayers.tsx](src/map/ServiceLayers.tsx):52,95). On a sunlit phone those labels will be difficult to resolve. Increase mobile-relevant label sizes and prioritize selected/saved/service labels over generic camp labels.
- **WARNING:** Saved spots “stay labelled at every zoom” ([src/map/SavedPlacesLayer.tsx](src/map/SavedPlacesLayer.tsx):12-48). Multiple saved places will collide with POIs and streets, making an already dense map less legible. At city zoom show pins only; reveal labels at a readable threshold or after selection.

### 3. Color — 3/4

- **WARNING:** Dark, light, and red-night palettes are purposeful ([src/map/style.ts](src/map/style.ts):22-70; [src/ui/theme.ts](src/ui/theme.ts):8-44), and destination colors differ from ordinary markers. That is a strong foundation.
- **WARNING:** The color system does not document or test text/icon contrast for every palette. Tiny labels use low-luminance colors over semi-transparent halos, and MUI default/outlined controls vary by state. Add automated contrast checks for dark, light, and night palettes; test hover/focus/disabled states as well as static text.
- **WARNING:** Service categories rely heavily on color; map dots have no persistent shape/icon distinction ([src/map/ServiceLayers.tsx](src/map/ServiceLayers.tsx):31-105). Medical, ranger, and civic locations should have distinct iconography or text/category chips in the focused state for color-vision independence.

### 4. Typography — 3/4

- **WARNING:** The app keeps a sensible type hierarchy (one family, h6, body, caption), but crucial outdoor-use details are 10–12px: map labels, address callouts, and navigation metrics ([src/map/PoiLayers.tsx](src/map/PoiLayers.tsx):72,99; [src/ui/NavBar.tsx](src/ui/NavBar.tsx):45-67). Raise minimum actionable/map label sizes and validate at 200% browser text zoom.
- **WARNING:** `FocusMarker` truncates the target name with a single-line ellipsis ([src/map/FocusMarker.tsx](src/map/FocusMarker.tsx):87-96). A destination name is not decorative—allow two lines or shorten only after preserving the unique part of the name.
- **WARNING:** Search results have title and detail but lack a visible rank, icon, or consistent category affordance at a glance ([src/ui/SearchPanel.tsx](src/ui/SearchPanel.tsx):95-115). Add leading category icons and use typography to distinguish saved place, exact address, and fuzzy text result.

### 5. Spacing — 2/4

- **WARNING:** Both the detail and events drawers take exactly `70dvh` on compact screens ([src/ui/DetailDrawer.tsx](src/ui/DetailDrawer.tsx):68-72; [src/ui/EventsPanel.tsx](src/ui/EventsPanel.tsx):92-97). That ignores content and keyboard/safe-area needs: a long event list gets cramped, while a short listing leaves an oversized sheet. Use snap points/content-aware height with `env(safe-area-inset-bottom)` and ensure the focused control stays visible when the keyboard opens.
- **WARNING:** The dense navigation bar combines five independent values in one horizontal row ([src/ui/NavBar.tsx](src/ui/NavBar.tsx):37-69). It will wrap unpredictably on narrow phones and can overlap the map’s own controls/disclaimer. Use a two-row layout and reserve bottom map-control clearance by breakpoint.
- **WARNING:** Persistent labels for POIs, services, toilets, and saved places use independent offsets without collision rules ([src/map/PoiLayers.tsx](src/map/PoiLayers.tsx):91-106; [src/map/ServiceLayers.tsx](src/map/ServiceLayers.tsx):45-104; [src/map/SavedPlacesLayer.tsx](src/map/SavedPlacesLayer.tsx):35-48). Establish a label priority and collision policy as part of the map design system.

### 6. Experience design — 1/4

- **BLOCKER:** The current deployment cannot pass the fundamental launch, install, or offline task. At the new URL, `manifest.webmanifest` and `sw.js` are 404, so PWA criteria are objectively unmet.
- **BLOCKER:** CI exercises `npx vite` development mode for browser/a11y tests rather than the production build ([.github/workflows/ci.yml](.github/workflows/ci.yml):39-50). This misses subpath, generated asset, manifest, and service-worker failures—the exact class now visible in production. Run browser/a11y against `vite preview` of a build with `BASE_PATH=/${repo}/`, then add a post-deploy external smoke test.
- **WARNING:** The “Reset saved settings” recovery action clears *all* origin local storage without confirmation ([src/ui/ErrorBoundary.tsx](src/ui/ErrorBoundary.tsx):29-38). In an offline safety tool this can erase saved camp/bike locations at the moment the user needs them. Scope deletion to app keys, show a confirmation that names what will be erased, and offer export/import first.
- **WARNING:** Navigation starts continuous high-accuracy geolocation automatically ([src/App.tsx](src/App.tsx):209-221; [src/data/useGeolocation.ts](src/data/useGeolocation.ts):45-62) but does not expose accuracy, stale-fix age, battery impact, or a retry/help path after denial. The destination flow needs a concise consent/status panel, accuracy indicator, and manual-origin fallback.
- **WARNING:** Search starts only at two characters and returns a fixed insertion-order 40ish-item list, with no accent normalization, address token matching, typo tolerance, or ranking ([src/ui/SearchPanel.tsx](src/ui/SearchPanel.tsx):41-79). For a completed app, build an offline index at data load and score exact saved-place/address/name matches first.
- **WARNING:** Deleting a saved spot is immediate ([src/ui/FilterSheet.tsx](src/ui/FilterSheet.tsx):104-118). Add undo snackbar or confirmation; saved camp and bike pins are high-value, easy-to-mis-tap data.

---

## Next.js migration acceptance criteria

1. `https://lnorton89.github.io/dustcompass/` serves a built static export—not repository source—and no `/burningman/` URL remains in runtime metadata, links, favicon/OG paths, or cache scope.
2. Lighthouse/Playwright checks the production URL at desktop and 375px: document shell, map canvas, search, destination focus, dialog keyboard behavior, and safe-area layout.
3. Installability check confirms a manifest, correct `start_url`/scope, icons, and active service worker; a network-off reload can search local camp data and render map glyphs.
4. First-run cache/download and subsequent offline-ready state are visible, cancellable/retriable, and include the data year and refresh date.
5. Saved locations can be renamed, exported, restored, and deleted with undo/confirmation; app reset cannot silently erase unrelated origin data.

---

## Files audited

- [index.html](index.html), [vite.config.ts](vite.config.ts), [src/brand.ts](src/brand.ts)
- [src/App.tsx](src/App.tsx), [src/main.tsx](src/main.tsx)
- [src/ui/SearchPanel.tsx](src/ui/SearchPanel.tsx), [src/ui/DetailDrawer.tsx](src/ui/DetailDrawer.tsx), [src/ui/EventsPanel.tsx](src/ui/EventsPanel.tsx), [src/ui/NavBar.tsx](src/ui/NavBar.tsx), [src/ui/FilterSheet.tsx](src/ui/FilterSheet.tsx), [src/ui/SavePlaceDialog.tsx](src/ui/SavePlaceDialog.tsx), [src/ui/ErrorBoundary.tsx](src/ui/ErrorBoundary.tsx), [src/ui/theme.ts](src/ui/theme.ts)
- [src/map/MapView.tsx](src/map/MapView.tsx), [src/map/PoiLayers.tsx](src/map/PoiLayers.tsx), [src/map/FocusMarker.tsx](src/map/FocusMarker.tsx), [src/map/ServiceLayers.tsx](src/map/ServiceLayers.tsx), [src/map/SavedPlacesLayer.tsx](src/map/SavedPlacesLayer.tsx), [src/map/style.ts](src/map/style.ts)
- [src/data/usePlayaData.ts](src/data/usePlayaData.ts), [src/data/useGeolocation.ts](src/data/useGeolocation.ts), [src/data/useSavedPlaces.ts](src/data/useSavedPlaces.ts)
- [.github/workflows/ci.yml](.github/workflows/ci.yml), [.github/workflows/deploy.yml](.github/workflows/deploy.yml), [scripts/smoke.mjs](scripts/smoke.mjs), [scripts/offline-test.mjs](scripts/offline-test.mjs), [README.md](README.md)
