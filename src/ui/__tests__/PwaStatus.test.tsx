/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activateWaitingWorker, PwaStatus } from '../PwaStatus'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

interface Registration {
  waiting: ServiceWorker | null
  installing: ServiceWorker | null
  active: ServiceWorker | null
  addEventListener: (type: string, handler: () => void) => void
}

function installServiceWorkerMock(registration: Registration) {
  const messageListeners: ((event: MessageEvent) => void)[] = []
  const mock = {
    controller: null,
    addEventListener: (type: string, handler: (event: MessageEvent) => void) => {
      if (type === 'message') messageListeners.push(handler)
    },
    removeEventListener: () => {},
    register: vi.fn(() => Promise.resolve(registration)),
    get ready() {
      return Promise.resolve(registration)
    },
  }
  Object.defineProperty(navigator, 'serviceWorker', { value: mock, configurable: true })
  return {
    send: (data: unknown) => {
      for (const listener of messageListeners) listener({ data } as MessageEvent)
    },
  }
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
  window.dispatchEvent(new Event(value ? 'online' : 'offline'))
}

const registration = (overrides: Partial<Registration> = {}): Registration => ({
  waiting: null,
  installing: null,
  active: null,
  addEventListener: vi.fn(),
  ...overrides,
})

describe('PwaStatus · separated state dimensions', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
  })

  /**
   * CACHE_FAILED followed by offline → online used to promote straight to
   * "Ready offline" because the online handler treated any 'offline' status
   * as resolvable back to 'ready', without checking whether a cache had ever
   * actually finished installing.
   */
  it('does not report Ready offline after a failed install, even after an offline/online cycle', async () => {
    setOnline(true)
    const worker = installServiceWorkerMock(registration())
    render(<PwaStatus compact={false} />)

    await act(async () => {
      worker.send({ type: 'CACHE_FAILED', completed: 2, total: 5, url: '/x' })
    })
    expect(await screen.findByText('Not saved')).toBeDefined()

    await act(async () => setOnline(false))
    expect(screen.queryByText('Ready offline')).toBeNull()
    expect(screen.queryByText('Offline map')).toBeNull()

    await act(async () => setOnline(true))
    expect(screen.queryByText('Ready offline')).toBeNull()
    expect(await screen.findByText('Not saved')).toBeDefined()
  })

  /** An unsupported browser must not be promoted by network toggles either. */
  it('keeps reporting unsupported through offline/online toggles', async () => {
    setOnline(true)
    // jsdom does not implement service workers by default; a prior test in
    // this file may have defined one, so remove it rather than assume.
    delete (navigator as { serviceWorker?: unknown }).serviceWorker
    render(<PwaStatus compact={false} />)

    expect(await screen.findByText('Online only')).toBeDefined()

    await act(async () => setOnline(false))
    expect(screen.queryByText('Ready offline')).toBeNull()
    expect(screen.queryByText('Offline map')).toBeNull()

    await act(async () => setOnline(true))
    expect(await screen.findByText('Online only')).toBeDefined()
  })

  /** Going offline mid-install must not claim a complete saved map exists. */
  it('does not claim a saved map while the first install is still in progress', async () => {
    setOnline(true)
    const worker = installServiceWorkerMock(registration())
    render(<PwaStatus compact={false} />)

    await act(async () => {
      worker.send({ type: 'CACHE_PROGRESS', completed: 1, total: 10 })
    })
    expect(await screen.findByText(/Saving 1\/10/)).toBeDefined()

    await act(async () => setOnline(false))
    expect(screen.queryByText('Offline map')).toBeNull()
    expect(screen.queryByText('Ready offline')).toBeNull()
  })

  /**
   * A failed *update* while an older cache is already known-good must keep
   * reporting that the existing map works, not "Not saved" — which would
   * claim nothing is available at all.
   */
  it('reports an update failure separately from having nothing saved', async () => {
    setOnline(true)
    const postMessage = vi.fn()
    const worker = installServiceWorkerMock(
      registration({ active: { postMessage } as unknown as ServiceWorker }),
    )
    render(<PwaStatus compact={false} />)

    // The returning-session verification handshake (#58): the worker
    // confirms its precache is actually intact before this reports Ready.
    await act(async () => {
      worker.send({ type: 'OFFLINE_READY', total: 8 })
    })
    expect(await screen.findByText('Ready offline')).toBeDefined()

    await act(async () => {
      worker.send({ type: 'CACHE_FAILED', completed: 3, total: 8, url: '/y' })
    })

    expect(await screen.findByText('Update failed')).toBeDefined()
    expect(screen.queryByText('Not saved')).toBeNull()
  })

  /**
   * #58: an active service-worker registration is not proof the cache it
   * built is still intact — Cache Storage can be evicted under storage
   * pressure while the registration stays active. A returning session used
   * to treat `registration.active` alone as enough to claim "Ready
   * offline". It must instead ask the worker to verify itself and wait for
   * that verification to actually land.
   */
  it('does not report Ready offline from an active registration alone, before verification responds', async () => {
    setOnline(true)
    const postMessage = vi.fn()
    installServiceWorkerMock(registration({ active: { postMessage } as unknown as ServiceWorker }))
    render(<PwaStatus compact={false} />)

    // Give the registration/ready promise chain a tick to resolve.
    await act(async () => Promise.resolve())

    expect(postMessage).toHaveBeenCalledWith({ type: 'CHECK_OFFLINE_READY' })
    expect(screen.queryByText('Ready offline')).toBeNull()
  })
})

describe('activateWaitingWorker', () => {
  it('watches an uncontrolled waiting worker for activation before reloading', () => {
    const addEventListener = vi.fn()
    const postMessage = vi.fn()
    const worker = {
      state: 'installed',
      addEventListener,
      removeEventListener: vi.fn(),
      postMessage,
    } as unknown as ServiceWorker

    activateWaitingWorker(worker, false)

    expect(addEventListener).toHaveBeenCalledWith('statechange', expect.any(Function))
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  })

  it('relies on controllerchange when the current page is already controlled', () => {
    const addEventListener = vi.fn()
    const postMessage = vi.fn()
    const worker = {
      state: 'installed',
      addEventListener,
      removeEventListener: vi.fn(),
      postMessage,
    } as unknown as ServiceWorker

    activateWaitingWorker(worker, true)

    expect(addEventListener).not.toHaveBeenCalled()
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  })
})
