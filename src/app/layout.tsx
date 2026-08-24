import type { Metadata, Viewport } from 'next'
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter'
import { socialImageMetadata } from 'metaplate'
import { BRAND } from '../brand'
import { BASE_PATH, SITE_URL } from '../config'
import './globals.css'
import 'maplibre-gl/dist/maplibre-gl.css'

// The card is a real file under the deployment prefix, not a Next
// `opengraph-image` route: that convention emits an extension-free file and a
// URL without `basePath`, which GitHub Pages cannot serve.
const social = socialImageMetadata(
  '/',
  `${BRAND.name} — ${BRAND.tagline}`,
  { basePath: BASE_PATH, imagePath: 'og-image.png' },
)

export const metadata: Metadata = {
  metadataBase: new URL(new URL(SITE_URL).origin),
  title: `${BRAND.name} — Offline playa map`,
  description: BRAND.description,
  applicationName: BRAND.name,
  manifest: `${BASE_PATH}/manifest.webmanifest`,
  alternates: { canonical: SITE_URL },
  icons: {
    icon: [
      { url: `${BASE_PATH}/favicon.svg`, type: 'image/svg+xml' },
      { url: `${BASE_PATH}/favicon-32.png`, sizes: '32x32', type: 'image/png' },
    ],
    shortcut: `${BASE_PATH}/favicon.ico`,
    apple: [{ url: `${BASE_PATH}/apple-touch-icon.png`, sizes: '180x180' }],
  },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: BRAND.name },
  openGraph: {
    type: 'website',
    siteName: BRAND.name,
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: BRAND.description,
    url: SITE_URL,
    ...social.openGraph,
  },
  twitter: {
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: BRAND.description,
    ...social.twitter,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#12100e',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {/* Without this, Emotion's style-insertion order can diverge between
            the prerendered HTML and the client's first hydration pass — a
            genuine hydration mismatch on every load, not merely a flash of
            unstyled content. This streams the collected styles into <head>
            during SSR so the client's first paint sees exactly what the
            server already rendered. */}
        <AppRouterCacheProvider options={{ key: 'mui' }}>{children}</AppRouterCacheProvider>
      </body>
    </html>
  )
}
