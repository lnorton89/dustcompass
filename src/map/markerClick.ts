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

const MARKER_CLICK_GUARD_MS = 1_000

/** MapLibre can retarget its synthesized map click to the canvas, losing the
 * original marker element. A preceding pointer-down is therefore the durable
 * signal that the next map click belongs to the marker. */
export function shouldIgnoreMapClick(
  target: EventTarget | null,
  markerPointerAt: number,
  now = Date.now(),
): boolean {
  return (
    isInteractiveMapMarkerTarget(target) ||
    (markerPointerAt > 0 && now - markerPointerAt <= MARKER_CLICK_GUARD_MS)
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
