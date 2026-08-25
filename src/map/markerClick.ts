export interface StoppableMapMarkerEvent {
  stopPropagation: () => void
}

interface ClosestTarget extends EventTarget {
  closest: (selector: string) => unknown
}

function hasClosest(target: EventTarget): target is ClosestTarget {
  return typeof Reflect.get(target, 'closest') === 'function'
}

/** MapLibre listens natively on the map container, outside React's synthetic
 * propagation boundary. Inspect the original DOM target as a second line of
 * defence so an interactive marker can never fall through to a WebGL POI. */
export function isInteractiveMapMarkerTarget(target: EventTarget | null): boolean {
  if (!target || !hasClosest(target)) return false
  return Boolean(target.closest('[data-map-marker-interactive="true"]'))
}

interface ScreenPoint {
  x: number
  y: number
}

/** The marker is bottom-centred on its coordinate and its transparent button
 * is 44px square. Geometry remains reliable even when MapLibre retargets the
 * native click to its canvas and discards the original DOM marker target. */
export function isDroppedMarkerHit(click: ScreenPoint, anchor: ScreenPoint): boolean {
  return (
    Math.abs(click.x - anchor.x) <= 22 &&
    click.y <= anchor.y &&
    click.y >= anchor.y - 44
  )
}

/** Keep a DOM marker click from falling through to MapLibre's feature picker. */
export function handleMapMarkerClick(
  event: StoppableMapMarkerEvent,
  onClick: (() => void) | undefined,
) {
  event.stopPropagation()
  onClick?.()
}
