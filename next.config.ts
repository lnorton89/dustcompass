import type { NextConfig } from 'next'

const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
const basePath = rawBasePath === '/' ? '' : rawBasePath.replace(/\/$/, '')

const nextConfig: NextConfig = {
  output: 'export',
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  /*
   * The dev overlay badge is fixed to the bottom-left corner, which is now
   * where the phone layout's first bottom-bar control is. In development it sat
   * on top of "Layers" and swallowed the tap; in the end-to-end scripts it
   * intercepted the click and failed the run. Every other corner is occupied
   * too — the map's own controls, the scale bar, the embargo notice — so the
   * badge is off rather than moved.
   */
  devIndicators: false,
}

export default nextConfig
