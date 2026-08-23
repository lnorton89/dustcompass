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
}

export default nextConfig
