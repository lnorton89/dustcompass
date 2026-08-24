import { useEffect, useMemo, useState } from 'react'
import { Box, Chip, Tooltip, Typography } from '@mui/material'
import CloudDoneIcon from '@mui/icons-material/CloudDone'
import CloudOffIcon from '@mui/icons-material/CloudOff'
import DownloadingIcon from '@mui/icons-material/Downloading'
import NewReleasesIcon from '@mui/icons-material/NewReleases'
import SyncProblemIcon from '@mui/icons-material/SyncProblem'
import { BASE_PATH, DATA_YEAR, assetUrl } from '../config'

type Support = 'checking' | 'supported' | 'unsupported'
type WorkerMessage =
  | { type: 'CACHE_PROGRESS'; completed: number; total: number }
  | { type: 'OFFLINE_READY'; total: number }
  | { type: 'CACHE_FAILED'; completed: number; total: number; url: string }
  | { type: 'DATA_REFRESHED' }

/**
 * Connectivity, worker support, install progress and cache readiness used to
 * live in one `status` string, with the online/offline listeners free to
 * overwrite whichever value happened to be there. That produced several false
 * readings: going offline during a failed install claimed a usable saved map
 * existed; coming back online promoted an unsupported browser or an
 * incomplete cache straight to "Ready offline". Tracked as separate
 * dimensions, a network event can only ever change `online`.
 */
interface PwaState {
  online: boolean
  support: Support
  /** True once *some* worker of the current version has fully installed. */
  cacheReady: boolean
  /** A precache attempt (first install or an update) is in progress. */
  installing: boolean
  /** The most recent precache attempt failed. Cleared by the next attempt or a success. */
  installFailed: boolean
  progress?: { completed: number; total: number }
  waiting?: ServiceWorker
}

type Status = 'checking' | 'caching' | 'ready' | 'offline' | 'update' | 'incomplete' | 'updateFailed' | 'unsupported'

/** What the chip/status line shows, derived from every dimension at once. */
function deriveStatus(state: PwaState): Status {
  if (state.support === 'checking') return 'checking'
  if (state.support === 'unsupported') return 'unsupported'
  if (state.waiting) return 'update'
  if (state.installing) return 'caching'
  // A failed attempt with no ready cache behind it is a real "nothing is
  // saved" state. A failed *update* attempt with an already-ready cache
  // means the existing offline map still works — that is worth saying
  // differently from "Not saved", which would claim it does not.
  if (state.installFailed) return state.cacheReady ? 'updateFailed' : 'incomplete'
  if (!state.online) return state.cacheReady ? 'offline' : 'checking'
  return state.cacheReady ? 'ready' : 'checking'
}

export function PwaStatus({ compact }: { compact: boolean }) {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const [support, setSupport] = useState<Support>(initialSupport)
  const [cacheReady, setCacheReady] = useState(() => process.env.NODE_ENV !== 'production')
  const [installing, setInstalling] = useState(false)
  const [installFailed, setInstallFailed] = useState(false)
  const [progress, setProgress] = useState<{ completed: number; total: number }>()
  const [waiting, setWaiting] = useState<ServiceWorker>()

  useEffect(() => {
    // Network events change connectivity only. They must never manufacture
    // or erase cache readiness — that is what silently turned an incomplete
    // or unsupported install into "Ready offline" the moment a device came
    // back online.
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)

    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) {
      return () => {
        window.removeEventListener('online', goOnline)
        window.removeEventListener('offline', goOffline)
      }
    }

    const hadController = Boolean(navigator.serviceWorker.controller)
    let refreshing = false
    const controllerChanged = () => {
      if (!hadController || refreshing) return
      refreshing = true
      window.location.reload()
    }
    const message = (event: MessageEvent) => {
      if (!isWorkerMessage(event.data)) return
      if (event.data.type === 'CACHE_PROGRESS') {
        setProgress({ completed: event.data.completed, total: event.data.total })
        setInstalling(true)
        setInstallFailed(false)
      }
      if (event.data.type === 'CACHE_FAILED') {
        // The install aborted, so no worker will ever activate from it. Say
        // so instead of leaving a progress count frozen at the number it
        // died on — but do not touch `cacheReady`: whatever cache an older,
        // still-active worker already has is untouched by this failure.
        setProgress({ completed: event.data.completed, total: event.data.total })
        setInstalling(false)
        setInstallFailed(true)
      }
      if (event.data.type === 'OFFLINE_READY') {
        setCacheReady(true)
        setInstalling(false)
        setInstallFailed(false)
        setProgress(undefined)
      }
    }
    navigator.serviceWorker.addEventListener('controllerchange', controllerChanged)
    navigator.serviceWorker.addEventListener('message', message)

    setSupport('supported')
    void navigator.serviceWorker
      .register(assetUrl('sw.js'), { scope: `${BASE_PATH}/` })
      .then((registration) => {
        const inspect = () => {
          if (registration.waiting) setWaiting(registration.waiting)
        }
        inspect()
        registration.addEventListener('updatefound', () => {
          setInstalling(true)
          registration.installing?.addEventListener('statechange', inspect)
        })
        return navigator.serviceWorker.ready
      })
      .then((registration) => {
        // A returning session has no fresh OFFLINE_READY to listen for — that
        // only ever broadcasts at the moment *this* worker activates, which
        // for an already-installed worker already happened in an earlier
        // page load. An active registration is not proof the cache it built
        // is still intact, though: Cache Storage can be evicted under
        // storage pressure while the worker stays active (#58). Ask the
        // worker to verify (and, if needed, repair) its own precache rather
        // than assuming — it reports back through the same CACHE_PROGRESS/
        // CACHE_FAILED/OFFLINE_READY messages a real install uses, handled
        // by the listener above, so `cacheReady` stays false (and the chip
        // stays in a checking/caching state) until that verification lands.
        registration.active?.postMessage({ type: 'CHECK_OFFLINE_READY' })
      })
      .catch(() => setSupport('unsupported'))

    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      navigator.serviceWorker.removeEventListener('controllerchange', controllerChanged)
      navigator.serviceWorker.removeEventListener('message', message)
    }
  }, [])

  const status = useMemo(
    () => deriveStatus({ online, support, cacheReady, installing, installFailed, progress, waiting }),
    [online, support, cacheReady, installing, installFailed, progress, waiting],
  )

  const view = statusView(status, progress)
  const title = `${view.detail} · ${DATA_YEAR} map`
  const description = `${view.label}. ${view.detail}. ${DATA_YEAR} map data.`

  // Only these want anything from the user, and only those are shaped like a
  // button. Wearing the same pill for "everything is fine" put a permanent
  // green control in the toolbar that did nothing when pressed and
  // outshouted the filters beside it.
  if (status === 'update' || status === 'incomplete' || status === 'updateFailed') {
    return (
      <Tooltip title={title}>
        <Chip
          size="small"
          color={view.color}
          variant="filled"
          icon={view.icon}
          label={compact ? undefined : view.label}
          aria-label={description}
          onClick={
            waiting
              ? () => waiting.postMessage({ type: 'SKIP_WAITING' })
              : // A failed install leaves no worker to message; registering
                // again on load is what starts a fresh attempt.
                () => window.location.reload()
          }
          sx={{
            fontWeight: 600,
            ...(compact && {
              // Below 44px this is a real, clickable control (it retries a
              // failed install or applies a waiting update) narrower than the
              // touch-target floor everything else in the toolbar keeps.
              width: 44,
              justifyContent: 'center',
              // With no label text MUI still renders the label element, and
              // its 8px of padding shoulders the icon off-centre. Auto
              // margins cannot win against a sibling that is still 16px wide.
              '& .MuiChip-label': { display: 'none' },
              '& .MuiChip-icon': { m: 0 },
            }),
          }}
        />
      </Tooltip>
    )
  }

  return (
    <Tooltip title={title}>
      <Box
        role="status"
        aria-label={description}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.65,
          flexShrink: 0,
          cursor: 'default',
          color: 'text.secondary',
        }}
      >
        <Box sx={{ display: 'flex', color: view.tone, '& svg': { display: 'block', fontSize: 18 } }}>
          {view.icon}
        </Box>
        {!compact && (
          <Typography variant="caption" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
            {view.label}
          </Typography>
        )}
      </Box>
    </Tooltip>
  )
}

function initialSupport(): Support {
  if (typeof navigator === 'undefined') return 'checking'
  if (process.env.NODE_ENV !== 'production') return 'supported'
  return 'serviceWorker' in navigator ? 'checking' : 'unsupported'
}

function isWorkerMessage(value: unknown): value is WorkerMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false
  const candidate = value as Partial<WorkerMessage>
  if (candidate.type === 'OFFLINE_READY') return typeof candidate.total === 'number'
  if (candidate.type === 'DATA_REFRESHED') return true
  if (candidate.type !== 'CACHE_PROGRESS' && candidate.type !== 'CACHE_FAILED') return false
  return typeof candidate.completed === 'number' && typeof candidate.total === 'number'
}

/**
 * `color` is the MUI palette slot for the states that render as a button.
 * `tone` is what the quiet states tint their icon with — deliberately not
 * `success.main`, which was the only green in an app that is otherwise entirely
 * amber, teal and, at night, a single low red.
 */
function statusView(status: Status, progress?: { completed: number; total: number }) {
  switch (status) {
    case 'caching':
    case 'checking':
      return {
        label: progress ? `Saving ${progress.completed}/${progress.total}` : 'Preparing offline',
        detail: 'Keep this tab open while the map is saved',
        color: 'default' as const,
        tone: 'text.secondary',
        icon: <DownloadingIcon />,
      }
    case 'offline':
      return { label: 'Offline map', detail: 'Using the saved map', color: 'warning' as const, tone: 'warning.main', icon: <CloudOffIcon /> }
    case 'update':
      return { label: 'Update ready', detail: 'Tap to load the newest map', color: 'primary' as const, tone: 'primary.main', icon: <NewReleasesIcon /> }
    case 'incomplete':
      return {
        label: 'Not saved',
        detail: progress
          ? `Only ${progress.completed} of ${progress.total} pieces saved. Tap to try again while you have signal`
          : 'The map is not saved for offline use. Tap to try again while you have signal',
        color: 'error' as const,
        tone: 'error.main',
        icon: <SyncProblemIcon />,
      }
    case 'updateFailed':
      return {
        label: 'Update failed',
        detail: progress
          ? `Only ${progress.completed} of ${progress.total} pieces of the newest map saved — the version already on this device still works offline. Tap to try again`
          : 'The newest map could not be saved — the version already on this device still works offline. Tap to try again',
        color: 'warning' as const,
        tone: 'warning.main',
        icon: <SyncProblemIcon />,
      }
    case 'unsupported':
      return { label: 'Online only', detail: 'Offline saving is unavailable', color: 'warning' as const, tone: 'warning.main', icon: <CloudOffIcon /> }
    default:
      return { label: 'Ready offline', detail: 'Map saved on this device', color: 'success' as const, tone: 'text.secondary', icon: <CloudDoneIcon /> }
  }
}
