import { DATA_YEAR } from '../config'
import type { PlayaRoute } from '../brc/routing'
import { formatDistance, formatMinutes, travelForMeters } from '../brc/travel'
import type { DirectionsMode } from '../data/directions'
import type { CityLayout } from '../brc/layout'
import { resolveRadius } from '../brc/layout'
import { arc, clockToMinutes, polarToPosition, type Position } from '../brc/geo'

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
  published?: boolean
  layout: CityLayout
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
  if (west === east) { west -= 0.0001; east += 0.0001 }
  if (south === north) { south -= 0.0001; north += 0.0001 }
  return { west, east, south, north }
}

function projection(route: PlayaRoute) {
  const map = { x: 52, y: 118, width: 690, height: 458 }
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
  return {
    map,
    project: ([lng, lat]: Position) => ({
      x: offsetX + ((lng - bounds.west) / spanX) * drawWidth,
      y: offsetY + (1 - (lat - bounds.south) / spanY) * drawHeight,
    }),
  }
}

export function routeCardLayout(route: PlayaRoute): RouteCardLayout {
  const { map, project } = projection(route)
  return {
    width: ROUTE_CARD_WIDTH,
    height: ROUTE_CARD_HEIGHT,
    map,
    summary: { x: 786, y: 118, width: 362, height: 458 },
    routePoints: route.coordinates.map(project),
  }
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 3): number {
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

export function routeCardCityGeometry(city: CityLayout, route: PlayaRoute) {
  const { project } = projection(route)
  return {
    annulars: city.cStreets.flatMap((street) => street.segments.map(([from, to]) => ({
      name: street.name,
      points: arc(city, street.distance, from, to, 2).map(project),
    }))),
    radials: city.tStreets.flatMap((radial) => radial.refs.flatMap((ref) => radial.segments.map(([inner, outer]) => ({
      ref,
      points: [
        polarToPosition(city, ref, resolveRadius(city, inner)),
        polarToPosition(city, ref, resolveRadius(city, outer)),
      ].map(project),
    })))),
    man: project(city.center.geometry.coordinates as Position),
  }
}

function drawCity(ctx: CanvasRenderingContext2D, city: CityLayout, route: PlayaRoute) {
  const geometry = routeCardCityGeometry(city, route)
  const { project } = projection(route)
  ctx.strokeStyle = 'rgba(69, 59, 48, 0.42)'
  ctx.lineWidth = 2
  for (const street of geometry.annulars) {
    const positions = street.points
    if (positions.length < 2) continue
    ctx.beginPath()
    ctx.moveTo(positions[0].x, positions[0].y)
    for (const point of positions.slice(1)) ctx.lineTo(point.x, point.y)
    ctx.stroke()
  }
  for (const radial of geometry.radials) {
    const positions = radial.points
    if (positions.length < 2) continue
    ctx.beginPath()
    ctx.moveTo(positions[0].x, positions[0].y)
    for (const point of positions.slice(1)) ctx.lineTo(point.x, point.y)
    ctx.stroke()
  }
  const man = geometry.man
  ctx.beginPath()
  ctx.arc(man.x, man.y, 7, 0, Math.PI * 2)
  ctx.fillStyle = '#6e5d48'
  ctx.fill()
  ctx.fillStyle = '#6e5d48'
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillText('The Man', man.x + 10, man.y - 8)
  ctx.font = '500 12px system-ui, sans-serif'
  for (const street of city.cStreets) {
    const segment = street.segments[0]
    if (!segment) continue
    const start = clockToMinutes(segment[0])
    let end = clockToMinutes(segment[1])
    if (end <= start) end += 720
    const point = project(polarToPosition(city, (start + end) / 2, street.distance))
    ctx.fillText(street.name, point.x + 3, point.y - 3)
  }
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

  ctx.save()
  roundedRect(ctx, layout.map.x, layout.map.y, layout.map.width, layout.map.height, 24)
  ctx.clip()
  drawCity(ctx, input.layout, input.route)
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
  } else if (input.published) {
    ctx.fillStyle = '#b9ad9a'
    ctx.font = '600 15px system-ui, sans-serif'
    wrapText(ctx, 'Officially published location — not surveyed; camps and art can move.', layout.summary.x + 28, y + 12, layout.summary.width - 56, 20, 2)
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode route card')), 'image/png')
  })
}

export type RouteCardShareResult = 'shared' | 'copied' | 'downloaded' | 'cancelled'

export async function shareRouteCard(input: RouteCardInput): Promise<RouteCardShareResult> {
  const blob = await generateRouteCard(input)
  const file = new File([blob], `dust-compass-${DATA_YEAR}-route.png`, { type: 'image/png' })
  if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Dust Compass directions' })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      // A platform share failure is not an image-generation failure. Continue
      // through the deterministic clipboard/download fallback instead (#149).
    }
  }
  if (navigator.clipboard && 'write' in navigator.clipboard && typeof ClipboardItem !== 'undefined') {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      return 'copied'
    } catch {
      // Download remains the final offline-safe fallback.
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
