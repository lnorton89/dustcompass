import type { MapGeoJSONFeature } from 'maplibre-gl'

export interface ScreenPoint {
  x: number
  y: number
}

/**
 * Of everything a tap could have meant, the one anchored closest to it.
 *
 * A tap is fat and the things it lands on are small, so the map is asked about
 * a box rather than a pixel. That box routinely holds several answers — a
 * label belonging to one camp and the dot of another, or two camps sharing one
 * intersection — and the renderer's own order is not the one the person meant.
 * Distance from the tap to the feature's own anchor is.
 *
 * `idKey` names the property that identifies a feature well enough to act on
 * it afterwards — `uid` for listings drawn from the survey/API, `id` for the
 * user's own saved spots, which carry no `uid`. Anything without that
 * property is scaffolding (a cluster bubble, a line) rather than a tappable
 * place, and is skipped.
 */
export function nearestFeature(
  features: MapGeoJSONFeature[],
  at: ScreenPoint,
  project: (position: [number, number]) => ScreenPoint,
  idKey: string = 'uid',
): MapGeoJSONFeature | undefined {
  let closest: MapGeoJSONFeature | undefined
  let best = Infinity
  for (const feature of features) {
    if (!feature.properties?.[idKey] || feature.geometry.type !== 'Point') continue
    const anchor = project(feature.geometry.coordinates as [number, number])
    const distance = Math.hypot(anchor.x - at.x, anchor.y - at.y)
    if (distance < best) {
      best = distance
      closest = feature
    }
  }
  return closest
}

/** One candidate pool for {@link pickByPriority} — a name for tests/logging plus the features to search. */
export interface TapCandidateGroup {
  id: string
  features: MapGeoJSONFeature[]
  /** Passed through to {@link nearestFeature}; defaults to `'uid'`. */
  idKey?: string
}

/**
 * Arbitrates a tap across several priority-ordered candidate groups (saved
 * spots, civic/safety features, POI labels, ...). This is `handleClick`'s hit
 * arbitration pulled out as pure logic, so it can be exercised with a
 * constructed fixture instead of a real MapLibre instance (jsdom has no
 * WebGL).
 *
 * Within a group, {@link nearestFeature} picks whichever candidate is
 * anchored closest to the tap. Across groups, the first group with any
 * qualifying candidate wins outright — group order *is* the priority, so an
 * earlier group's feature is taken even when a later group's feature happens
 * to be a pixel closer to the tap. That is deliberate: it is what lets a
 * saved spot stay reachable when it is drawn underneath a camp or landmark
 * dot it visually overlaps, rather than losing to whatever the renderer
 * happened to stack on top.
 */
export function pickByPriority(
  groups: TapCandidateGroup[],
  at: ScreenPoint,
  project: (position: [number, number]) => ScreenPoint,
): { groupId: string; feature: MapGeoJSONFeature } | undefined {
  for (const group of groups) {
    const feature = nearestFeature(group.features, at, project, group.idKey)
    if (feature) return { groupId: group.id, feature }
  }
  return undefined
}
