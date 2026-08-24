# Dust Compass — UI Review & Professionalisation Plan

**Audited:** 2026-08-23
**Baseline:** Abstract 6-pillar standards (no UI-SPEC.md in this repo)
**Method:** Live capture against `next dev` at ten viewports — 320, 375, 414, 768, 900, 1024, 1280, 1440, 1920 and 812×375 landscape — plus interaction states (search, detail, navigation, events, filters) and all three themes. Measured contrast, tap-target and layout geometry in-page. Code read alongside.

> Supersedes the previous review, which described a 404/blank deployment. The app now builds, loads, and works end-to-end at every breakpoint tested. Nothing below is a ship blocker; this is a quality gap, not a broken product.

---

## Status: implemented

All five streams are in the working tree. The scores and findings below are the **baseline** — what the audit found before any of it was done. Re-measured against the production export:

| | Before | After |
|---|---|---|
| Search field, 320px | **79px** | **262px** |
| Search field, 375px | 134px | 317px |
| Sub-44px tap targets, compact | 10–16 per viewport | **0** |
| Search width, 1024 → 1280 | 437 → **322** (dip) | 420 → **480** (rises) |
| Disclaimer, dark / light / night | 14.46:1 in all three | three distinct surfaces |
| AppBar background | MUI grey `#212121` | theme paper, all modes |
| MapLibre controls in red-night | 5 white rectangles | themed, 44px |
| Detail panel on desktop | overlay, sliced the toolbar | column beside the map |
| Detail focus padding | fixed 70% of viewport | measured (`301.89px` of 812) |

Verified against the production export at `/dustcompass/`: **64/64 smoke assertions**, **10/10 accessibility surfaces** (including the new first-run dialog on both viewports), **8/8 offline**, 115 unit tests, clean typecheck.

Three things changed beyond the plan, each because the work exposed them:

- **The disclaimer was swallowing map taps.** It is an opaque box over the bottom-left of the city with nothing in it to press, so any camp or cluster behind it could not be selected. It is now `pointer-events: none`.
- **The "Closest" sort carried an `aria-label` that hid its own visible text**, which is a WCAG 2.5.3 *Label in Name* failure and breaks voice control. The visible word is now the accessible name.
- **Next's dev-overlay badge is disabled.** It is fixed to the bottom-left corner, which is where the new bottom bar's first control sits — it was covering "Layers" for developers and intercepting the click in the end-to-end scripts.

Two scripts had to learn about the new first-run dialog: the accessibility pass audits it and then dismisses it; the smoke run marks it seen before boot, because it walks sixty-four other assertions behind it.

---

## Pillar scores

| Pillar | Score | Key finding |
|---|---:|---|
| 1. Copywriting | 3/4 | Loading, error and save copy are genuinely good; event metadata is machine vocabulary. |
| 2. Visuals | 2/4 | Off-palette embargo banner and numbered cluster bubbles own the screen; desktop panel is a flat rectangle that guillotines the toolbar. |
| 3. Color | 2/4 | Three deliberate palettes, but the disclaimer, the AppBar, the status chip and every map control ignore all three. |
| 4. Typography | 2/4 | Restrained scale, aimed the wrong way: 24 of 33 text elements are ≤14px in an app used in sunlight. |
| 5. Spacing | 2/4 | Disciplined 8px scale undone by a 79px search box and no tap target anywhere reaching 44×44. |
| 6. Experience design | 2/4 | Excellent state coverage; no onboarding, no thumb-reachable navigation, desktop is a phone with a wider toolbar. |

**Overall: 13/24**

---

## The three fixes that change how the app reads

1. **Give every control a thumb.** Not one interactive element in the app reaches 44×44 — icon buttons render 30×30, toggles 36×36, chips 24px tall, MapLibre's own controls 29×29. This app is used with dust on the screen, gloves on, at night. Raise the whole control layer to a 48px touch standard and the app stops feeling like a prototype in a single pass.
2. **Make the top bar stop competing with the map.** At 320px the search field — the primary control — collapses to **79px** and the placeholder truncates to "Search …". Move actions off the toolbar into a bottom bar within thumb reach, and let search own the top.
3. **Finish the three themes.** The disclaimer renders identical cream-on-ink at **14.46:1 in all three modes** (measured), the AppBar resolves to MUI grey `#212121` rather than the warm or red paper, the status chip stays green in red-night, and MapLibre's controls are unstyled white — four bright slabs in the mode that exists to avoid bright screens.

---

## Detailed findings

### 1. Copywriting — 3/4

**Working.** The loading state is the best copy in the app: "Drawing Black Rock City", plus an explanation of *why* there is nothing to wait for ([src/App.tsx](src/App.tsx)). The error state recovers rather than blames, and reassures about saved spots. `SavePlaceDialog`'s five suggestions ("My camp", "My bike", "Art car") are exactly right for typing in the dark ([src/ui/SavePlaceDialog.tsx](src/ui/SavePlaceDialog.tsx):25).

- **WARNING:** Event type chips render raw four-letter abbreviations — `prty`, `othr`, `adlt`, `care` ([src/ui/EventsPanel.tsx](src/ui/EventsPanel.tsx):176). These are API codes shown to a user. Use `event_type.label`, truncated, or drop the chip and encode type as a leading icon.
- **WARNING:** Events whose host cannot be located render as disabled rows with no explanation ([src/ui/EventsPanel.tsx](src/ui/EventsPanel.tsx):168). The user sees a greyed-out line and no reason. Say "location not listed" in the secondary line and leave the row at normal contrast.
- **WARNING:** "Nothing scheduled in this window." ([src/ui/EventsPanel.tsx](src/ui/EventsPanel.tsx):190) offers no way out. Empty states should carry the escape: "Nothing in this window — **show today** or **show all**."
- **WARNING:** The detail drawer's privacy sentence is two lines of body copy under a one-line listing ([src/ui/DetailDrawer.tsx](src/ui/DetailDrawer.tsx):176). It is the right thing to say in the wrong place — say it once, at first navigation, not on every listing.
- **WARNING:** The kind chip prints the raw enum in lower case — `service`, `camp`, `art` ([src/ui/DetailDrawer.tsx](src/ui/DetailDrawer.tsx):119). Title-case display labels.

### 2. Visuals — 2/4

- **WARNING:** The embargo notice is MUI's `severity="info"` filled variant — saturated `#0288d1` blue in a palette of ember, teal and dust. On first paint at 320px it occupies roughly a tenth of the screen and is the loudest element in the app. Re-skin it to the dust/ember palette and reduce it to a single line.
- **WARNING:** At city zoom on a phone the map is a field of numbered teal circles. Cluster counts are rendered at the same weight as the place names they hide, so "160" reads louder than "Center Camp". Down-weight cluster counts, and keep landmark labels above clusters in the paint order.
- **BLOCKER (composition):** On desktop the detail drawer is a temporary `Drawer` overlaying the whole viewport, so it slices the AppBar mid-chip — at 1440 the "Toilets" filter chip is cut in half by the panel edge. A desktop detail panel should sit inside the layout beside the map, not on top of the app shell ([src/ui/DetailDrawer.tsx](src/ui/DetailDrawer.tsx):62).
- **WARNING:** That same panel is 400px wide × 900px tall holding four lines of content — roughly 700px of empty black. There is no empty-state treatment, no image slot, no fallback content.
- **WARNING:** The panel is flat `background.paper` against a flat dark map with no border, shadow or seam. Nothing separates app chrome from content.
- **WARNING:** The toolbar mixes three control shapes at three heights in one row — chips at 24px, icon buttons at 30px, toggle buttons at 36px — with no grouping or separators ([src/App.tsx](src/App.tsx)). It reads as accumulated rather than designed.

### 3. Color — 2/4

Three intentional palettes ([src/map/style.ts](src/map/style.ts):27-90) and a night mode that correctly reaches into MUI's snackbar and chip defaults ([src/ui/theme.ts](src/ui/theme.ts)) — the intent is real. Four surfaces escape it:

- **BLOCKER:** The API disclaimer hard-codes `bgcolor: 'rgba(18,16,14,.9)'` and `color: '#e8e0cf'` ([src/App.tsx](src/App.tsx):532-534). Measured, it is **14.46:1 cream-on-ink in dark, light *and* night** — a dark slab on the cream map in light mode, and the brightest block on screen in red-night. Drive it from `background.paper` / `text.secondary`.
- **WARNING:** `<AppBar color="default">` resolves to MUI's grey `#212121`, not the theme's `#1c1917` (dark) or `#170404` (night). Measured on the search field's background in all three modes. The entire top bar is off-palette everywhere.
- **WARNING:** `PwaStatus` uses semantic MUI colors — `success`, `warning`, `error` ([src/ui/PwaStatus.tsx](src/ui/PwaStatus.tsx):131-166). In night mode the chip measures `rgb(102,187,106)` — a green control in an interface that is otherwise entirely one red hue. The night override in `theme.ts` only covers `MuiChip-colorDefault`.
- **WARNING:** Nothing styles the MapLibre control *buttons*. The rules that exist reach only their containers — safe-area padding in [src/app/globals.css](src/app/globals.css) and animated `bottom` offsets in [src/App.tsx](src/App.tsx):452-457. Zoom, compass, geolocate and the attribution bar all render MapLibre's default white in every theme — five bright rectangles in red-night.
- **WARNING:** Six chips sit in the desktop toolbar in four different colors (success green, primary ember, secondary teal, default grey). Accent is being used decoratively rather than to mark one thing as important.

### 4. Typography — 2/4

The scale is admirably short — four MUI variants total (`caption` ×13, `body2` ×11, `h6` ×5, `subtitle2` ×4). The problem is where the mass sits:

- **WARNING:** **24 of 33 text elements are 14px or smaller**, thirteen of them 12px `caption`. Distances, headings, GPS accuracy, the offline status, the disclaimer, event times — all 12px. This is an app read at arm's length, in sunlight, on a dusty screen.
- **WARNING:** The largest type in the product is `h6` at 20px. There is no display size, so nothing can carry a screen. A place name in the detail panel deserves 28–32px.
- **WARNING:** Map POI labels are 10–12px ([src/map/PoiLayers.tsx](src/map/PoiLayers.tsx), [src/map/ServiceLayers.tsx](src/map/ServiceLayers.tsx)). Labels already collide at 1440 — "ESD Station 9", "Ranger Station Tokyo", "900 Portal" and "9:00" overlap in the top-left of the desktop capture.
- **WARNING:** Two raw pixel escapes bypass the scale — `fontSize: 15` and `fontSize: 12` in [src/ui/NavBar.tsx](src/ui/NavBar.tsx):54,86.

### 5. Spacing — 2/4

The spacing scale itself is consistent — `0.25 / 0.5 / 0.75 / 1 / 1.5 / 2 / 3 / 4` on MUI's 8px grid, with only one stray (`0.4` in NavBar). Layout allocation is where it breaks:

- **BLOCKER:** The search field, measured: **79px at 320px, 134px at 375px, 173px at 414px.** The placeholder truncates to "Search …". It is `flex: '1 1 auto'` sharing a row with a brand mark, a status chip and four buttons that all refuse to shrink ([src/App.tsx](src/App.tsx)).
- **WARNING:** Search width is non-monotonic across breakpoints — **437px at 1024, 322px at 1280, 437px at 1440.** The filter chips appear at `lg` (1200px) and steal width back from search, so the field is *narrower* on a 1280 desktop than on a 1024 laptop.
- **BLOCKER:** **No interactive element in the app reaches 44×44.** Measured at every breakpoint: `IconButton size="small"` 30×30, `ToggleButton size="small"` 36×36, chips 24px tall, search input 28px, and MapLibre's zoom/compass/geolocate 29×29. Ten to sixteen sub-44 targets per viewport.
- **WARNING:** `focusPadding` reserves `window.innerHeight * 0.7` for the detail drawer ([src/App.tsx](src/App.tsx)), but the drawer measures roughly 31% of viewport height at 375×812. The selected marker lands in the top 18% of the screen with ~340px of dead map between it and the panel.
- **WARNING:** `EventsPanel` pins its compact sheet to `height: '70dvh'` ([src/ui/EventsPanel.tsx](src/ui/EventsPanel.tsx):108). In landscape (812×375) that is 262px, of which two stacked full-width toggle groups and a caption consume most before a single event appears.
- *Resolved during this audit:* safe-area insets are now published as `--safe-*` custom properties in `globals.css` and applied to every drawer anchor, the snackbar and MapLibre's four control containers. Bottom sheets no longer run under the home indicator.

### 6. Experience design — 2/4

State coverage is a real strength: distinct loading, error-with-retry, and empty states; an ErrorBoundary; undo on saved-spot deletion; a service-worker status chip that distinguishes caching, ready, offline, update-available and failed-install. Little of the polish is in the interaction model:

- **WARNING:** No first-run experience. A new user lands on a numbered-bubble map with no explanation of clock addresses, no prompt to save their camp, and no offline expectation set.
- **WARNING:** On a phone every action lives in a 30–36px control in the *top* bar — the far corner from a thumb. Filters, events, theme and status are all up there; the bottom half of the screen has no controls at all.
- **WARNING:** Desktop is the phone layout with a wider toolbar. No persistent side panel, no keyboard shortcuts, no use of the 1000px of horizontal space beyond more map.
- **WARNING:** 131 events in the "Today" window with no text search and no host/category filter — only a time window and a two-way sort.
- **WARNING:** Nothing addresses the actual use conditions the app is built for: no large-touch mode, no haptics on save, no way to raise brightness/size for a dusty screen.

---

## The plan — hobby app to professional

Five workstreams. Each is independently shippable and independently verifiable; they are ordered so the earliest work is the most visible.

### Stream 1 — The control layer (biggest visible win, lowest risk)

Nothing here changes behaviour. It changes how the app *feels* in the hand.

1. Introduce a touch-target contract in `theme.ts`: `MuiIconButton`, `MuiToggleButton` and `MuiChip` (clickable) get `minWidth: 48, minHeight: 48` on `compact`, with the visual glyph staying small. Use padding, not icon size.
2. Style `.maplibregl-ctrl button` to 44×44 and to the theme's paper/text colors, in a single themed global — this fixes both the tap targets and the night-mode white slabs at once.
3. Raise the search field to `size="medium"` on compact (28px → 40px input height).
4. Delete `size="small"` from the toolbar controls; let the touch contract carry them.

**Verify:** re-run the breakpoint probe; assert zero elements under 44×44 at 320/375/414/768.

### Stream 2 — Finish the themes

5. Drive the disclaimer from `background.paper` / `text.secondary` / `divider` instead of the three hard-coded values at [src/App.tsx](src/App.tsx):532-534.
6. Set the AppBar to the theme's paper explicitly rather than relying on `color="default"`.
7. Give `PwaStatus` a palette-aware status mapping so night mode expresses status through icon and weight, not green/amber/red.
8. Re-skin the embargo notice off `severity="info"` onto the dust palette, one line.

**Verify:** extend the existing contrast measurement into a test — assert the disclaimer's computed color differs across the three modes, and that no rendered element exceeds a night-mode luminance ceiling.

### Stream 3 — Re-lay the shell per breakpoint

9. **Compact (<900px):** move filters, events, saved spots and theme into a bottom navigation bar. The top bar keeps the brand mark, search and the offline chip only. Search then gets the full width it needs at 320px.
10. **Desktop (≥900px):** make the detail panel a persistent flex sibling of the map rather than an overlay `Drawer`, so it stops slicing the toolbar and the map re-frames into the remaining width. Give the panel a header, a divider and a real empty state.
11. Replace the hard-coded `0.7` in `focusPadding` with the drawer's measured height (a ref or a `ResizeObserver`), so the selected place centres in the visible map.
12. Change `EventsPanel`'s compact height from `70dvh` to `min(70dvh, 100dvh - 96px)` and collapse the two toggle groups into one row plus an overflow menu. (Safe-area padding for the sheets landed while this audit was running.)
13. Make the toolbar's filter chips appear at `md` rather than `lg` but participate in the flex shrink, so search width increases monotonically with viewport.

**Verify:** breakpoint probe asserts search width is non-decreasing across 320→1920, and that the AppBar is never overlapped.

### Stream 4 — Type and map legibility

14. Add a `display` variant (28–32px) and lift the body scale one step: `caption` 12→13, `body2` 14→15. Audit the 13 `caption` uses and promote anything a user reads while walking — distance, heading, time — to `body2` or above.
15. Raise map label sizes on compact viewports and set an explicit symbol paint order: landmarks > services > saved > selected > camps, so collisions drop the least important label rather than an arbitrary one.
16. Down-weight cluster counts relative to place labels.
17. Remove the two `fontSize` escapes in `NavBar.tsx`.

**Verify:** the existing a11y run, plus a label-collision count at 1440 and 375.

### Stream 5 — The experience layer

18. A three-card first run: how clock addresses work, save your camp, and what "Ready offline" means. Once, dismissible, persisted by year — the pattern the embargo notice just adopted.
19. Text search and a host filter in the events panel; replace the four-letter type codes with `event_type.label` and give "on now" real visual weight.
20. Explain disabled event rows instead of greying them out.
21. Move the detail panel's privacy sentence to first navigation only.
22. Desktop keyboard shortcuts: `/` focuses search, `Esc` clears, `E` toggles events, `F` filters.
23. Haptic feedback on save and on arrival, where supported.

**Verify:** conversational UAT on the five core flows — find a camp, navigate to it, save your tent, find it again, find something happening now.

---

## Suggested sequencing

| Order | Stream | Why here |
|---|---|---|
| 1 | Control layer | Largest perceived-quality gain per line changed; no behaviour risk. |
| 2 | Themes | Small, self-contained, and removes the most obviously unfinished detail. |
| 3 | Shell re-lay | The structural work. Do it once the token layer underneath is settled. |
| 4 | Type & map | Depends on the shell for available space. |
| 5 | Experience | Highest value, but only lands on a shell that is already right. |

Streams 1 and 2 together are the difference between "someone's side project" and "a product". They are also the smallest diff in the list.

---

## Files audited

`src/App.tsx`, `src/ui/theme.ts`, `src/ui/SearchPanel.tsx`, `src/ui/DetailDrawer.tsx`, `src/ui/EventsPanel.tsx`, `src/ui/FilterSheet.tsx`, `src/ui/NavBar.tsx`, `src/ui/PwaStatus.tsx`, `src/ui/SavePlaceDialog.tsx`, `src/ui/BrandMark.tsx`, `src/map/MapView.tsx`, `src/map/style.ts`, `src/app/globals.css`, `src/app/layout.tsx`, `src/brand.ts`.

**Excluded from findings:** the circular "N" badge visible bottom-left in every development capture is Next.js's `<nextjs-portal>` dev indicator, not a product element. It is absent from the static export.
