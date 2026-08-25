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
  kind: 'street' | 'direct'
  coordinates: Position[]
  meters: number
}

const STREET_SNAP_LIMIT_METERS = 220
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

function annularContainsClock(
  street: CityLayout['cStreets'][number],
  clock: string,
): boolean {
  return street.segments.some((segment) => clockInSegment(clock, segment))
}

function polylineMeters(coordinates: Position[]): number {
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
  for (
    let minute = fromMinute + ANNULAR_STEP_MINUTES;
    minute < toMinute;
    minute += ANNULAR_STEP_MINUTES
  ) {
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

  // Radial edges: only join adjacent intersections that are inside the same
  // surveyed radial segment. A missing segment therefore remains a real gap.
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

  // Annular edges: walk each surveyed arc independently and connect adjacent
  // radial intersections along that arc, preserving wraparound past 12:00.
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

function nearestNode(graph: Map<string, GraphNode>, position: Position): GraphNode | undefined {
  let best: GraphNode | undefined
  let bestMeters = Infinity
  for (const node of graph.values()) {
    const meters = distanceBetween(position, node.position)
    if (meters < bestMeters) {
      best = node
      bestMeters = meters
    }
  }
  return bestMeters <= STREET_SNAP_LIMIT_METERS ? best : undefined
}

function dijkstra(
  graph: Map<string, GraphNode>,
  startId: string,
  endId: string,
): { ids: string[]; meters: number } | undefined {
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

  const meters = distance.get(endId)
  if (meters === undefined) return undefined
  const ids = [endId]
  while (ids[0] !== startId) {
    const before = previous.get(ids[0])
    if (!before) return undefined
    ids.unshift(before)
  }
  return { ids, meters }
}

function edgeBetween(graph: Map<string, GraphNode>, from: string, to: string): GraphEdge | undefined {
  return graph.get(from)?.edges.find((edge) => edge.to === to)
}

function directRoute(from: Position, to: Position): PlayaRoute {
  return { kind: 'direct', coordinates: [from, to], meters: distanceBetween(from, to) }
}

function isStreetCityPoint(layout: CityLayout, position: Position): boolean {
  if (!layout.cStreets.length) return false
  const distanceFeet = positionToPolar(layout, position).distanceFeet
  const inner = Math.min(...layout.cStreets.map((street) => street.distance))
  const outer = Math.max(...layout.cStreets.map((street) => street.distance))
  // The open playa inside Esplanade should retain direct-bearing guidance.
  // A small shoulder outside the outer street keeps frontage POIs routable.
  return distanceFeet >= inner - 150 && distanceFeet <= outer + 300
}

/**
 * Route between two points. Dense-city trips use the surveyed street graph;
 * open-playa trips intentionally remain direct bearing guidance. If either
 * endpoint cannot be connected to the street graph within a conservative
 * distance, fall back to an explicitly-direct route instead of fabricating a
 * walkable path.
 */
export function routeBetween(layout: CityLayout, from: Position, to: Position): PlayaRoute {
  if (!isStreetCityPoint(layout, from) || !isStreetCityPoint(layout, to)) {
    return directRoute(from, to)
  }

  const graph = buildStreetGraph(layout)
  const start = nearestNode(graph, from)
  const end = nearestNode(graph, to)
  if (!start || !end) return directRoute(from, to)
  if (start.id === end.id) {
    const coordinates = [from, start.position, to]
    return { kind: 'street', coordinates, meters: polylineMeters(coordinates) }
  }

  const path = dijkstra(graph, start.id, end.id)
  if (!path) return directRoute(from, to)

  const coordinates: Position[] = [from, start.position]
  for (let i = 1; i < path.ids.length; i += 1) {
    const edge = edgeBetween(graph, path.ids[i - 1], path.ids[i])
    if (!edge) return directRoute(from, to)
    coordinates.push(...edge.coordinates.slice(1))
  }
  coordinates.push(to)

  return { kind: 'street', coordinates, meters: polylineMeters(coordinates) }
}
