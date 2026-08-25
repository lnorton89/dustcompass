import { clockToMinutes, distanceBetween, polarToPosition, positionToPolar, type Position } from './geo'
import { resolveRadius, type CityLayout, type RadiusRef } from './layout'

interface GraphEdge {
  to: string
  meters: number
  coordinates: Position[]
}

interface GraphNode {
  id: string
  position: Position
  edges: GraphEdge[]
}

export interface PlayaRoute {
  kind: 'street' | 'hybrid' | 'direct'
  coordinates: Position[]
  meters: number
}

interface EdgeSnap {
  edgeKey: string
  fromId: string
  toId: string
  point: Position
  /** Coordinates from fromId to the snapped point, inclusive. */
  fromCoordinates: Position[]
  /** Coordinates from the snapped point to toId, inclusive. */
  toCoordinates: Position[]
  /** Distance from fromId to the snapped point along the surveyed street. */
  offsetMeters: number
  edgeMeters: number
}

// A BRC block is much smaller than this, but the furthest point on a normal
// annular block frontage from its nearest radial is still around 100 m on the
// outer streets. This accepts real frontage while rejecting a synthetic chord
// across a missing one-hour radial gap (the old 220 m node snap did exactly
// that). Endpoint-to-street access is the only non-street segment inside the
// city route.
const STREET_SNAP_LIMIT_METERS = 140
const ANNULAR_STEP_MINUTES = 2

function radius(layout: CityLayout, value: RadiusRef): number {
  return typeof value === 'number' ? value : resolveRadius(layout, value)
}

function segmentMinutes(startClock: string, endClock: string): [number, number] {
  const start = clockToMinutes(startClock)
  let end = clockToMinutes(endClock)
  if (end <= start) end += 720
  return [start, end]
}

function unwrapMinute(clock: string, segmentStart: number): number {
  let minute = clockToMinutes(clock)
  while (minute < segmentStart) minute += 720
  return minute
}

function clockInSegment(clock: string, segment: [string, string]): boolean {
  const [start, end] = segmentMinutes(segment[0], segment[1])
  const minute = unwrapMinute(clock, start)
  return minute >= start && minute <= end
}

function radialContainsRadius(layout: CityLayout, clock: string, distanceFeet: number): boolean {
  return layout.tStreets.some(
    (street) =>
      street.refs.includes(clock) &&
      street.segments.some((segment) => {
        const a = radius(layout, segment[0])
        const b = radius(layout, segment[1])
        return distanceFeet >= Math.min(a, b) && distanceFeet <= Math.max(a, b)
      }),
  )
}

function annularContainsClock(street: CityLayout['cStreets'][number], clock: string): boolean {
  return street.segments.some((segment) => clockInSegment(clock, segment))
}

export function polylineMeters(coordinates: readonly Position[]): number {
  let meters = 0
  for (let i = 1; i < coordinates.length; i += 1) {
    meters += distanceBetween(coordinates[i - 1], coordinates[i])
  }
  return meters
}

function addEdge(graph: Map<string, GraphNode>, from: string, to: string, coordinates: Position[]) {
  const a = graph.get(from)
  const b = graph.get(to)
  if (!a || !b || coordinates.length < 2) return
  const meters = polylineMeters(coordinates)
  a.edges.push({ to, meters, coordinates })
  b.edges.push({ to: from, meters, coordinates: [...coordinates].reverse() })
}

function annularCoordinates(
  layout: CityLayout,
  distanceFeet: number,
  fromMinute: number,
  toMinute: number,
): Position[] {
  const out: Position[] = [polarToPosition(layout, fromMinute, distanceFeet)]
  for (let minute = fromMinute + ANNULAR_STEP_MINUTES; minute < toMinute; minute += ANNULAR_STEP_MINUTES) {
    out.push(polarToPosition(layout, minute, distanceFeet))
  }
  out.push(polarToPosition(layout, toMinute, distanceFeet))
  return out
}

/**
 * Build the annual street graph from the same declarative survey-derived layout
 * used to draw the map. Nodes are real radial/annular intersections; edges only
 * exist where both corresponding surveyed street segments exist. This keeps
 * routing completely offline and prevents a shortest-path solver from inventing
 * streets across gaps in the annual plan.
 */
export function buildStreetGraph(layout: CityLayout): Map<string, GraphNode> {
  const graph = new Map<string, GraphNode>()
  const radialRefs = [...new Set(layout.tStreets.flatMap((street) => street.refs))]

  for (const annular of layout.cStreets) {
    for (const clock of radialRefs) {
      if (!annularContainsClock(annular, clock)) continue
      if (!radialContainsRadius(layout, clock, annular.distance)) continue
      const id = `${annular.ref}@${clock}`
      graph.set(id, {
        id,
        position: polarToPosition(layout, clock, annular.distance),
        edges: [],
      })
    }
  }

  for (const radial of layout.tStreets) {
    for (const clock of radial.refs) {
      for (const segment of radial.segments) {
        const low = Math.min(radius(layout, segment[0]), radius(layout, segment[1]))
        const high = Math.max(radius(layout, segment[0]), radius(layout, segment[1]))
        const intersections = layout.cStreets
          .filter(
            (street) =>
              street.distance >= low &&
              street.distance <= high &&
              annularContainsClock(street, clock),
          )
          .sort((a, b) => a.distance - b.distance)

        for (let i = 1; i < intersections.length; i += 1) {
          const a = intersections[i - 1]
          const b = intersections[i]
          addEdge(graph, `${a.ref}@${clock}`, `${b.ref}@${clock}`, [
            polarToPosition(layout, clock, a.distance),
            polarToPosition(layout, clock, b.distance),
          ])
        }
      }
    }
  }

  for (const annular of layout.cStreets) {
    for (const segment of annular.segments) {
      const [start, end] = segmentMinutes(segment[0], segment[1])
      const intersections = radialRefs
        .filter(
          (clock) =>
            clockInSegment(clock, segment) &&
            radialContainsRadius(layout, clock, annular.distance),
        )
        .map((clock) => ({ clock, minute: unwrapMinute(clock, start) }))
        .filter(({ minute }) => minute >= start && minute <= end)
        .sort((a, b) => a.minute - b.minute)

      for (let i = 1; i < intersections.length; i += 1) {
        const a = intersections[i - 1]
        const b = intersections[i]
        addEdge(
          graph,
          `${annular.ref}@${a.clock}`,
          `${annular.ref}@${b.clock}`,
          annularCoordinates(layout, annular.distance, a.minute, b.minute),
        )
      }
    }
  }

  return graph
}

function projectOnSegment(position: Position, a: Position, b: Position): { point: Position; t: number } {
  // Equirectangular projection is more than adequate for one city block and
  // avoids importing a second geodesic implementation just to find a nearest
  // point on a short surveyed segment.
  const latitude = ((position[1] + a[1] + b[1]) / 3) * (Math.PI / 180)
  const scaleX = Math.cos(latitude)
  const dx = (b[0] - a[0]) * scaleX
  const dy = b[1] - a[1]
  const px = (position[0] - a[0]) * scaleX
  const py = position[1] - a[1]
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSquared))
  return {
    point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
    t,
  }
}

function nearestEdgeSnap(graph: Map<string, GraphNode>, position: Position): EdgeSnap | undefined {
  let best: EdgeSnap | undefined
  let bestDistance = Infinity
  const seen = new Set<string>()

  for (const [fromId, node] of graph) {
    for (const edge of node.edges) {
      const edgeKey = fromId < edge.to ? `${fromId}|${edge.to}` : `${edge.to}|${fromId}`
      if (seen.has(edgeKey)) continue
      seen.add(edgeKey)

      // Always evaluate in canonical edge orientation so same-edge start/end
      // snaps can compare offsets later.
      const canonicalFrom = fromId < edge.to ? fromId : edge.to
      const canonicalTo = fromId < edge.to ? edge.to : fromId
      const coordinates = canonicalFrom === fromId ? edge.coordinates : [...edge.coordinates].reverse()
      let beforeMeters = 0

      for (let i = 1; i < coordinates.length; i += 1) {
        const a = coordinates[i - 1]
        const b = coordinates[i]
        const projection = projectOnSegment(position, a, b)
        const away = distanceBetween(position, projection.point)
        const segmentMeters = distanceBetween(a, b)

        if (away < bestDistance) {
          bestDistance = away
          const fromCoordinates = [...coordinates.slice(0, i), projection.point]
          const toCoordinates = [projection.point, ...coordinates.slice(i)]
          best = {
            edgeKey,
            fromId: canonicalFrom,
            toId: canonicalTo,
            point: projection.point,
            fromCoordinates,
            toCoordinates,
            offsetMeters: beforeMeters + segmentMeters * projection.t,
            edgeMeters: polylineMeters(coordinates),
          }
        }
        beforeMeters += segmentMeters
      }
    }
  }

  return bestDistance <= STREET_SNAP_LIMIT_METERS ? best : undefined
}

function cloneGraph(graph: Map<string, GraphNode>): Map<string, GraphNode> {
  return new Map(
    [...graph].map(([id, node]) => [
      id,
      { id, position: node.position, edges: node.edges.map((edge) => ({ ...edge, coordinates: [...edge.coordinates] })) },
    ]),
  )
}

function attachEndpoint(
  graph: Map<string, GraphNode>,
  id: string,
  position: Position,
  snap: EdgeSnap,
) {
  graph.set(id, { id, position, edges: [] })
  // Each access leg travels only from the endpoint to its nearest surveyed
  // street point, then follows that street to an actual graph intersection.
  addEdge(graph, snap.fromId, id, [...snap.fromCoordinates, position])
  addEdge(graph, snap.toId, id, [[...snap.toCoordinates].reverse()[0], ...[...snap.toCoordinates].reverse().slice(1), position])
}

function sameEdgeCoordinates(a: EdgeSnap, b: EdgeSnap): Position[] | undefined {
  if (a.edgeKey !== b.edgeKey) return undefined
  // Reconstructing from the two split polylines avoids retaining a second copy
  // of every edge on every snap. Both are in the same canonical orientation.
  const base = [...a.fromCoordinates.slice(0, -1), ...a.toCoordinates]
  const first = a.offsetMeters <= b.offsetMeters ? a : b
  const second = first === a ? b : a

  let startIndex = 0
  let endIndex = base.length - 1
  let bestStart = Infinity
  let bestEnd = Infinity
  for (let i = 0; i < base.length; i += 1) {
    const startDistance = distanceBetween(base[i], first.point)
    if (startDistance < bestStart) {
      bestStart = startDistance
      startIndex = i
    }
    const endDistance = distanceBetween(base[i], second.point)
    if (endDistance < bestEnd) {
      bestEnd = endDistance
      endIndex = i
    }
  }
  if (startIndex > endIndex) [startIndex, endIndex] = [endIndex, startIndex]
  const middle = base.slice(startIndex + 1, endIndex)
  const path = [first.point, ...middle, second.point]
  return first === a ? path : path.reverse()
}

function dijkstra(
  graph: Map<string, GraphNode>,
  startId: string,
  endId: string,
): string[] | undefined {
  const distance = new Map<string, number>([[startId, 0]])
  const previous = new Map<string, string>()
  const pending = new Set(graph.keys())

  while (pending.size) {
    let current: string | undefined
    let currentDistance = Infinity
    for (const id of pending) {
      const candidate = distance.get(id) ?? Infinity
      if (candidate < currentDistance) {
        current = id
        currentDistance = candidate
      }
    }
    if (!current || currentDistance === Infinity) return undefined
    if (current === endId) break
    pending.delete(current)

    const node = graph.get(current)
    if (!node) return undefined
    for (const edge of node.edges) {
      if (!pending.has(edge.to)) continue
      const candidate = currentDistance + edge.meters
      if (candidate >= (distance.get(edge.to) ?? Infinity)) continue
      distance.set(edge.to, candidate)
      previous.set(edge.to, current)
    }
  }

  if (!distance.has(endId)) return undefined
  const ids = [endId]
  while (ids[0] !== startId) {
    const before = previous.get(ids[0])
    if (!before) return undefined
    ids.unshift(before)
  }
  return ids
}

function edgeBetween(graph: Map<string, GraphNode>, from: string, to: string): GraphEdge | undefined {
  return graph.get(from)?.edges.find((edge) => edge.to === to)
}

function routeCoordinates(graph: Map<string, GraphNode>, ids: string[]): Position[] | undefined {
  const first = graph.get(ids[0])
  if (!first) return undefined
  const coordinates: Position[] = [first.position]
  for (let i = 1; i < ids.length; i += 1) {
    const edge = edgeBetween(graph, ids[i - 1], ids[i])
    if (!edge) return undefined
    coordinates.push(...edge.coordinates.slice(1))
  }
  return coordinates
}

function directRoute(from: Position, to: Position): PlayaRoute {
  return { kind: 'direct', coordinates: [from, to], meters: distanceBetween(from, to) }
}

function cityBand(layout: CityLayout): { inner: number; outer: number } | undefined {
  if (!layout.cStreets.length) return undefined
  return {
    inner: Math.min(...layout.cStreets.map((street) => street.distance)),
    outer: Math.max(...layout.cStreets.map((street) => street.distance)),
  }
}

function isStreetCityPoint(layout: CityLayout, position: Position): boolean {
  const band = cityBand(layout)
  if (!band) return false
  const distanceFeet = positionToPolar(layout, position).distanceFeet
  return distanceFeet >= band.inner - 150 && distanceFeet <= band.outer + 300
}

function isInnerOpenPlaya(layout: CityLayout, position: Position): boolean {
  const band = cityBand(layout)
  if (!band) return false
  return positionToPolar(layout, position).distanceFeet < band.inner - 150
}

function streetRoute(layout: CityLayout, from: Position, to: Position): PlayaRoute | undefined {
  const baseGraph = buildStreetGraph(layout)
  const startSnap = nearestEdgeSnap(baseGraph, from)
  const endSnap = nearestEdgeSnap(baseGraph, to)
  if (!startSnap || !endSnap) return undefined

  const graph = cloneGraph(baseGraph)
  attachEndpoint(graph, '__start', from, startSnap)
  attachEndpoint(graph, '__end', to, endSnap)

  const sameEdge = sameEdgeCoordinates(startSnap, endSnap)
  if (sameEdge) addEdge(graph, '__start', '__end', [from, ...sameEdge, to])

  const ids = dijkstra(graph, '__start', '__end')
  if (!ids) return undefined
  const coordinates = routeCoordinates(graph, ids)
  if (!coordinates) return undefined
  return { kind: 'street', coordinates, meters: polylineMeters(coordinates) }
}

function boundaryForOpenPoint(layout: CityLayout, position: Position): Position | undefined {
  const band = cityBand(layout)
  if (!band) return undefined
  const polar = positionToPolar(layout, position)
  return polarToPosition(layout, polar.minutes, band.inner)
}

/**
 * Route between two points entirely from packaged annual geometry.
 *
 * - city-to-city travel follows surveyed radial/annular streets;
 * - inner open-playa travel stays direct;
 * - city↔open-playa travel is hybrid: streets to the Esplanade boundary, then
 *   a direct open-playa leg;
 * - anything that cannot be safely snapped to a real street falls back to an
 *   explicitly direct bearing instead of fabricating a walkable road.
 */
export function routeBetween(layout: CityLayout, from: Position, to: Position): PlayaRoute {
  const fromCity = isStreetCityPoint(layout, from)
  const toCity = isStreetCityPoint(layout, to)

  if (fromCity && toCity) return streetRoute(layout, from, to) ?? directRoute(from, to)

  const fromOpen = isInnerOpenPlaya(layout, from)
  const toOpen = isInnerOpenPlaya(layout, to)
  if (fromOpen && toOpen) return directRoute(from, to)

  if (fromOpen && toCity) {
    const boundary = boundaryForOpenPoint(layout, from)
    if (boundary) {
      const city = streetRoute(layout, boundary, to)
      if (city) {
        const coordinates = [from, ...city.coordinates]
        return { kind: 'hybrid', coordinates, meters: polylineMeters(coordinates) }
      }
    }
  }

  if (fromCity && toOpen) {
    const boundary = boundaryForOpenPoint(layout, to)
    if (boundary) {
      const city = streetRoute(layout, from, boundary)
      if (city) {
        const coordinates = [...city.coordinates, to]
        return { kind: 'hybrid', coordinates, meters: polylineMeters(coordinates) }
      }
    }
  }

  return directRoute(from, to)
}
