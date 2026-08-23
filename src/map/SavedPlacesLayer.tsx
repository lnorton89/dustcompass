import { useMemo } from 'react'
import { Layer, Source } from '@vis.gl/react-maplibre'
import type { SavedPlace } from '../data/useSavedPlaces'
import type { PlayaPalette } from './style'

interface Props {
  places: SavedPlace[]
  palette: PlayaPalette
}

export const SAVED_LAYER_ID = 'saved-dot'

/** Saved spots stay labelled at every zoom — finding them is the whole point. */
export function SavedPlacesLayer({ places, palette }: Props) {
  const data = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(
    () => ({
      type: 'FeatureCollection',
      features: places.map((place) => ({
        type: 'Feature',
        id: place.id,
        properties: { id: place.id, name: place.name, address: place.address },
        geometry: { type: 'Point', coordinates: place.position },
      })),
    }),
    [places],
  )

  return (
    <Source id="saved" type="geojson" data={data}>
      <Layer
        id={SAVED_LAYER_ID}
        type="circle"
        paint={{
          'circle-radius': 7,
          'circle-color': palette.saved,
          'circle-stroke-color': palette.playa,
          'circle-stroke-width': 2,
        }}
      />
      <Layer
        id="saved-label"
        type="symbol"
        minzoom={14}
        layout={{
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Regular'],
          'text-size': 13,
          'text-offset': [0, 1],
          'text-anchor': 'top',
          'text-allow-overlap': false,
        }}
        paint={{
          'text-color': palette.saved,
          'text-halo-color': palette.labelHalo,
          'text-halo-width': 1.6,
        }}
      />
    </Source>
  )
}
