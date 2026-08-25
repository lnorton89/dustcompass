import { useEffect, useState } from 'react'
import { Alert, Box, Button, CircularProgress, Divider, Stack, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import DownloadIcon from '@mui/icons-material/Download'

const GUIDE_ZIP_URL = 'https://bm-innovate.s3.amazonaws.com/2026/2026-audio-tour-art-uid-mp3.zip'
const AUDIO_CACHE = 'dust-compass-audio-guide-2026'
const CENTRAL_DIRECTORY_TAIL_BYTES = 64 * 1024

interface ZipEntry {
  name: string
  compression: number
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
}

let guideIndexPromise: Promise<Map<string, ZipEntry>> | undefined

function readU16(view: DataView, offset: number): number {
  return view.getUint16(offset, true)
}

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, true)
}

function uidFromEntryName(name: string): string | undefined {
  const basename = name.split('/').pop() ?? ''
  if (!/\.mp3$/i.test(basename)) return undefined
  return basename.replace(/\.mp3$/i, '').trim().toLowerCase()
}

function parseCentralDirectory(bytes: ArrayBuffer): Map<string, ZipEntry> {
  const view = new DataView(bytes)
  const decoder = new TextDecoder()
  const entries = new Map<string, ZipEntry>()
  let offset = 0
  while (offset + 46 <= view.byteLength) {
    if (readU32(view, offset) !== 0x02014b50) break
    const compression = readU16(view, offset + 10)
    const compressedSize = readU32(view, offset + 20)
    const uncompressedSize = readU32(view, offset + 24)
    const nameLength = readU16(view, offset + 28)
    const extraLength = readU16(view, offset + 30)
    const commentLength = readU16(view, offset + 32)
    const localHeaderOffset = readU32(view, offset + 42)
    const nameStart = offset + 46
    const name = decoder.decode(new Uint8Array(bytes, nameStart, nameLength))
    const uid = uidFromEntryName(name)
    if (uid) {
      entries.set(uid, { name, compression, compressedSize, uncompressedSize, localHeaderOffset })
    }
    offset = nameStart + nameLength + extraLength + commentLength
  }
  return entries
}

function findEocd(bytes: ArrayBuffer): number {
  const view = new DataView(bytes)
  for (let offset = view.byteLength - 22; offset >= 0; offset -= 1) {
    if (readU32(view, offset) === 0x06054b50) return offset
  }
  return -1
}

async function fetchRange(start: number | undefined, end: number | undefined): Promise<Response> {
  const range = start === undefined
    ? `bytes=-${CENTRAL_DIRECTORY_TAIL_BYTES}`
    : `bytes=${start}-${end ?? ''}`
  const response = await fetch(GUIDE_ZIP_URL, { headers: { Range: range } })
  if (!response.ok) throw new Error(`Audio guide request failed (${response.status})`)
  return response
}

async function loadGuideIndex(): Promise<Map<string, ZipEntry>> {
  if (!guideIndexPromise) {
    guideIndexPromise = (async () => {
      const tailResponse = await fetchRange(undefined, undefined)
      const tail = await tailResponse.arrayBuffer()
      const eocdOffset = findEocd(tail)
      if (eocdOffset < 0) throw new Error('Audio guide ZIP directory was not found')

      const eocd = new DataView(tail)
      const centralSize = readU32(eocd, eocdOffset + 12)
      const centralOffset = readU32(eocd, eocdOffset + 16)
      const contentRange = tailResponse.headers.get('content-range')
      const rangeMatch = contentRange?.match(/^bytes\s+(\d+)-(\d+)\/(\d+)$/i)

      if (rangeMatch) {
        const tailStart = Number(rangeMatch[1])
        const relativeStart = centralOffset - tailStart
        if (relativeStart >= 0 && relativeStart + centralSize <= tail.byteLength) {
          return parseCentralDirectory(tail.slice(relativeStart, relativeStart + centralSize))
        }
      }

      const directoryResponse = await fetchRange(centralOffset, centralOffset + centralSize - 1)
      return parseCentralDirectory(await directoryResponse.arrayBuffer())
    })().catch((error) => {
      guideIndexPromise = undefined
      throw error
    })
  }
  return guideIndexPromise
}

function cacheKey(uid: string): string {
  return `${location.origin}/__dust-compass-audio-guide/2026/${encodeURIComponent(uid)}.mp3`
}

async function cachedTrack(uid: string): Promise<Response | undefined> {
  if (!('caches' in window)) return undefined
  const cache = await caches.open(AUDIO_CACHE)
  return (await cache.match(cacheKey(uid))) ?? undefined
}

async function inflateDeflateRaw(bytes: Uint8Array): Promise<ArrayBuffer> {
  if (!('DecompressionStream' in window)) throw new Error('This browser cannot unpack the official audio guide')
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const stream = new Blob([copy.buffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Response(stream).arrayBuffer()
}

async function downloadTrack(uid: string, entry: ZipEntry): Promise<Response> {
  const existing = await cachedTrack(uid)
  if (existing) return existing

  const headerResponse = await fetchRange(entry.localHeaderOffset, entry.localHeaderOffset + 29)
  const header = await headerResponse.arrayBuffer()
  const headerView = new DataView(header)
  if (readU32(headerView, 0) !== 0x04034b50) throw new Error('Invalid audio guide ZIP entry')
  const nameLength = readU16(headerView, 26)
  const extraLength = readU16(headerView, 28)
  const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength
  const compressedResponse = await fetchRange(dataStart, dataStart + entry.compressedSize - 1)
  const compressed = new Uint8Array(await compressedResponse.arrayBuffer())

  let audioBytes: ArrayBuffer
  if (entry.compression === 0) {
    audioBytes = compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength)
  } else if (entry.compression === 8) {
    audioBytes = await inflateDeflateRaw(compressed)
  } else {
    throw new Error(`Unsupported ZIP compression method ${entry.compression}`)
  }

  const response = new Response(audioBytes, {
    headers: {
      'content-type': 'audio/mpeg',
      'content-length': String(entry.uncompressedSize),
      'x-dust-compass-source': GUIDE_ZIP_URL,
    },
  })
  if ('caches' in window) {
    const cache = await caches.open(AUDIO_CACHE)
    await cache.put(cacheKey(uid), response.clone())
  }
  return response
}

async function removeTrack(uid: string): Promise<void> {
  if (!('caches' in window)) return
  const cache = await caches.open(AUDIO_CACHE)
  await cache.delete(cacheKey(uid))
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function ArtAudioGuide({ uid }: { uid: string }) {
  const [entry, setEntry] = useState<ZipEntry>()
  const [checking, setChecking] = useState(true)
  const [downloaded, setDownloaded] = useState(false)
  const [savedSize, setSavedSize] = useState<number>()
  const [busy, setBusy] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | undefined
    setEntry(undefined)
    setChecking(true)
    setDownloaded(false)
    setSavedSize(undefined)
    setAudioUrl(undefined)
    setError(undefined)

    void (async () => {
      try {
        // A saved track is self-sufficient. Do not make playback depend on
        // re-fetching the remote ZIP directory: a fresh launch on playa must
        // be able to render and play the bytes already stored on this device
        // even when there is no network at all (#99).
        const cached = await cachedTrack(uid)
        if (cancelled) return
        if (cached) {
          const blob = await cached.blob()
          if (cancelled) return
          objectUrl = URL.createObjectURL(blob)
          setAudioUrl(objectUrl)
          setSavedSize(Number(cached.headers.get('content-length')) || blob.size)
          setDownloaded(true)
          setChecking(false)
          return
        }

        // Only unsaved tracks need the official remote index for discovery.
        const index = await loadGuideIndex()
        if (cancelled) return
        setEntry(index.get(uid.toLowerCase()))
        setChecking(false)
      } catch (reason) {
        if (!cancelled) {
          setChecking(false)
          setError(reason instanceof Error ? reason.message : 'Audio guide is unavailable')
        }
      }
    })()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [uid])

  if (checking) return null
  if (!entry && !downloaded) return null

  const save = async () => {
    if (!entry) return
    setBusy(true)
    setError(undefined)
    try {
      const response = await downloadTrack(uid, entry)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      setAudioUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous)
        return url
      })
      setSavedSize(Number(response.headers.get('content-length')) || blob.size)
      setDownloaded(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Audio download failed')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await removeTrack(uid)
      setDownloaded(false)
      setSavedSize(undefined)
      setAudioUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous)
        return undefined
      })
    } finally {
      setBusy(false)
    }
  }

  const size = entry?.uncompressedSize ?? savedSize ?? 0

  return (
    <>
      <Divider sx={{ my: 2 }} />
      <Stack spacing={1}>
        <Box>
          <Typography variant="subtitle2">Official Art Discovery Audio Guide</Typography>
          <Typography variant="caption" color="text.secondary">
            2026 Burning Man guide · {formatBytes(size)}
            {downloaded ? ' · saved offline' : ' · optional download'}
          </Typography>
        </Box>
        {audioUrl && (
          <Box component="audio" controls preload="metadata" src={audioUrl} sx={{ width: '100%' }} />
        )}
        <Button
          size="small"
          variant={downloaded ? 'outlined' : 'contained'}
          startIcon={busy ? <CircularProgress size={16} /> : downloaded ? <CloseIcon /> : <DownloadIcon />}
          onClick={() => void (downloaded ? remove() : save())}
          disabled={busy}
        >
          {downloaded ? 'Remove offline audio' : 'Download for offline'}
        </Button>
        {error && <Alert severity="warning">{error}</Alert>}
      </Stack>
    </>
  )
}

export const __audioGuideTest = { parseCentralDirectory, uidFromEntryName, findEocd }
