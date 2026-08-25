import { DATA_YEAR } from '../config'
import type { PlayaRoute } from '../brc/routing'
import { formatDistance, formatMinutes, travelForMeters } from '../brc/travel'
import type { DirectionsMode } from '../data/directions'

export const ROUTE_CARD_WIDTH = 1200
export const ROUTE_CARD_HEIGHT = 630

export interface RouteCardInput {
  fromLabel: string
  toLabel: string
  toDetail?: string
  route: PlayaRoute
  mode: DirectionsMode
  heading: string
  approximate?: boolean
}

export interface RouteCardLayout {
  width: number
  height: number
  map: { x: number; y: number; width: number; height: number }
  summary: { x: number; y: number; width: number; height: number }
  routePoints: { x: number; y: number }[]
}

function routeBounds(route: PlayaRoute) {
  let west = Infinity
  let east = -Infinity
  let south = Infinity
  let north = -Infinity
  for (const [lng, lat] of route.coordinates) {
    west = Math.min(west, lng)
    east = Math.max(east, lng)
    south = Math.min(south, lat)
    north = Math.max(north, lat)
  }
  if (!Number.isFinite(west)) return { west: 0, east: 1, south: 0, north: 1 }
  if (west === east) {
    west -= 0.0001
    east += 0.0001
  }
  if (south === north) {
    south -= 0.0001
    north += 0.0001
  }
  return { west, east, south, north }
}

/**
 * Pure layout plan used by both the canvas renderer and unit tests. Keeping the
 * map crop deterministic avoids WebGL/canvas timing races and makes a route
 * card identical online and offline.
 */
export function routeCardLayout(route: PlayaRoute): RouteCardLayout {
  const map = { x: 52, y: 118, width: 690, height: 458 }
  const summary = { x: 786, y: 118, width: 362, height: 458 }
  const bounds = routeBounds(route)
  const pad = 42
  const usableWidth = map.width - pad * 2
  const usableHeight = map.height - pad * 2
  const spanX = bounds.east - bounds.west
  const spanY = bounds.north - bounds.south
  const routeAspect = spanX / spanY
  const boxAspect = usableWidth / usableHeight
  let drawWidth = usableWidth
  let drawHeight = usableHeight
  if (routeAspect > boxAspect) drawHeight = usableWidth / routeAspect
  else drawWidth = usableHeight * routeAspect
  const offsetX = map.x + pad + (usableWidth - drawWidth) / 2
  const offsetY = map.y + pad + (usableHeight - drawHeight) / 2

  const routePoints = route.coordinates.map(([lng, lat]) => ({
    x: offsetX + ((lng - bounds.west) / spanX) * drawWidth,
    y: offsetY + (1 - (lat - bounds.south) / spanY) * drawHeight,
  }))

  return { width: ROUTE_CARD_WIDTH, height: ROUTE_CARD_HEIGHT, map, summary, routePoints }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 3,
): number {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width <= maxWidth || !line) line = next
    else {
      lines.push(line)
      line = word
      if (lines.length === maxLines - 1) break
    }
  }
  if (line && lines.length < maxLines) lines.push(line)
  lines.forEach((item, index) => ctx.fillText(item, x, y + index * lineHeight))
  return y + lines.length * lineHeight
}

export async function generateRouteCard(input: RouteCardInput): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = ROUTE_CARD_WIDTH
  canvas.height = ROUTE_CARD_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Route card canvas is unavailable')

  const layout = routeCardLayout(input.route)
  const travel = travelForMeters(input.route.meters)
  const eta = input.mode === 'walk' ? travel.walkMinutes : travel.bikeMinutes

  ctx.fillStyle = '#171513'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = '#f3e7cf'
  ctx.font = '700 38px system-ui, sans-serif'
  ctx.fillText('Dust Compass', 52, 64)
  ctx.fillStyle = '#b9ad9a'
  ctx.font = '500 20px system-ui, sans-serif'
  ctx.fillText(`${DATA_YEAR} Black Rock City directions`, 52, 94)

  roundedRect(ctx, layout.map.x, layout.map.y, layout.map.width, layout.map.height, 24)
  ctx.fillStyle = '#e6d6b9'
  ctx.fill()

  // A sparse, deterministic playa grid gives the route spatial context without
  // depending on MapLibre/WebGL capture or remote tiles.
  ctx.save()
  roundedRect(ctx, layout.map.x, layout.map.y, layout.map.width, layout.map.height, 24)
  ctx.clip()
  ctx.strokeStyle = 'rgba(69, 59, 48, 0.16)'
  ctx.lineWidth = 1
  for (let x = layout.map.x + 50; x < layout.map.x + layout.map.width; x += 72) {
    ctx.beginPath()
    ctx.moveTo(x, layout.map.y)
    ctx.lineTo(x, layout.map.y + layout.map.height)
    ctx.stroke()
  }
  for (let y = layout.map.y + 42; y < layout.map.y + layout.map.height; y += 64) {
    ctx.beginPath()
    ctx.moveTo(layout.map.x, y)
    ctx.lineTo(layout.map.x + layout.map.width, y)
    ctx.stroke()
  }

  if (layout.routePoints.length >= 2) {
    ctx.strokeStyle = '#cf6d42'
    ctx.lineWidth = 8
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (input.route.kind === 'direct') ctx.setLineDash([18, 14])
    ctx.beginPath()
    ctx.moveTo(layout.routePoints[0].x, layout.routePoints[0].y)
    for (const point of layout.routePoints.slice(1)) ctx.lineTo(point.x, point.y)
    ctx.stroke()
    ctx.setLineDash([])

    const start = layout.routePoints[0]
    const end = layout.routePoints.at(-1) ?? start
    for (const [point, label] of [[start, 'A'], [end, 'B']] as const) {
      ctx.beginPath()
      ctx.arc(point.x, point.y, 18, 0, Math.PI * 2)
      ctx.fillStyle = label === 'A' ? '#238e83' : '#cf6d42'
      ctx.fill()
      ctx.fillStyle = '#fffaf1'
      ctx.font = '700 18px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, point.x, point.y + 1)
    }
    ctx.textAlign = 'start'
    ctx.textBaseline = 'alphabetic'
  }
  ctx.restore()

  roundedRect(ctx, layout.summary.x, layout.summary.y, layout.summary.width, layout.summary.height, 24)
  ctx.fillStyle = '#24201c'
  ctx.fill()

  let y = layout.summary.y + 42
  ctx.fillStyle = '#9d9282'
  ctx.font = '600 16px system-ui, sans-serif'
  ctx.fillText('FROM', layout.summary.x + 28, y)
  y += 29
  ctx.fillStyle = '#f4ead9'
  ctx.font = '700 24px system-ui, sans-serif'
  y = wrapText(ctx, input.fromLabel, layout.summary.x + 28, y, layout.summary.width - 56, 29, 2) + 12

  ctx.fillStyle = '#9d9282'
  ctx.font = '600 16px system-ui, sans-serif'
  ctx.fillText('TO', layout.summary.x + 28, y)
  y += 29
  ctx.fillStyle = '#f4ead9'
  ctx.font = '700 24px system-ui, sans-serif'
  y = wrapText(ctx, input.toLabel, layout.summary.x + 28, y, layout.summary.width - 56, 29, 2)
  if (input.toDetail) {
    ctx.fillStyle = '#b9ad9a'
    ctx.font = '500 16px system-ui, sans-serif'
    y = wrapText(ctx, input.toDetail, layout.summary.x + 28, y + 8, layout.summary.width - 56, 21, 2)
  }

  y += 26
  ctx.fillStyle = '#cf6d42'
  ctx.font = '800 34px system-ui, sans-serif'
  ctx.fillText(`${formatDistance(travel)} · ${formatMinutes(eta)}`, layout.summary.x + 28, y)
  y += 31
  ctx.fillStyle = '#f4ead9'
  ctx.font = '600 18px system-ui, sans-serif'
  ctx.fillText(`${input.mode === 'walk' ? 'Walk' : 'Bike'} · head toward ${input.heading}`, layout.summary.x + 28, y)

  y += 42
  ctx.fillStyle = '#b9ad9a'
  ctx.font = '500 16px system-ui, sans-serif'
  const guidance = input.route.kind === 'street'
    ? 'Surveyed street route around occupied blocks.'
    : input.route.kind === 'hybrid'
      ? 'Surveyed streets plus a direct open-playa leg.'
      : 'Straight-line bearing guidance — verify a walkable path.'
  y = wrapText(ctx, guidance, layout.summary.x + 28, y, layout.summary.width - 56, 22, 3)
  if (input.approximate) {
    ctx.fillStyle = '#d5a84e'
    ctx.font = '600 15px system-ui, sans-serif'
    wrapText(ctx, 'Destination is an approximate address area.', layout.summary.x + 28, y + 12, layout.summary.width - 56, 20, 2)
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode route card')), 'image/png')
  })
}

export type RouteCardShareResult = 'shared' | 'copied' | 'downloaded'

export async function shareRouteCard(input: RouteCardInput): Promise<RouteCardShareResult> {
  const blob = await generateRouteCard(input)
  const file = new File([blob], `dust-compass-${DATA_YEAR}-route.png`, { type: 'image/png' })

  if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: 'Dust Compass directions' })
    return 'shared'
  }

  if (navigator.clipboard && 'write' in navigator.clipboard && typeof ClipboardItem !== 'undefined') {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      return 'copied'
    } catch {
      // Browsers frequently expose image clipboard APIs but reject them outside
      // a secure/user-activated context. Download remains a deterministic
      // fallback and works offline.
    }
  }

  const href = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = file.name
    anchor.rel = 'noopener'
    anchor.click()
  } finally {
    setTimeout(() => URL.revokeObjectURL(href), 0)
  }
  return 'downloaded'
}
