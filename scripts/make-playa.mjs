/**
 * Rasterise an illustrated playa desert into the three theme backgrounds the
 * map shows behind the city (public/playa/{dark,light,night}.png).
 *
 * The base style is a flat colour; this is the scenery on top of it. It is
 * drawn from the same palette the city layers use, top-down like a map: a
 * dried lake bed graded around the Man, polygonal mud cracks over the open
 * playa, faint access roads, and stylised mountain ranges ringing the basin
 * (the playa opens to the south, toward Gerlach, so that edge stays clear).
 *
 * Everything is generated from a seeded RNG so a rebuild is byte-identical,
 * and rasterised with the same Chromium the icons use.
 *
 *   node scripts/make-playa.mjs [size] [theme]
 *
 * `size` defaults to 4096 and must match what src/map/PlayaScene.tsx expects;
 * pass a smaller size to iterate on the layout quickly, and a theme name to
 * render just that one.
 */
import { mkdirSync, statSync } from 'node:fs'
import { chromium } from 'playwright'

const SIZE = Number(process.argv[2] || 4096)
const ONLY = process.argv[3]
const CENTER = SIZE / 2
// Render half-extent in metres. Must match HALF_EXTENT_METERS in
// src/map/PlayaScene.tsx, which georeferences this image to the playa.
const HALF_EXTENT_METERS = 8000
const PX_PER_M = SIZE / (2 * HALF_EXTENT_METERS)
const px = (metres) => metres * PX_PER_M
// The city's surveyed extent — the fence sits about 2.5 km from the Man, which
// is px(2500) at full size. Everything inside it is tamped flat.
const CITY_RADIUS_PX = px(2500)
const CRACK_RING = { inner: px(2800), outer: px(6500) }
// Mountains begin at the far edge of the crack field (6.5 km) and fade in over
// the next ~900 m of open playa.
const MOUNTAIN_START_PX = px(6500)
const MOUNTAIN_FADE_PX = px(900)

const THEMES = {
  dark: {
    playa: '#12100e',
    playaLight: '#191510',
    playaDark: '#0d0b09',
    crack: '#241d13',
    crackFill: '#16120d',
    road: '#1d1812',
    mountainA: '#0a0807',
    mountainB: '#191410',
    ridge: '#33291c',
  },
  light: {
    playa: '#e8e0cf',
    playaLight: '#f1eadb',
    playaDark: '#d7ccb3',
    crack: '#b3a27f',
    crackFill: '#ddd2ba',
    road: '#c0b193',
    mountainA: '#b1a084',
    mountainB: '#cfc1a4',
    ridge: '#8f7d5f',
  },
  night: {
    playa: '#0a0000',
    playaLight: '#160303',
    playaDark: '#070000',
    crack: '#300b0b',
    crackFill: '#150303',
    road: '#1f0606',
    mountainA: '#170303',
    mountainB: '#260808',
    ridge: '#4c1616',
  },
}

const svg = (theme) => {
  const t = THEMES[theme]
  const rng = mulberry32(seedFor(theme))
  const r = (lo, hi) => lo + rng() * (hi - lo)

  const parts = []
  parts.push(`<rect width="${SIZE}" height="${SIZE}" fill="${t.playa}"/>`)

  // Dried lake-bed grading. A soft lift around the Man suggests the graded
  // city surface; the mid playa goes a shade darker. Both return to zero at
  // the image edge so the raster blends into the solid colour that fills the
  // map beyond it.
  parts.push(`<rect width="${SIZE}" height="${SIZE}" fill="url(#grading-${theme})"/>`)
  parts.push(gradientCircle(`url(#city-${theme})`, CENTER, CENTER, CITY_RADIUS_PX * 1.05))

  parts.push(roads(theme, rng, r))
  parts.push(cracks(theme, rng, r))
  parts.push(mountains(theme, rng, r))

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <radialGradient id="grading-${theme}" gradientUnits="userSpaceOnUse" cx="${CENTER}" cy="${CENTER}" r="${CENTER}">
      <stop offset="0%" stop-color="${t.playaLight}" stop-opacity="0.5"/>
      <stop offset="30%" stop-color="${t.playaLight}" stop-opacity="0.16"/>
      <stop offset="62%" stop-color="${t.playaDark}" stop-opacity="0.1"/>
      <stop offset="86%" stop-color="${t.playaDark}" stop-opacity="0.38"/>
      <stop offset="100%" stop-color="${t.playaDark}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="city-${theme}" gradientUnits="userSpaceOnUse" cx="${CENTER}" cy="${CENTER}" r="${CITY_RADIUS_PX * 1.05}">
      <stop offset="0%" stop-color="${t.playaLight}" stop-opacity="0.4"/>
      <stop offset="70%" stop-color="${t.playaLight}" stop-opacity="0.1"/>
      <stop offset="100%" stop-color="${t.playaLight}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="crack-mask-${theme}" gradientUnits="userSpaceOnUse" cx="${CENTER}" cy="${CENTER}" r="${CRACK_RING.outer}">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/>
      <stop offset="${(CRACK_RING.inner / CRACK_RING.outer) * 100}%" stop-color="#000" stop-opacity="0"/>
      <stop offset="${(px(3600) / CRACK_RING.outer) * 100}%" stop-color="#fff" stop-opacity="1"/>
      <stop offset="${(px(6100) / CRACK_RING.outer) * 100}%" stop-color="#fff" stop-opacity="1"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <mask id="crack-fade-${theme}">
      <rect width="${SIZE}" height="${SIZE}" fill="url(#crack-mask-${theme})"/>
    </mask>
  </defs>
  ${parts.join('\n  ')}
</svg>
`
}

function gradientCircle(url, cx, cy, r) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${url}"/>`
}

/**
 * Access roads: a few graded dirt lines drawn from the basin's edge in toward
 * the city. Straight on the playa, with a single lazy bend near the gate.
 */
function roads(theme, rng, r) {
  const t = THEMES[theme]
  const specs = [
    { bearing: 12, bend: 0.12 },
    { bearing: 104, bend: -0.1 },
    { bearing: 190, bend: 0.08 },
    { bearing: 276, bend: -0.14 },
  ]
  const paths = specs.map(({ bearing, bend }) => {
    const rad = (bearing * Math.PI) / 180
    // From the image edge (CENTER px out) in to just beyond the city fence.
    const edgeX = CENTER + Math.sin(rad) * CENTER
    const edgeY = CENTER - Math.cos(rad) * CENTER
    const innerR = px(3900) + r(0, px(400))
    const innerX = CENTER + Math.sin(rad) * innerR
    const innerY = CENTER - Math.cos(rad) * innerR
    // A single kink partway along, so the road reads as laid, not drawn.
    const midR = (CENTER + innerR) / 2
    const kink = bend * px(1500)
    const kx = CENTER + Math.sin(rad) * midR + Math.cos(rad) * kink
    const ky = CENTER - Math.cos(rad) * midR + Math.sin(rad) * kink
    const d = `M${edgeX.toFixed(1)} ${edgeY.toFixed(1)} L${kx.toFixed(1)} ${ky.toFixed(1)} L${innerX.toFixed(1)} ${innerY.toFixed(1)}`
    return `<path d="${d}" fill="none" stroke="${t.road}" stroke-width="${px(45)}" stroke-linecap="round" opacity="0.16"/>`
  })
  return `<g>${paths.join('')}</g>`
}

/**
 * Polygonal mud cracks — the signature of a drying alkali flat. Each crust
 * plate is an irregular polygon with a hairline seam, laid on a jittered
 * lattice and clipped to a ring around the city: the city surface is tamped
 * flat, and the mountains take over beyond the ring.
 */
function cracks(theme, rng, r) {
  const t = THEMES[theme]
  const spacing = px(320)
  const paths = []
  const rowH = spacing * 0.87
  for (let row = 0; row * rowH < SIZE; row += 1) {
    const y = row * rowH + (rng() - 0.5) * spacing * 0.4
    const stagger = row % 2 ? spacing / 2 : 0
    for (let col = -1; col * spacing < SIZE + spacing; col += 1) {
      const x = col * spacing + stagger + (rng() - 0.5) * spacing * 0.55
      const dist = Math.hypot(x - CENTER, y - CENTER)
      if (dist < CRACK_RING.inner || dist > CRACK_RING.outer) continue
      const n = 5 + Math.floor(rng() * 3)
      const baseAngle = rng() * Math.PI * 2
      const cellR = spacing * 0.68 * (0.72 + rng() * 0.5)
      let d = ''
      for (let i = 0; i <= n; i += 1) {
        const a = baseAngle + (i / n) * Math.PI * 2 + (rng() - 0.5) * 0.75
        const cx = x + Math.cos(a) * cellR
        const cy = y + Math.sin(a) * cellR
        d += `${i ? 'L' : 'M'}${cx.toFixed(1)} ${cy.toFixed(1)}`
      }
      paths.push(d)
    }
  }
  const bodies = paths
    .map(
      (d) =>
        `<path d="${d}" fill="${t.crackFill}" fill-opacity="0.42" stroke="${t.crack}" stroke-width="${px(20)}" stroke-linejoin="round"/>`,
    )
    .join('')
  return `<g mask="url(#crack-fade-${theme})">${bodies}</g>`
}

/**
 * The ranges that ring the basin, drawn the way a hand-drawn map draws them:
 * rows of overlapping ridge triangles with a spine stroke, fading in where
 * they meet the playa. The south edge is left open — the playa drains that
 * way, toward Gerlach.
 */
function mountains(theme, rng, r) {
  const t = THEMES[theme]
  // The playa opens to the south; keep a clear gap around the south point.
  const gap = { center: CENTER, half: px(1600) }
  const shapes = []
  const edges = ['north', 'east', 'south', 'west']

  const rows = [
    // Broad, low row along the rim itself.
    { dist: 2000, w: px(1500), h: px(340), fill: t.mountainA, count: 26 },
    // A taller row drifting toward the playa, softened by the fade.
    { dist: 1760, w: px(1300), h: px(800), fill: t.mountainB, count: 28 },
  ]

  for (const edge of edges) {
    for (const row of rows) {
      let pos = -row.w
      while (pos < SIZE + row.w) {
        const center = pos + r(row.w * 0.3, row.w * 0.5)
        pos = center + row.w * 0.52
        if (edge === 'south' && Math.abs(center - gap.center) < gap.half) continue
        const dist = distanceFromCenter(edge, center, row.dist)
        const fade = clamp((dist - MOUNTAIN_START_PX) / MOUNTAIN_FADE_PX, 0, 1)
        const size = r(0.75, 1.25)
        const w = row.w * size
        const h = row.h * size * r(0.85, 1.15)
        const [a, b, c, spine] = triangle(edge, center, row.dist, w, h)
        shapes.push(
          `<path d="M${a[0]} ${a[1]} L${b[0]} ${b[1]} L${c[0]} ${c[1]} Z" fill="${row.fill}" opacity="${(0.55 + rng() * 0.45) * fade}"/>`,
          `<path d="M${spine[0][0]} ${spine[0][1]} L${spine[1][0]} ${spine[1][1]}" stroke="${t.ridge}" stroke-width="${px(36)}" stroke-linecap="round" opacity="${0.7 * fade}"/>`,
        )
      }
    }
    // Sparse foothills drifting out onto the open playa.
    for (let i = 0; i < 16; i += 1) {
      const center = r(0, SIZE)
      if (edge === 'south' && Math.abs(center - gap.center) < gap.half) continue
      const dist = 1660 + r(0, 200)
      const fade = clamp((dist - MOUNTAIN_START_PX) / px(700), 0, 1)
      if (fade <= 0.05) continue
      const w = px(200) * r(0.7, 1.3)
      const h = px(130) * r(0.7, 1.3)
      const [a, b, c] = triangle(edge, center, dist, w, h)
      shapes.push(
        `<path d="M${a[0]} ${a[1]} L${b[0]} ${b[1]} L${c[0]} ${c[1]} Z" fill="${t.mountainA}" opacity="${0.5 * fade}"/>`,
      )
    }
  }
  return `<g>${shapes.join('')}</g>`
}

/**
 * A ridge triangle: base on the playa side at `dist` px from the centre,
 * apex pointing out toward the rim. Returns apex, base-left, base-right, and
 * the spine (apex to base middle) for the ridge stroke.
 */
function triangle(edge, center, dist, w, h) {
  const half = w / 2
  switch (edge) {
    case 'north': {
      const y = CENTER - dist
      return [
        [center, y - h],
        [center - half, y],
        [center + half, y],
        [
          [center, y - h],
          [center, y],
        ],
      ]
    }
    case 'south': {
      const y = CENTER + dist
      return [
        [center, y + h],
        [center - half, y],
        [center + half, y],
        [
          [center, y + h],
          [center, y],
        ],
      ]
    }
    case 'west': {
      const x = CENTER - dist
      return [
        [x - h, center],
        [x, center - half],
        [x, center + half],
        [
          [x - h, center],
          [x, center],
        ],
      ]
    }
    case 'east': {
      const x = CENTER + dist
      return [
        [x + h, center],
        [x, center - half],
        [x, center + half],
        [
          [x + h, center],
          [x, center],
        ],
      ]
    }
  }
}

/** Distance from the image centre of a triangle at `dist` out on `edge`. */
function distanceFromCenter(edge, center, dist) {
  switch (edge) {
    case 'north':
      return Math.hypot(center - CENTER, dist)
    case 'south':
      return Math.hypot(center - CENTER, dist)
    case 'west':
      return Math.hypot(dist, center - CENTER)
    case 'east':
      return Math.hypot(dist, center - CENTER)
  }
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

/** Deterministic per-theme stream, so rebuilds are byte-identical. */
function seedFor(theme) {
  return theme === 'dark' ? 0x5ea41c : theme === 'light' ? 0x9c2a11 : 0x5e11a4
}

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CHROME = process.env.CHROME_PATH || undefined
const browser = await chromium.launch({
  ...(CHROME ? { executablePath: CHROME } : {}),
  args: ['--no-sandbox', '--no-proxy-server'],
})
const page = await browser.newPage()
await page.setViewportSize({ width: SIZE, height: SIZE })

mkdirSync('public/playa', { recursive: true })
for (const theme of Object.keys(THEMES)) {
  if (ONLY && theme !== ONLY) continue
  const markup = svg(theme)
  await page.setContent(
    `<body style="margin:0">${markup.replace('<svg', `<svg width="${SIZE}" height="${SIZE}"`)}</body>`,
  )
  await page.waitForTimeout(150)
  const path = `public/playa/${theme}.png`
  await page.screenshot({ path, omitBackground: true })
  const bytes = statSync(path).size
  console.log(`${path} — ${SIZE}x${SIZE}, ${(bytes / 1024).toFixed(0)}KB`)
}
await browser.close()
