/**
 * Turn Burning Man's published survey geometry into the compact layout spec the
 * app generates the city from.
 *
 * Black Rock City is re-surveyed and rebuilt every year, so the only
 * authoritative description of it is the GIS data Burning Man publishes at
 * github.com/burningmantech/innovate-GIS-data. That data is polylines; the app
 * needs the polar spec behind them — the Man, the rotation, and each annular
 * street's radius — because a playa address is polar and the geocoder has to
 * work offline without any of these files.
 *
 * The two are checkable against each other, which is the point: fitting circles
 * to the annular street survey recovers a centre that agrees with the surveyed
 * "The Man" point to within centimetres. Neither number is taken on trust.
 */

const RAD = Math.PI / 180
const FEET_PER_METRE = 3.280839895

/**
 * The published files spell things differently between years: plazas carry
 * `Name` in 2025 and `name` in 2026, streets carry `type`/`width` in 2025 and
 * `kind`/`width_ft` in 2026. Read all the spellings rather than one year's.
 */
export function nameOf(properties) {
  return properties?.NAME ?? properties?.Name ?? properties?.name ?? undefined
}

/**
 * The repo has renamed these properties between years; accept either.
 *
 * `source: "radial"` is the schema Burning Man uses to mark a feature as
 * radial independent of its `kind` — the 2026 survey splits radial geometry
 * into `kind: "avenue"` (40 ft) and `kind: "path"` (20 ft), and a future year
 * could add another kind spelling again. Checking `source` first means a new
 * kind value is still recognized as radial rather than silently dropped; the
 * explicit kind list is kept alongside it for years whose features carry no
 * `source` property at all.
 */
export function streetShape(feature) {
  const p = feature.properties
  const kind = p.kind ?? p.type
  return {
    isRing: kind === 'annular' || kind === 'arc',
    isRadial: p.source === 'radial' || kind === 'avenue' || kind === 'radial' || kind === 'path',
    name: p.name,
    width: Number(p.width_ft ?? p.width) || undefined,
  }
}

/**
 * A local tangent plane in feet. Over a city three kilometres across this is
 * exact to well under the survey's own precision, and it keeps the circle fit
 * to plain linear algebra.
 */
export function tangentPlane(origin) {
  const [lon0, lat0] = origin
  const mPerLat = 111132.92 - 559.82 * Math.cos(2 * lat0 * RAD) + 1.175 * Math.cos(4 * lat0 * RAD)
  const mPerLon = 111412.84 * Math.cos(lat0 * RAD) - 93.5 * Math.cos(3 * lat0 * RAD)
  return {
    toXY: ([lon, lat]) => [
      (lon - lon0) * mPerLon * FEET_PER_METRE,
      (lat - lat0) * mPerLat * FEET_PER_METRE,
    ],
    toLonLat: ([x, y]) => [
      lon0 + x / FEET_PER_METRE / mPerLon,
      lat0 + y / FEET_PER_METRE / mPerLat,
    ],
  }
}

/** Algebraic (Kåsa) circle fit — exact for the concentric arcs of a survey. */
export function fitCircle(points) {
  let Sx = 0, Sy = 0, Sxx = 0, Syy = 0, Sxy = 0, Sxxx = 0, Syyy = 0, Sxyy = 0, Sxxy = 0
  const n = points.length
  for (const [x, y] of points) {
    Sx += x; Sy += y; Sxx += x * x; Syy += y * y; Sxy += x * y
    Sxxx += x * x * x; Syyy += y * y * y; Sxyy += x * y * y; Sxxy += x * x * y
  }
  const C = n * Sxx - Sx * Sx
  const D = n * Sxy - Sx * Sy
  const E = n * Sxxx + n * Sxyy - (Sxx + Syy) * Sx
  const G = n * Syy - Sy * Sy
  const H = n * Sxxy + n * Syyy - (Sxx + Syy) * Sy
  const denominator = 2 * (C * G - D * D)
  const cx = (E * G - D * H) / denominator
  const cy = (C * H - D * E) / denominator
  let radius = 0
  for (const [x, y] of points) radius += Math.hypot(x - cx, y - cy)
  radius /= n
  let rms = 0
  for (const [x, y] of points) rms += (Math.hypot(x - cx, y - cy) - radius) ** 2
  return { cx, cy, radius, rms: Math.sqrt(rms / n) }
}

/** Compass bearing, degrees clockwise from north, of a point about the centre. */
export const bearingOf = ([x, y]) => (Math.atan2(x, y) / RAD + 360) % 360

/** Clock minutes past 12:00 for a compass bearing, given the city's rotation. */
export const minutesOf = (compass, rotation) => (((compass - rotation) % 360 + 360) % 360) / 360 * 720

export function formatClock(minutes) {
  const wrapped = ((Math.round(minutes) % 720) + 720) % 720
  const hour = Math.floor(wrapped / 60) || 12
  return `${hour}:${String(wrapped % 60).padStart(2, '0')}`
}

export function parseClock(text) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(text).trim())
  if (!match) return null
  return (Number(match[1]) % 12) * 60 + Number(match[2])
}

/**
 * Collapse a ring's surveyed vertices into the arc spans it actually occupies.
 * A gap wider than `gapMinutes` is a real break in the street — center camp,
 * a plaza, the open playa — rather than a join between two survey segments.
 */
export function arcSegments(minutes, gapMinutes = 4) {
  const sorted = [...minutes].sort((a, b) => a - b)
  const spans = []
  let start = sorted[0]
  let previous = sorted[0]
  for (const value of sorted.slice(1)) {
    if (value - previous > gapMinutes) {
      spans.push([start, previous])
      start = value
    }
    previous = value
  }
  spans.push([start, previous])
  return spans
}

/**
 * Fit a ring, then drop whatever is not on it and fit again.
 *
 * A street name in the survey does not always cover one clean arc: 2025 files
 * eighteen segments under "Esplanade", some of which curve around Center Camp
 * rather than the Man. A plain least-squares fit lets those drag the radius and
 * the centre with them. A ring is a circle, so anything sitting far off the
 * fitted radius is by definition not part of it.
 */
export function fitRing(points, tolerance = 25) {
  let kept = points
  let fit = fitCircle(kept)
  for (let pass = 0; pass < 5; pass += 1) {
    const next = kept.filter(([x, y]) => Math.abs(Math.hypot(x - fit.cx, y - fit.cy) - fit.radius) <= tolerance)
    if (next.length === kept.length || next.length < 12) break
    kept = next
    fit = fitCircle(kept)
  }
  return { ...fit, kept: kept.length, dropped: points.length - kept.length }
}
