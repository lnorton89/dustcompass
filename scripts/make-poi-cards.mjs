#!/usr/bin/env node
/**
 * Render one share card per camp and art piece into public/share/.
 *
 * A link to a specific place should preview as that place. Sending someone
 * "here is where we are" and having it unfurl as the app's own front page
 * wastes the only thing the preview is for — the name and the address.
 *
 *   node scripts/make-poi-cards.mjs [year]
 *
 * A listing that already has a photo does not get a card: its own photo is the
 * better preview, and the metadata points social platforms straight at it. That
 * is not only cheaper, it handles the shapes — the photos are whatever the camp
 * uploaded, and every platform already letterboxes or crops to its own frame.
 * Rendering them into cards instead costs 317MB against 26MB, on a site that
 * rebuilds twice a day; set SHARE_CARDS=embed to do it anyway.
 *
 * These are for crawlers and are deliberately excluded from the offline
 * precache: nobody on playa needs a quarter of a gigabyte of share images.
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { poiOg } from './lib/poi-card.mjs'
import { releaseForYear } from './lib/api.mjs'

const YEAR = process.argv[2] ?? process.env.NEXT_PUBLIC_DATA_YEAR ?? '2026'
const ROOT = resolve(import.meta.dirname, '..')
const DATA = join(ROOT, 'public', 'data', YEAR)
const OUT = join(ROOT, 'public', 'share')
// Photos change far less often than the listings around them, and a scheduled
// rebuild runs twice a day. Keeping them out of the network path costs a few
// megabytes of disk and saves a thousand round trips.
const PHOTOS = join(ROOT, 'node_modules', '.cache', 'dust-compass-photos')

const FOOTNOTE = 'FREE COMMUNITY TOOL · NOT AFFILIATED WITH BURNING MAN'
const CONCURRENCY = 6
const EMBED_PHOTOS = process.env.SHARE_CARDS === 'embed'

// A card carries the address in ink. The fetcher strips embargoed locations
// before they reach disk, but this reads the file rather than the API, so it
// applies the same rule again rather than trusting the file it was handed.
const RELEASE = releaseForYear(YEAR)
const withheld = (kind) => new Date() < (kind === 'art' ? RELEASE.art : RELEASE.camp)

const read = async (name) => {
  const path = join(DATA, name)
  if (!existsSync(path)) return []
  const records = JSON.parse(await readFile(path, 'utf8'))
  const kind = name.startsWith('art') ? 'art' : 'camp'
  if (!withheld(kind)) return records
  return records.map((record) => ({ ...record, location_string: undefined }))
}

/** Widen serves whatever width is asked for; the card only shows 440. */
const photoUrl = (listing) => {
  const url = listing.images?.[0]?.thumbnail_url
  if (typeof url !== 'string') return undefined
  return url.replace(/\bw=\d+/, 'w=440')
}

async function photo(listing) {
  if (!EMBED_PHOTOS) return undefined
  const url = photoUrl(listing)
  if (!url) return undefined
  const cached = join(PHOTOS, `${listing.uid}.b64`)
  if (existsSync(cached)) return readFile(cached, 'utf8')
  try {
    const response = await fetch(url)
    if (!response.ok) return undefined
    const bytes = Buffer.from(await response.arrayBuffer())
    // Anything this small is a placeholder or an error page, not a photo.
    if (bytes.length < 1024) return undefined
    const type = response.headers.get('content-type') ?? 'image/jpeg'
    if (!type.startsWith('image/')) return undefined
    const uri = `data:${type};base64,${bytes.toString('base64')}`
    await writeFile(cached, uri)
    return uri
  } catch {
    return undefined
  }
}

const camps = await read('camp.json')
const art = await read('art.json')
if (camps.length === 0 && art.length === 0) {
  console.error(`No ${YEAR} listings in public/data. Run fetch-api or fetch-archive first.`)
  process.exit(2)
}

await mkdir(OUT, { recursive: true })
await mkdir(PHOTOS, { recursive: true })
// A listing that has gone away must not leave its card behind to be shared.
for (const stale of await readdir(OUT).catch(() => [])) {
  await rm(join(OUT, stale), { force: true })
}

const listings = [
  ...camps.map((camp) => ({ item: camp, kindLabel: 'THEME CAMP' })),
  ...art.map((piece) => ({ item: piece, kindLabel: 'PLAYA ART' })),
]
  .filter(({ item }) => item.uid && item.name)
  .filter(({ item }) => EMBED_PHOTOS || !photoUrl(item))

let done = 0
let withPhoto = 0
let bytes = 0

async function renderOne({ item, kindLabel }) {
  const image = await photo(item)
  if (image) withPhoto += 1
  const png = await poiOg.render({
    name: item.name,
    address: item.location_string,
    kindLabel,
    footnote: FOOTNOTE,
    fallbackLine:
      kindLabel === 'PLAYA ART'
        ? 'Location published when Gates open'
        : 'Location published closer to the event',
    alt: item.location_string ? `${item.name} — ${item.location_string}` : item.name,
    image,
  })
  await writeFile(join(OUT, `${item.uid}.png`), png)
  bytes += png.length
  done += 1
  if (done % 200 === 0) console.log(`  ${done}/${listings.length}`)
}

const queue = [...listings]
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const next = queue.shift()
      try {
        await renderOne(next)
      } catch (error) {
        console.warn(`  ! ${next.item.name}: ${error instanceof Error ? error.message : error}`)
      }
    }
  }),
)

console.log(
  `\nWrote ${done} share cards to public/share (${withPhoto} with a photo, ` +
    `${(bytes / 1024 / 1024).toFixed(0)}MB total).`,
)
