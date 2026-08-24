import type { MetadataRoute } from 'next'
import { BRAND } from '../brand'
import { BASE_PATH } from '../config'

export const dynamic = 'force-static'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.name,
    description: BRAND.description,
    id: `${BASE_PATH}/`,
    start_url: `${BASE_PATH}/`,
    scope: `${BASE_PATH}/`,
    display: 'standalone',
    orientation: 'any',
    background_color: BRAND.colors.ink,
    theme_color: BRAND.colors.ink,
    categories: ['navigation', 'travel', 'utilities'],
    icons: [
      { src: `${BASE_PATH}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${BASE_PATH}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: `${BASE_PATH}/icon-512-maskable.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
