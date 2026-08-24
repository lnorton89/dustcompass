#!/usr/bin/env node
/**
 * Build a year's city layout from Burning Man's published survey.
 *
 *   node scripts/derive-layout.mjs 2026 [outfile]
 *
 * Black Rock City is re-surveyed and rebuilt annually, so the only
 * authoritative description of it is the GIS data Burning Man publishes. That
 * data is polylines, and the app needs the polar spec behind them, because a
 * playa address is polar and the geocoder has to answer offline with none of
 * these files present. This recovers that spec and checks it against the
 * survey's own control points rather than asserting it.
 */
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  arcSegments,
  bearingOf,
  fitCircle,
  fitRing,
  formatClock,
  minutesOf,
  nameOf,
  parseClock,
  streetShape,
  tangentPlane,
} from './lib/brc-survey.mjs'

const YEAR = process.argv[2] ?? String(new Date().getFullYear())
const OUT = resolve(process.argv[3] ?? `public/data/${YEAR}/layout.json`)
// Overridable only so the write-ordering test can point this at a local stub
// server and drive the real script end-to-end without reaching the network.
// Unset in every real run, so production always reads the published survey.
const GIS =
  process.env.DERIVE_LAYOUT_GIS_BASE ??
  `https://raw.githubusercontent.com/burningmantech/innovate-GIS-data/master/${YEAR}/GeoJSON`
const FEET_PER_METRE = 3.280839895

/** Layers the derivation needs, and whether the city can be described without one. */
const LAYERS = {
  street_lines: true,
  cpns: true,
  trash_fence: true,
  plazas: false,
  dmz: false,
  gate_road: false,
}

// --- Pure validation, extracted so it can be unit-tested against synthetic
// survey data without this file's real GIS fetches (see `main` below) and
// without ever writing anything to disk. Every one of these must pass before
// `writeLayout` is called: a candidate layout is only ever written to OUT
// once nothing here has thrown. ------------------------------------------

/**
 * The annular streets are concentric about the Man, so fitting circles to
 * them recovers the same point the survey marks directly. Agreement between
 * the two is what says this derivation is reading the data correctly.
 *
 * `NaN > 5` is false, so an empty fit used to walk straight past this guard
 * and write "12:NaN" into the layout. A refusal has to be the default, not
 * the consequence of a comparison that happens to be true.
 */
export function checkCentreFit(anchorCount, offsetMetres) {
  if (anchorCount < 3 || !Number.isFinite(offsetMetres) || offsetMetres > 5) {
    throw new Error(
      `Fitted ${anchorCount} rings, centre ${offsetMetres.toFixed(1)} m from the surveyed Man. ` +
        'One of the two is being read wrong; refusing to publish a layout on that basis.',
    )
  }
}

/**
 * Every radial is a clock position, so each one implies the same city
 * rotation.
 *
 * Same trap as the centre fit: with no radials parsed, `spread` used to come
 * out as -Infinity and pass, leaving `bearing` as NaN. That serialises to
 * null, which the app reads as zero — the whole city drawn 45 degrees out,
 * plausibly, with confident pins. A single parseable radial also gives a
 * spread of 0, which proves nothing.
 */
export function checkRotationSpread(radialCount, spreadDegrees) {
  if (radialCount < 3 || !Number.isFinite(spreadDegrees) || spreadDegrees > 1) {
    throw new Error(
      `${radialCount} radials gave a rotation spread of ${spreadDegrees.toFixed(2)} degrees; ` +
        'refusing to publish a bearing on that basis.',
    )
  }
}

/**
 * The centre check averages across rings, so opposing errors cancel and one
 * badly fitted street stays invisible there — and the 2026 survey only
 * publishes plazas on B and G, so the independent check in survey.test.ts
 * cannot see the other ten streets at all. A ring that is not a circle is
 * not a street, and this is the only check that can tell.
 *
 * 10 ft, not 5: the noisiest real year measures 4.97 ft — 2025 files eighteen
 * segments under "Esplanade", some curving around Center Camp — and a
 * threshold with a 0.6% margin would fail on ordinary survey noise.
 * Untrimmed, that same ring fitted at 69.9 ft, so an order of magnitude of
 * headroom still catches a street that is not a circle.
 *
 * Returns the worst residual so the caller can log it; throws rather than
 * returning a verdict, because this has to be impossible to accidentally
 * ignore the way "measured and only printed" was.
 */
export function checkAnnularResidual(cStreets) {
  const worst = Math.max(...cStreets.map((s) => s.rms))
  if (!Number.isFinite(worst) || worst > 10) {
    throw new Error(
      `Worst annular fit residual is ${worst.toFixed(2)} ft. One of these streets is ` +
        'not the circle it is being published as; refusing to write the layout.',
    )
  }
  return worst
}

/**
 * The centre and rotation checks above operate on rings; this is the same
 * defence for radials. `tStreets` is built by filtering the same `streets`
 * array this compares against, so under correct code the two sets always
 * agree — the value of asserting it anyway is catching the next edit that
 * decouples them, the way #48's dropped `kind: "path"` radials did before
 * `streetShape()` recognized them at all.
 */
export function checkRadialCoverage(surveyedNames, generatedNames) {
  const generated = new Set(generatedNames)
  const missing = surveyedNames.filter((name) => !generated.has(name))
  if (missing.length > 0) {
    throw new Error(
      `${missing.length} surveyed radial(s) missing from the derived layout: ${missing.join(', ')}. ` +
        'Refusing to publish a layout that silently drops surveyed radial geometry.',
    )
  }
}

/**
 * `JSON.stringify(NaN)` silently becomes `null`, which must never stand in
 * for validation: a NaN or Infinity anywhere in the derived geometry (a
 * fence radius with no corners, a plaza whose ring didn't fit, ...) has to
 * fail the command loudly, not degrade into a `null` the app then reads as
 * zero. Walks the whole candidate layout and names the exact field.
 */
export function assertFiniteNumbers(value, path = 'layout') {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`${path} is ${value}; refusing to write a non-finite value into the layout.`)
    }
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertFiniteNumbers(item, `${path}[${i}]`))
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) assertFiniteNumbers(item, `${path}.${key}`)
  }
}

/**
 * Writes the fully-validated layout atomically: a temp file in the same
 * directory as OUT, then an fs.rename into place. A crash or interruption
 * mid-write leaves either the old file or the temp file, never a truncated
 * or half-written OUT.
 */
async function writeLayout(layout) {
  await mkdir(dirname(OUT), { recursive: true })
  const tmp = `${OUT}.tmp`
  await writeFile(tmp, JSON.stringify(layout, null, 2) + '\n')
  await rename(tmp, OUT)
}

async function layer(name, required) {
  const response = await fetch(`${GIS}/${name}.geojson`)
  if (!response.ok) {
    if (required) throw new Error(`${YEAR} has no published ${name}.geojson (${response.status}).`)
    console.log(`  - ${name}.geojson not published for ${YEAR}; that part is omitted`)
    return { features: [] }
  }
  return response.json()
}

async function main() {
  console.log(`Reading Burning Man's published ${YEAR} survey...`)
  const data = {}
  for (const [name, required] of Object.entries(LAYERS)) data[name] = await layer(name, required)

  const man = data.cpns.features.find((f) => nameOf(f.properties) === 'The Man')
  if (!man) throw new Error(`${YEAR} cpns.geojson does not include a surveyed "The Man" point.`)

  const { toXY } = tangentPlane(man.geometry.coordinates)

  // --- The centre, established twice ---------------------------------------
  const streets = data.street_lines.features
  const rings = new Map()
  for (const feature of streets) {
    const shape = streetShape(feature)
    if (!shape.isRing || !shape.name) continue
    const entry = rings.get(shape.name) ?? { points: [], width: shape.width }
    entry.points.push(...feature.geometry.coordinates.map(toXY))
    entry.width ??= shape.width
    rings.set(shape.name, entry)
  }
  if (rings.size === 0) throw new Error(`${YEAR} street_lines.geojson has no annular streets.`)

  const fits = [...rings].map(([name, entry]) => ({ name, ...entry, ...fitRing(entry.points) }))
  const anchors = fits.filter((f) => f.points.length > 40)
  const cx = anchors.reduce((a, f) => a + f.cx, 0) / anchors.length
  const cy = anchors.reduce((a, f) => a + f.cy, 0) / anchors.length
  const offset = Math.hypot(cx, cy) / FEET_PER_METRE
  console.log(`  centre from ${anchors.length} fitted rings sits ${offset.toFixed(2)} m from the surveyed Man`)
  checkCentreFit(anchors.length, offset)

  // --- The rotation ---------------------------------------------------------
  const implied = new Map()
  for (const feature of streets) {
    const shape = streetShape(feature)
    if (!shape.isRadial) continue
    const minutes = parseClock(shape.name)
    if (minutes === null || implied.has(shape.name)) continue
    const points = feature.geometry.coordinates.map(toXY)
    const far = points.reduce((a, p) => (Math.hypot(...p) > Math.hypot(...a) ? p : a), points[0])
    const near = points.reduce((a, p) => (Math.hypot(...p) < Math.hypot(...a) ? p : a), points[0])
    const compass = bearingOf([far[0] - near[0], far[1] - near[1]])
    implied.set(shape.name, ((compass - (minutes / 720) * 360) % 360 + 360) % 360)
  }
  const rotations = [...implied.values()]
  const meanRotation = rotations.reduce((a, b) => a + b, 0) / rotations.length
  const spread = Math.max(...rotations) - Math.min(...rotations)
  const bearing = Math.round(meanRotation * 100) / 100
  console.log(`  rotation ${bearing} degrees from ${rotations.length} radials (spread ${spread.toFixed(3)})`)
  checkRotationSpread(rotations.length, spread)

  // --- Annular streets ------------------------------------------------------
  const refOf = (name) => (/^esp/i.test(name.trim()) ? 'esplanade' : name.trim()[0].toLowerCase())

  // 2026 files the Esplanade as "ESP"; it is read aloud and signed as Esplanade.
  const displayName = (name) => {
    const trimmed = name.trim()
    if (/^esp/i.test(trimmed)) return 'Esplanade'
    return trimmed.length === 1 ? trimmed.toUpperCase() : trimmed
  }

  const cStreets = fits
    .sort((a, b) => a.radius - b.radius)
    .map((fit) => {
      // Only the vertices that survived the fit describe where the street runs.
      const onRing = fit.points.filter(
        ([x, y]) => Math.abs(Math.hypot(x - cx, y - cy) - fit.radius) <= 25,
      )
      const minutes = onRing.map((p) => minutesOf(bearingOf([p[0] - cx, p[1] - cy]), bearing))
      return {
        ref: refOf(fit.name),
        name: displayName(fit.name),
        distance: Math.round(fit.radius * 10) / 10,
        ...(fit.width ? { width: fit.width } : {}),
        segments: arcSegments(minutes).map(([a, b]) => [formatClock(a), formatClock(b)]),
        rms: Math.round(fit.rms * 100) / 100,
      }
    })

  // Every survey-derived invariant is checked before anything is written.
  // The residual check specifically catches a failure class the centre and
  // rotation checks above cannot: a badly-fitted individual street that
  // still averages out fine across the whole set.
  const worst = checkAnnularResidual(cStreets)

  /** Snap a measured radius onto an annular street where it plainly is one. */
  const snap = (feet) => {
    const near = cStreets.find((s) => Math.abs(s.distance - feet) < 20)
    return near ? near.ref : Math.round(feet)
  }

  // --- Radial streets -------------------------------------------------------
  // Width is carried per clock position, the same way cStreets carries it per
  // ring: the 2026 survey's 20 ft "path" radials are real geometry, not the
  // 40 ft "avenue" width buildCity() would otherwise stamp on every radial.
  const radialExtents = new Map()
  for (const feature of streets) {
    const shape = streetShape(feature)
    if (!shape.isRadial || parseClock(shape.name) === null) continue
    const radii = feature.geometry.coordinates.map(toXY).map(([x, y]) => Math.hypot(x - cx, y - cy))
    const entry = radialExtents.get(shape.name) ?? { spans: [], width: shape.width }
    entry.spans.push([Math.min(...radii), Math.max(...radii)])
    entry.width ??= shape.width
    radialExtents.set(shape.name, entry)
  }
  const tStreets = [...radialExtents]
    .sort((a, b) => parseClock(a[0]) - parseClock(b[0]))
    .map(([name, entry]) => ({
      refs: [name],
      ...(entry.width ? { width: entry.width } : {}),
      segments: entry.spans.sort((a, b) => a[0] - b[0]).map(([from, to]) => [snap(from), snap(to)]),
    }))

  // Same defence as checkAnnularResidual, for the other axis: a surveyed
  // radial that the classification above fails to recognize would otherwise
  // vanish from the layout with nothing to say so. See #48 — a "path" kind
  // radial did exactly this until streetShape() learned to check `source`.
  checkRadialCoverage(
    [...new Set(streets.filter((f) => { const s = streetShape(f); return s.isRadial && parseClock(s.name) !== null }).map((f) => streetShape(f).name))],
    tStreets.flatMap((t) => t.refs),
  )

  // --- Everything else the spec carries -------------------------------------
  const widths = streets.map((f) => streetShape(f).width).filter(Boolean)
  const road_width =
    widths.sort((a, b) => widths.filter((w) => w === a).length - widths.filter((w) => w === b).length).pop() ?? 30

  // The fence is a pentagon, and the published polygon carries each edge's
  // midpoint as well as its corners. The app rebuilds it from the circumradius,
  // so average the corners rather than taking whichever one measures largest.
  const fenceRadii = (data.trash_fence.features[0]?.geometry.coordinates.flat() ?? [])
    .map(toXY)
    .map(([x, y]) => Math.hypot(x - cx, y - cy))
  const fenceCorners = fenceRadii.filter((r) => r > Math.max(...fenceRadii) * 0.9)
  const fence_distance = Math.round(fenceCorners.reduce((a, b) => a + b, 0) / fenceCorners.length)

  const isCenterCamp = (name) => /center camp/i.test(name ?? '')
  const plazaName = (feature) => nameOf(feature.properties) ?? ''

  const plazas = data.plazas.features
    .filter((f) => !isCenterCamp(plazaName(f)))
    .map((feature) => {
      const ring = feature.geometry.coordinates[0].map(toXY)
      const { cx: px, cy: py, radius } = fitCircle(ring)
      // A plaza at the end of a street is a part-circle, so its fitted centroid
      // drifts a few minutes off the clock position its own name states.
      const named = parseClock(plazaName(feature).split('&')[0])
      return {
        name: plazaName(feature),
        time: formatClock(named ?? minutesOf(bearingOf([px - cx, py - cy]), bearing)),
        distance: snap(Math.hypot(px - cx, py - cy)),
        diameter: Math.round(radius * 2),
      }
    })
    .sort((a, b) => parseClock(a.time) - parseClock(b.time))

  const portals = data.cpns.features
    .filter((f) => /portal$/i.test(nameOf(f.properties) ?? ''))
    .map((feature) => {
      const [x, y] = toXY(feature.geometry.coordinates)
      const name = nameOf(feature.properties)
      return {
        name,
        ref: name.replace(/\s+/g, '-').toLowerCase(),
        time: formatClock(minutesOf(bearingOf([x - cx, y - cy]), bearing)),
        distance: snap(Math.hypot(x - cx, y - cy)),
        angle: 0,
      }
    })
    .sort((a, b) => parseClock(a.time) - parseClock(b.time))

  const centerCampPlaza = data.plazas.features.find((f) => isCenterCamp(plazaName(f)))
  let center_camp
  if (centerCampPlaza) {
    const ring = centerCampPlaza.geometry.coordinates[0].map(toXY)
    const { cx: px, cy: py, radius } = fitCircle(ring)
    // The survey draws one circle here — the plaza — plus Rods Road well outside
    // it. There is no surveyed cafe ring, so none is invented: the app simply
    // does not draw a circle the published geometry does not contain.
    center_camp = {
      distance: Math.round(Math.hypot(px - cx, py - cy)),
      cafe_plaza_radius: Math.round(radius),
    }
  }

  let dmz
  if (data.dmz.features.length > 0) {
    const ring = data.dmz.features[0].geometry.coordinates[0].map(toXY)
    const radii = ring.map(([x, y]) => Math.hypot(x - cx, y - cy))
    const minutes = ring.map(([x, y]) => minutesOf(bearingOf([x - cx, y - cy]), bearing))
    dmz = {
      distance: Math.round(Math.min(...radii)),
      depth: Math.round(Math.max(...radii) - Math.min(...radii)),
      segments: arcSegments(minutes, 10).map(([a, b]) => [formatClock(a), formatClock(b)]),
    }
  }

  let entrance_road
  if (data.gate_road.features.length > 0) {
    const radii = data.gate_road.features
      .flatMap((f) => f.geometry.coordinates.map(toXY))
      .map(([x, y]) => Math.hypot(x - cx, y - cy))
    entrance_road = { distance: Math.round(Math.min(...radii)), angle: 108 }
  }

  const layout = {
    center: {
      type: 'Feature',
      properties: { ref: 'golden_spike', name: 'The Man' },
      geometry: { type: 'Point', coordinates: man.geometry.coordinates },
    },
    fence_distance,
    bearing,
    road_width,
    ...(entrance_road ? { entrance_road } : {}),
    ...(dmz ? { dmz } : {}),
    ...(center_camp ? { center_camp } : {}),
    cStreets: cStreets.map((street) => ({ ...street, rms: undefined })).map((street) => JSON.parse(JSON.stringify(street))),
    tStreets,
    plazas,
    portals,
  }

  // Last gate before anything touches disk: every derived numeric value in
  // the candidate layout has to be finite, or JSON.stringify would silently
  // turn it into `null` and the app would read that as a confident zero.
  assertFiniteNumbers(layout)

  // Only now, with every invariant above having passed, does OUT change —
  // and even then only via an atomic rename, never a direct write.
  await writeLayout(layout)

  console.log(`\n  ${cStreets.length} annular streets, worst circle-fit residual ${worst.toFixed(2)} ft`)
  console.log(`  ${tStreets.length} radials, ${plazas.length} plazas, ${portals.length} portals`)
  console.log(`  fence ${fence_distance} ft, roads ${road_width} ft`)
  console.log(`\nWrote ${OUT}`)
}

// Only run the real derivation (network fetches, disk write) when this file
// is executed directly, e.g. `node scripts/derive-layout.mjs`. Importing it
// — as the test file for the validation functions above does — must never
// reach the network or touch disk.
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  await main()
}
