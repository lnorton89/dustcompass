import { useEffect, useState } from 'react'
import { Chip, Tooltip } from '@mui/material'
import CloudDoneIcon from '@mui/icons-material/CloudDone'
import CloudOffIcon from '@mui/icons-material/CloudOff'
import DownloadingIcon from '@mui/icons-material/Downloading'
import NewReleasesIcon from '@mui/icons-material/NewReleases'
import SyncProblemIcon from '@mui/icons-material/SyncProblem'
import { BASE_PATH, DATA_YEAR, assetUrl } from '../config'

type Status = 'checking' | 'caching' | 'ready' | 'offline' | 'update' | 'incomplete' | 'unsupported'
type WorkerMessage =
  | { type: 'CACHE_PROGRESS'; completed: number; total: number }
  | { type: 'OFFLINE_READY'; total: number }
  | { type: 'CACHE_FAILED'; completed: number; total: number; url: string }

export function PwaStatus({ compact }: { compact: boolean }) {
  const [status, setStatus] = useState<Status>(initialStatus)
  const [progress, setProgress] = useState<{ completed: number; total: number }>()
  const [waiting, setWaiting] = useState<ServiceWorker>()

  useEffect(() => {
    const online = () => setStatus((current) => (current === 'offline' ? 'ready' : current))
    const offline = () => setStatus('offline')
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)

    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) {
      return () => {
        window.removeEventListener('online', online)
        window.removeEventListener('offline', offline)
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
        setStatus('caching')
      }
      if (event.data.type === 'CACHE_FAILED') {
        // The install aborted, so no worker will ever activate. Say so instead
        // of leaving a progress count frozen at the number it died on.
        setProgress({ completed: event.data.completed, total: event.data.total })
        setStatus('incomplete')
      }
      if (event.data.type === 'OFFLINE_READY') setStatus(navigator.onLine ? 'ready' : 'offline')
    }
    navigator.serviceWorker.addEventListener('controllerchange', controllerChanged)
    navigator.serviceWorker.addEventListener('message', message)

    void navigator.serviceWorker.register(assetUrl('sw.js'), { scope: `${BASE_PATH}/` }).then((registration) => {
      const inspect = () => {
        if (registration.waiting) {
          setWaiting(registration.waiting)
          setStatus('update')
        }
      }
      inspect()
      registration.addEventListener('updatefound', () => {
        setStatus('caching')
        registration.installing?.addEventListener('statechange', inspect)
      })
      return navigator.serviceWorker.ready
    }).then(() => setStatus((current) =>
      current === 'update' || current === 'incomplete'
        ? current
        : navigator.onLine
          ? 'ready'
          : 'offline',
    ))
      .catch(() => setStatus('unsupported'))

    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
      navigator.serviceWorker.removeEventListener('controllerchange', controllerChanged)
      navigator.serviceWorker.removeEventListener('message', message)
    }
  }, [])

  const view = statusView(status, progress)
  return (
    <Tooltip title={`${view.detail} · ${DATA_YEAR} map`}>
      <Chip
        size="small"
        color={view.color}
        variant={status === 'ready' ? 'outlined' : 'filled'}
        icon={view.icon}
        label={compact ? undefined : view.label}
        aria-label={`${view.label}. ${view.detail}. ${DATA_YEAR} map data.`}
        onClick={
          waiting
            ? () => waiting.postMessage({ type: 'SKIP_WAITING' })
            : status === 'incomplete'
              ? // A failed install leaves no worker to message; registering
                // again on load is what starts a fresh attempt.
                () => window.location.reload()
              : undefined
        }
        sx={
          compact
            ? {
                width: 32,
                justifyContent: 'center',
                // With no label text MUI still renders the label element, and
                // its 8px of padding shoulders the icon off-centre. Auto
                // margins cannot win against a sibling that is still 16px wide.
                '& .MuiChip-label': { display: 'none' },
                '& .MuiChip-icon': { m: 0 },
              }
            : undefined
        }
      />
    </Tooltip>
  )
}

function initialStatus(): Status {
  if (typeof navigator === 'undefined') return 'checking'
  if (!navigator.onLine) return 'offline'
  if (process.env.NODE_ENV !== 'production') return 'ready'
  return 'serviceWorker' in navigator ? 'checking' : 'unsupported'
}

function isWorkerMessage(value: unknown): value is WorkerMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false
  const candidate = value as Partial<WorkerMessage>
  if (candidate.type === 'OFFLINE_READY') return typeof candidate.total === 'number'
  if (candidate.type !== 'CACHE_PROGRESS' && candidate.type !== 'CACHE_FAILED') return false
  return typeof candidate.completed === 'number' && typeof candidate.total === 'number'
}

function statusView(status: Status, progress?: { completed: number; total: number }) {
  switch (status) {
    case 'caching':
    case 'checking':
      return {
        label: progress ? `Saving ${progress.completed}/${progress.total}` : 'Preparing offline',
        detail: 'Keep this tab open while the map is saved',
        color: 'default' as const,
        icon: <DownloadingIcon />,
      }
    case 'offline':
      return { label: 'Offline map', detail: 'Using the saved map', color: 'warning' as const, icon: <CloudOffIcon /> }
    case 'update':
      return { label: 'Update ready', detail: 'Tap to load the newest map', color: 'primary' as const, icon: <NewReleasesIcon /> }
    case 'incomplete':
      return {
        label: 'Not saved',
        detail: progress
          ? `Only ${progress.completed} of ${progress.total} pieces saved. Tap to try again while you have signal`
          : 'The map is not saved for offline use. Tap to try again while you have signal',
        color: 'error' as const,
        icon: <SyncProblemIcon />,
      }
    case 'unsupported':
      return { label: 'Online only', detail: 'Offline saving is unavailable', color: 'warning' as const, icon: <CloudOffIcon /> }
    default:
      return { label: 'Ready offline', detail: 'Map saved on this device', color: 'success' as const, icon: <CloudDoneIcon /> }
  }
}
