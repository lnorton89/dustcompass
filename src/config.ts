export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/$/, '')
export const DATA_YEAR = process.env.NEXT_PUBLIC_DATA_YEAR ?? '2025'
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lnorton89.github.io/dustcompass/'

export function assetUrl(path: string): string {
  return `${BASE_PATH}/${path.replace(/^\/+/, '')}`
}
