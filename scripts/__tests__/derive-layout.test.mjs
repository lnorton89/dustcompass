/**
 * `derive-layout.mjs` does real GIS fetches at its top level, so it can only
 * be driven end-to-end here against a local stub server (via the
 * `DERIVE_LAYOUT_GIS_BASE` override, which is unset in every real run) —
 * never the network. Importing the module directly, as the unit tests below
 * do, must equally never reach the network or touch disk: `isDirectRun`
 * guards that.
 */
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { tangentPlane } from '../lib/brc-survey.mjs'
import {
  assertFiniteNumbers,
  checkAnnularResidual,
  checkCentreFit,
  checkRotationSpread,
} from '../derive-layout.mjs'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const scriptPath = join(repoRoot, 'scripts', 'derive-layout.mjs')
const execFileAsync = promisify(execFile)

describe('checkCentreFit', () => {
  it('accepts a well-agreed centre', () => {
    expect(() => checkCentreFit(10, 0.4)).not.toThrow()
  })

  it('rejects too few anchor rings', () => {
    expect(() => checkCentreFit(2, 0.1)).toThrow(/refusing to publish a layout/)
  })

  it('rejects a centre too far from the surveyed Man', () => {
    expect(() => checkCentreFit(10, 5.1)).toThrow(/refusing to publish a layout/)
  })

  // The bug this guard exists for: an empty fit makes offset NaN, and
  // `NaN > 5` is false, so a naive comparison-only guard would pass it.
  it('rejects a NaN offset rather than letting the comparison pass it', () => {
    expect(() => checkCentreFit(10, NaN)).toThrow(/refusing to publish a layout/)
  })
})

describe('checkRotationSpread', () => {
  it('accepts a tight rotation spread', () => {
    expect(() => checkRotationSpread(12, 0.3)).not.toThrow()
  })

  it('rejects too few radials', () => {
    expect(() => checkRotationSpread(1, 0)).toThrow(/refusing to publish a bearing/)
  })

  it('rejects a wide rotation spread', () => {
    expect(() => checkRotationSpread(12, 1.5)).toThrow(/refusing to publish a bearing/)
  })

  // With no radials parsed, spread used to be -Infinity, which is < 1 and so
  // passed a comparison-only guard, leaving bearing itself as NaN.
  it('rejects a non-finite spread rather than letting the comparison pass it', () => {
    expect(() => checkRotationSpread(0, -Infinity)).toThrow(/refusing to publish a bearing/)
  })
})

describe('checkAnnularResidual', () => {
  const streetsWithRms = (...rms) => rms.map((r, i) => ({ ref: String(i), rms: r }))

  it('accepts streets that all fit within the residual threshold', () => {
    expect(checkAnnularResidual(streetsWithRms(1.2, 4.97, 0.5))).toBe(4.97)
  })

  it('rejects when the worst residual exceeds the threshold', () => {
    expect(() => checkAnnularResidual(streetsWithRms(1.2, 10.01, 0.5))).toThrow(
      /not the circle it is being published as/,
    )
  })

  it('accepts exactly at the threshold', () => {
    expect(checkAnnularResidual(streetsWithRms(1, 10))).toBe(10)
  })

  it('rejects a non-finite residual', () => {
    expect(() => checkAnnularResidual(streetsWithRms(1, NaN))).toThrow(
      /not the circle it is being published as/,
    )
  })
})

describe('assertFiniteNumbers', () => {
  it('accepts a layout with only finite numbers', () => {
    const layout = { fence_distance: 2500, bearing: 45.5, cStreets: [{ distance: 200, segments: [[1, 2]] }] }
    expect(() => assertFiniteNumbers(layout)).not.toThrow()
  })

  it('names the exact field when a top-level value is not finite', () => {
    expect(() => assertFiniteNumbers({ fence_distance: NaN })).toThrow(/layout\.fence_distance is NaN/)
  })

  it('names the exact field for a value nested in arrays and objects', () => {
    const layout = { cStreets: [{ distance: 200 }, { distance: Infinity }] }
    expect(() => assertFiniteNumbers(layout)).toThrow(/layout\.cStreets\[1\]\.distance is Infinity/)
  })

  it('ignores non-numeric values', () => {
    expect(() => assertFiniteNumbers({ name: 'Esplanade', segments: [['2:00', '3:00']] })).not.toThrow()
  })
})

// --- End-to-end: the real script against a synthetic survey --------------
//
// Built from the actual geometry (`tangentPlane`, real circle fitting inside
// derive-layout.mjs itself) rather than mocked numbers, so this exercises
// the real write-ordering, not a description of it. The Man sits at the
// origin of an arbitrary tangent plane; rings and radials are placed by
// converting target feet-offsets back through `toLonLat`, the exact inverse
// of what the script itself does on the way in.

const MAN = [-119.2032, 40.7864]
const { toLonLat } = tangentPlane(MAN)

/** n points around a circle of `radius` ft, each nudged by `jitterFt` (alternating sign). */
function ringCoordinates(radius, jitterFt, n = 60) {
  const points = []
  for (let i = 0; i < n; i += 1) {
    const angle = (i / n) * 2 * Math.PI
    const r = radius + (i % 2 === 0 ? jitterFt : -jitterFt)
    points.push(toLonLat([r * Math.sin(angle), r * Math.cos(angle)]))
  }
  return points
}

/** A radial spoke from `nearFt` to `farFt` at the compass bearing implied by `clock`, rotation 0. */
function radialCoordinates(clock, nearFt, farFt) {
  const minutes = (Number(clock.split(':')[0]) % 12) * 60 + Number(clock.split(':')[1])
  const bearing = (minutes / 720) * 2 * Math.PI
  const at = (r) => toLonLat([r * Math.sin(bearing), r * Math.cos(bearing)])
  return [at(nearFt), at(farFt)]
}

const ring = (name, radius, jitterFt) => ({
  type: 'Feature',
  properties: { kind: 'annular', name },
  geometry: { type: 'LineString', coordinates: ringCoordinates(radius, jitterFt) },
})

const radial = (clock) => ({
  type: 'Feature',
  properties: { kind: 'radial', name: clock },
  geometry: { type: 'LineString', coordinates: radialCoordinates(clock, 20, 2500) },
})

/** Builds the fixed set of GeoJSON layers a passing derivation needs, with one ring's jitter controllable. */
function surveyLayers({ worstRingJitter }) {
  const streetLines = {
    type: 'FeatureCollection',
    features: [
      ring('A', 200, 0.1),
      ring('B', 400, 0.1),
      ring('C', 600, worstRingJitter),
      radial('12:00'),
      radial('3:00'),
      radial('6:00'),
      radial('9:00'),
    ],
  }
  const cpns = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: { name: 'The Man' }, geometry: { type: 'Point', coordinates: MAN } }],
  }
  const fenceCorners = [0, 1, 2, 3, 4].map((i) => {
    const angle = (i / 5) * 2 * Math.PI
    return toLonLat([3000 * Math.sin(angle), 3000 * Math.cos(angle)])
  })
  const trashFence = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [fenceCorners] } }],
  }
  const empty = { type: 'FeatureCollection', features: [] }
  return { street_lines: streetLines, cpns, trash_fence: trashFence, plazas: empty, dmz: empty, gate_road: empty }
}

/** Serves `surveyLayers(...)` at GET /<name>.geojson, the exact shape `layer()` in the script expects. */
function startStubGis(layers) {
  const server = createServer((req, res) => {
    const name = req.url.replace(/^\//, '').replace(/\.geojson$/, '')
    const body = layers[name]
    if (!body) {
      res.writeHead(404)
      res.end()
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  })
  return new Promise((resolvePromise) => {
    server.listen(0, '127.0.0.1', () => resolvePromise(server))
  })
}

describe('derive-layout.mjs, end to end against a synthetic survey', () => {
  let server
  let dir

  afterEach(async () => {
    if (server) await new Promise((r) => server.close(r))
    if (dir) rmSync(dir, { recursive: true, force: true })
    server = undefined
    dir = undefined
  })

  function run(worstRingJitter) {
    dir = mkdtempSync(join(tmpdir(), 'dustcompass-derive-'))
    const outPath = join(dir, 'layout.json')
    return startStubGis(surveyLayers({ worstRingJitter })).then((s) => {
      server = s
      const base = `http://127.0.0.1:${s.address().port}`
      // Async, not execFileSync: the stub server above runs in this very
      // process/event loop, so a *synchronous* child-process call would
      // block it from ever answering the child's requests — a deadlock,
      // not a test.
      const runScript = () =>
        execFileAsync(process.execPath, [scriptPath, '2099', outPath], {
          env: { ...process.env, DERIVE_LAYOUT_GIS_BASE: base },
        })
      return { outPath, runScript }
    })
  }

  it('writes a valid layout when every street fits within tolerance', async () => {
    const { outPath, runScript } = await run(0.1)
    await expect(runScript()).resolves.toBeDefined()
    const layout = JSON.parse(readFileSync(outPath, 'utf8'))
    expect(layout.cStreets).toHaveLength(3)
    expect(Number.isFinite(layout.fence_distance)).toBe(true)
    expect(Number.isFinite(layout.bearing)).toBe(true)
  })

  /**
   * The bug behind #41: derive-layout used to write the candidate layout to
   * OUT and only *then* run the final annular-residual check, so a rejected
   * derivation still overwrote a known-good layout before the command
   * failed. Ring "C" here is jittered ±15 ft (well past the 10 ft
   * threshold) while staying centred, so every earlier check (centre fit,
   * rotation spread) passes and only the final residual check catches it.
   */
  it('leaves an existing output file untouched when the final residual check fails', async () => {
    const { outPath, runScript } = await run(15)
    const original = '{"placeholder":"known-good layout from a previous run"}\n'
    writeFileSync(outPath, original)

    await expect(runScript()).rejects.toThrow()

    expect(readFileSync(outPath, 'utf8')).toBe(original)
  })

  it('never leaves a stray .tmp file behind after a failed run', async () => {
    const { outPath, runScript } = await run(15)
    await expect(runScript()).rejects.toThrow()
    expect(() => readFileSync(`${outPath}.tmp`, 'utf8')).toThrow(/ENOENT/)
  })
})
