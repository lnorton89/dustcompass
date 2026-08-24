import { readFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import type { Metadata } from 'next'
import { socialImageMetadata } from 'metaplate'
import { BRAND } from '../../../brand'
import { BASE_PATH, DATA_YEAR, SITE_URL } from '../../../config'
import { embargoState, embargoWindowForYear } from '../../../data/embargo'
import { ShareRedirect } from './ShareRedirect'

/**
 * A page per camp and art piece, so a shared link previews as that place
 * rather than as the app's front door. Nobody is meant to read it: it exists
 * for the crawler that unfurls the link, and sends a person straight on to the
 * map with that place selected.
 */
export const dynamic = 'force-static'

type Listing = {
  uid: string
  name: string
  location_string?: string
  description?: string
  hometown?: string
  images?: { thumbnail_url?: string }[]
}

const listings = (): { item: Listing; kind: 'camp' | 'art' }[] => {
  const read = (name: string): Listing[] => {
    const path = `public/data/${DATA_YEAR}/${name}`
    if (!existsSync(path)) return []
    return JSON.parse(readFileSync(path, 'utf8')) as Listing[]
  }
  /**
   * These pages are a publishing path in their own right — metadata, a visible
   * address and a rendered card — and they were reading the listings without
   * the check the map applies. Nothing leaks today because the fetcher strips
   * embargoed locations before they reach disk, but a second layer that only
   * covers one of two exits is not a second layer.
   */
  const released = embargoState(embargoWindowForYear(DATA_YEAR))
  const withhold = (item: Listing): Listing => ({ ...item, location_string: undefined })
  return [
    ...read('camp.json').map((item) => ({
      item: released.campsReleased ? item : withhold(item),
      kind: 'camp' as const,
    })),
    ...read('art.json').map((item) => ({
      item: released.artReleased ? item : withhold(item),
      kind: 'art' as const,
    })),
  ].filter(({ item }) => item.uid && item.name)
}

const find = (uid: string) => listings().find((entry) => entry.item.uid === uid)

/** The photo a listing carries is a better preview than anything drawn for it. */
const photoOf = (item: Listing) => {
  const url = item.images?.[0]?.thumbnail_url
  return typeof url === 'string' ? url.replace(/\bw=\d+/, 'w=1200') : undefined
}

export function generateStaticParams() {
  return listings().map(({ item }) => ({ uid: item.uid }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ uid: string }>
}): Promise<Metadata> {
  const { uid } = await params
  const entry = find(uid)
  if (!entry) return { title: BRAND.name }

  const { item, kind } = entry
  const where = item.location_string
    ? `${item.location_string} · Black Rock City`
    : kind === 'art'
      ? 'Location published when Gates open'
      : 'Location published closer to the event'
  const description = [where, item.description?.trim()].filter(Boolean).join(' — ').slice(0, 300)
  const alt = item.location_string ? `${item.name} — ${item.location_string}` : item.name
  const url = `${SITE_URL.replace(/\/$/, '')}/p/${uid}/`

  const photo = photoOf(item)
  const social = photo
    ? {
        openGraph: { images: [{ url: photo, alt }] },
        twitter: { card: 'summary_large_image' as const, images: [{ url: photo, alt }] },
      }
    : socialImageMetadata('/', alt, { basePath: BASE_PATH, imagePath: `share/${uid}.png` })

  return {
    title: `${item.name} — ${BRAND.name}`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      siteName: BRAND.name,
      title: item.name,
      description,
      url,
      ...social.openGraph,
    },
    twitter: { title: item.name, description, ...social.twitter },
  }
}

export default async function SharePage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params
  const entry = find(uid)
  return <ShareRedirect uid={uid} name={entry?.item.name} address={entry?.item.location_string} />
}
