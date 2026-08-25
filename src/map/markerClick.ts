export interface StoppableMapMarkerEvent {
  stopPropagation: () => void
}

/** Keep a DOM marker click from falling through to MapLibre's feature picker. */
export function handleMapMarkerClick(
  event: StoppableMapMarkerEvent,
  onClick: (() => void) | undefined,
) {
  event.stopPropagation()
  onClick?.()
}
