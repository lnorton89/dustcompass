import { Layer, Source } from '@vis.gl/react-maplibre'
import type { PlayaPalette } from './style'

interface Props {
  services: GeoJSON.FeatureCollection<GeoJSON.Point>
  toilets: GeoJSON.FeatureCollection<GeoJSON.Point>
  showServices: boolean
  showToilets: boolean
  palette: PlayaPalette
}

const EMPTY: GeoJSON.FeatureCollection<GeoJSON.Point> = { type: 'FeatureCollection', features: [] }

/** The dots a tap can land on. Their labels sit clear of the point they name. */
export const SERVICE_LAYER_ID = 'service-dot'
export const TOILET_LAYER_ID = 'toilet-dot'

/**
 * Toilets, medical, rangers and civic landmarks. These stay visible when camps
 * and art are switched off — at 3am they are the only layer that matters, and
 * hunting for them through a filter menu is the wrong interaction.
 */
export function ServiceLayers({ services, toilets, showServices, showToilets, palette }: Props) {
  return (
    <>
      <Source id="toilets" type="geojson" data={showToilets ? toilets : EMPTY}>
        <Layer
          id={TOILET_LAYER_ID}
          type="circle"
          paint={{
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 2.5, 17, 6],
            'circle-color': palette.toilet,
            'circle-opacity': 0.9,
          }}
        />
        <Layer
          id="toilet-icon"
          type="symbol"
          minzoom={14}
          layout={{ 'text-field': 'T', 'text-font': ['Open Sans Regular'], 'text-size': 10 }}
          paint={{ 'text-color': palette.playa }}
        />
        <Layer
          id="toilet-label"
          type="symbol"
          minzoom={15}
          layout={{
            'text-field': 'Toilets',
            'text-font': ['Open Sans Regular'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 15, 12, 18, 14] as unknown as number,
            'text-offset': [0, 0.8],
            'text-anchor': 'top',
            'text-optional': true,
          }}
          paint={{
            'text-color': palette.toilet,
            'text-halo-color': palette.labelHalo,
            'text-halo-width': 1.2,
          }}
        />
      </Source>

      <Source id="services" type="geojson" data={showServices ? services : EMPTY}>
        <Layer
          id={SERVICE_LAYER_ID}
          type="circle"
          paint={{
            'circle-radius': 5,
            'circle-color': [
              'match',
              ['get', 'category'],
              'medical',
              palette.medical,
              'ranger',
              palette.ranger,
              palette.civic,
            ] as unknown as string,
            'circle-stroke-color': palette.playa,
            'circle-stroke-width': 1.5,
          }}
        />
        <Layer
          id="service-icon"
          type="symbol"
          layout={{
            'text-field': ['match', ['get', 'category'], 'medical', '+', 'ranger', 'R', 'i'],
            'text-font': ['Open Sans Regular'],
            'text-size': 11,
          }}
          paint={{ 'text-color': palette.playa }}
        />
        <Layer
          id="service-label"
          type="symbol"
          minzoom={13}
          layout={{
            'text-field': ['get', 'name'],
            'text-font': ['Open Sans Regular'],
            // Medical, rangers, ice. Bigger than a camp label, because the
            // moment one of these is wanted is not a moment for squinting.
            'text-size': ['interpolate', ['linear'], ['zoom'], 13, 13, 17, 16] as unknown as number,
            'text-offset': [0, 0.9],
            'text-anchor': 'top',
          }}
          paint={{
            'text-color': palette.label,
            'text-halo-color': palette.labelHalo,
            'text-halo-width': 1.4,
          }}
        />
      </Source>
    </>
  )
}
