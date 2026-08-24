/**
 * `build-sw.mjs` writes its worker as a big generated string, so a bug in it
 * only shows up once that string actually runs as a service worker — nothing
 * about it is type-checked or unit-tested otherwise. These tests generate the
 * real worker against a scratch build output, then execute it in a sandboxed
 * `vm` context against a small in-memory Cache Storage double, so the install
 * failure and live-data revalidation paths are exercised as real code rather
 * than reasoned about from reading the template.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

/** Generates the real service worker once against a minimal `out/` tree. */
function generateWorker() {
  const dir = mkdtempSync(join(tmpdir(), 'dustcompass-sw-'))
  mkdirSync(join(dir, 'out', 'data', '2025'), { recursive: true })
  writeFileSync(join(dir, 'out', 'index.html'), '<html></html>')
  writeFileSync(join(dir, 'out', 'data', '2025', 'layout.json'), '{}')
  writeFileSync(join(dir, 'out', 'data', '2025', 'camp.json'), '[]')
  execFileSync(process.execPath, [join(repoRoot, 'scripts', 'build-sw.mjs')], { cwd: dir })
  const source = readFileSync(join(dir, 'out', 'sw.js'), 'utf8')
  rmSync(dir, { recursive: true, force: true })
  return source
}

let workerSource

beforeAll(() => {
  workerSource = generateWorker()
})

const ORIGIN = 'https://dustcompass.test'

// The real Cache API resolves a plain string (or a Request with a relative
// URL) against the worker's own origin before using it as a key — which is
// exactly why a precache entry stored as the relative path "/" is found by a
// fetch event whose request.url is absolute. This double keeps that
// normalization so both sides of the real code path line up here too.
const keyFor = (request) => {
  const raw = typeof request === 'string' ? request : request.url
  try {
    return new URL(raw, ORIGIN).href
  } catch {
    return raw
  }
}

class FakeCache {
  constructor({ failPutAfter } = {}) {
    this.store = new Map()
    // Lets a test simulate a `cache.put()` that fails independently of a
    // successful fetch (storage quota, eviction) — the failure mode #47 is
    // about. `undefined` means puts never fail; otherwise this many succeed
    // before every later one throws.
    this.failPutAfter = failPutAfter
    this.putCount = 0
  }
  async match(request) {
    // A real Cache.match() hands back a Response whose body has never been
    // read, independent of any earlier match() call — cloning here mirrors
    // that so a stored entry can be matched (and its body read) more than
    // once, the way the pointer record and revision entries both are here.
    const stored = this.store.get(keyFor(request))
    return stored ? stored.clone() : undefined
  }
  async put(request, response) {
    if (this.failPutAfter !== undefined && this.putCount >= this.failPutAfter) {
      throw new Error('simulated storage failure')
    }
    this.putCount += 1
    this.store.set(keyFor(request), response)
  }
  async keys() {
    return [...this.store.keys()]
  }
}

class FakeCacheStorage {
  /** `failPut` is an optional `(cacheName) => number | undefined` deciding each new cache's `failPutAfter`. */
  constructor({ failPut } = {}) {
    this.byName = new Map()
    this.failPut = failPut
  }
  async open(name) {
    if (!this.byName.has(name)) {
      this.byName.set(name, new FakeCache({ failPutAfter: this.failPut?.(name) }))
    }
    return this.byName.get(name)
  }
  async has(name) {
    return this.byName.has(name)
  }
  async delete(name) {
    return this.byName.delete(name)
  }
  async keys() {
    return [...this.byName.keys()]
  }
}

/**
 * Real `Request`/`Response` objects insist on an absolute URL to construct,
 * which the precache list deliberately is not (its entries are resolved
 * against the worker's own origin, same as in a real browser). This stand-in
 * only needs to carry `.url` through to the fetch mock and the fake cache.
 */
class FakeRequest {
  constructor(url, init = {}) {
    this.url = typeof url === 'string' ? url : url.url
    this.method = init.method ?? 'GET'
    this.mode = init.mode
  }
}

// Two refreshLiveData() calls in the same test can otherwise land in the
// same real millisecond and mint the identical revision cache name, which
// would make a "second refresh" silently reuse the first revision's cache
// object instead of a fresh one.
let fakeClock = 1700000000000

/** Runs the generated worker source in a fresh sandboxed scope. */
function loadWorker({ fetchImpl, cacheStorage }) {
  const handlers = {}
  const notifications = []
  const sandbox = {
    console,
    Request: FakeRequest,
    Response,
    AbortSignal,
    URL,
    setTimeout,
    Date: { now: () => (fakeClock += 1) },
    fetch: (...args) => fetchImpl(...args),
    caches: cacheStorage ?? new FakeCacheStorage(),
    self: undefined,
  }
  sandbox.self = {
    addEventListener: (type, handler) => {
      handlers[type] = handler
    },
    clients: {
      matchAll: async () => [{ postMessage: (message) => notifications.push(message) }],
      claim: async () => {},
    },
    location: { origin: ORIGIN },
    skipWaiting: async () => {},
  }
  vm.createContext(sandbox)
  vm.runInContext(workerSource, sandbox)

  const fireInstall = async () => {
    let promise
    await handlers.install({ waitUntil: (p) => (promise = p) })
    return promise
  }
  const fireActivate = async () => {
    let promise
    await handlers.activate({ waitUntil: (p) => (promise = p) })
    return promise
  }
  const fireFetch = async (path, init) => {
    let promise
    // A real intercepted fetch event's request.url is always absolute.
    const request = new FakeRequest(new URL(path, ORIGIN).href, init)
    await handlers.fetch({
      request,
      respondWith: (p) => (promise = p),
      waitUntil: (p) => p, // background work is awaited explicitly in tests where it matters
    })
    return promise
  }

  return { caches: sandbox.caches, notifications, fireInstall, fireActivate, fireFetch }
}

const dataUrl = (name) => `/data/2025/${name}`

const POINTER_CACHE = 'dust-compass-live-pointer'
const POINTER_URL = `${ORIGIN}/__dust-compass-live-revision`

/** The revision cache the pointer currently names, or undefined if none has ever promoted. */
async function currentLiveRevision(worker) {
  const pointer = await worker.caches.open(POINTER_CACHE)
  const record = await pointer.match(POINTER_URL)
  return record ? record.text() : undefined
}

describe('generated service worker', () => {
  it('is valid, executable JavaScript', () => {
    expect(() => new vm.Script(workerSource)).not.toThrow()
  })

  it('precaches every asset and reports OFFLINE_READY on a clean install', async () => {
    const worker = loadWorker({ fetchImpl: async (req) => new Response('ok', { status: 200 }) })
    await expect(worker.fireInstall()).resolves.toBeUndefined()
    await worker.fireActivate()
    expect(worker.notifications.some((m) => m.type === 'OFFLINE_READY')).toBe(true)
  })

  /**
   * The bug behind #32: a service-worker-only code change used to reuse the
   * active worker's CACHE_NAME, so a failed *install* of the new worker could
   * delete a cache the old, still-active worker actually depends on. The
   * digest now covers the worker's own source, but the cleanup itself should
   * also never remove a cache that existed before this attempt started.
   */
  it('does not delete a cache that already existed when a fresh install fails', async () => {
    const worker = loadWorker({ fetchImpl: async () => new Response('nope', { status: 500 }) })
    // Simulate the cache already belonging to an active worker of this exact
    // version before this (re)install attempt even begins.
    const cacheNameMatch = /CACHE_NAME = "(dust-compass-[a-f0-9]+)"/.exec(workerSource)
    const cacheName = cacheNameMatch[1]
    const preexisting = await worker.caches.open(cacheName)
    await preexisting.put('/marker', new Response('already here'))

    await expect(worker.fireInstall()).rejects.toThrow()

    expect(await worker.caches.has(cacheName)).toBe(true)
    expect(await preexisting.match('/marker')).toBeDefined()
  })

  it('deletes a cache this attempt created itself when install fails', async () => {
    const worker = loadWorker({ fetchImpl: async () => new Response('nope', { status: 500 }) })
    const cacheNameMatch = /CACHE_NAME = "(dust-compass-[a-f0-9]+)"/.exec(workerSource)
    const cacheName = cacheNameMatch[1]

    await expect(worker.fireInstall()).rejects.toThrow()

    expect(await worker.caches.has(cacheName)).toBe(false)
  })

  /**
   * The bug behind #33: writing each live-refreshed data file into the
   * versioned cache as its own request resolved could leave that cache
   * holding a mix of files from different deployments. The live cache is
   * now separate and only ever replaced as a complete set.
   */
  it('promotes a live-data refresh only when every file in the revision succeeds', async () => {
    const worker = loadWorker({
      fetchImpl: async (req) => {
        const url = typeof req === 'string' ? req : req.url
        if (url.endsWith('layout.json')) return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } })
        if (url.endsWith('camp.json')) return new Response('[1]', { status: 200, headers: { 'content-type': 'application/json' } })
        // The install-time precache asset (the app shell at "/").
        return new Response('<html></html>', { status: 200 })
      },
    })
    await worker.fireInstall()

    const response = await worker.fireFetch(dataUrl('layout.json'))
    expect(response).toBeDefined()
    // The background revalidation is fired via waitUntil inside the fetch
    // handler itself; give its internal promise chain a tick to settle.
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(worker.notifications.some((m) => m.type === 'DATA_REFRESHED')).toBe(true)
    const revisionName = await currentLiveRevision(worker)
    expect(revisionName).toBeDefined()
    const revision = await worker.caches.open(revisionName)
    expect(await revision.match(dataUrl('layout.json'))).toBeDefined()
    expect(await revision.match(dataUrl('camp.json'))).toBeDefined()
  })

  it('does not promote a partial revision when one file in it fails', async () => {
    // camp.json must still succeed once, for install's own precache — the
    // failure under test belongs to the later, separate live-data refresh.
    let campRequests = 0
    const worker = loadWorker({
      fetchImpl: async (req) => {
        const url = typeof req === 'string' ? req : req.url
        if (url.endsWith('layout.json')) return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } })
        if (url.endsWith('camp.json')) {
          campRequests += 1
          if (campRequests === 1) return new Response('[1]', { status: 200, headers: { 'content-type': 'application/json' } })
          throw new Error('network down')
        }
        return new Response('<html></html>', { status: 200 })
      },
    })
    await worker.fireInstall()

    await worker.fireFetch(dataUrl('layout.json'))
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(worker.notifications.some((m) => m.type === 'DATA_REFRESHED')).toBe(false)
    // No revision was ever complete, so the pointer was never written and
    // there is nothing for a reader to find.
    expect(await currentLiveRevision(worker)).toBeUndefined()
  })

  it('keeps the live pointer and its revision through activate\'s stale-cache cleanup', async () => {
    const worker = loadWorker({
      fetchImpl: async (req) => {
        const url = typeof req === 'string' ? req : req.url
        if (url.endsWith('layout.json')) return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } })
        if (url.endsWith('camp.json')) return new Response('[1]', { status: 200, headers: { 'content-type': 'application/json' } })
        return new Response('<html></html>', { status: 200 })
      },
    })
    await worker.fireInstall()
    await worker.fireFetch(dataUrl('layout.json'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    const revisionName = await currentLiveRevision(worker)
    expect(revisionName).toBeDefined()

    await worker.fireActivate()

    expect(await worker.caches.has(POINTER_CACHE)).toBe(true)
    expect(await worker.caches.has(revisionName)).toBe(true)
    expect(await currentLiveRevision(worker)).toBe(revisionName)
  })

  /**
   * The bug behind #47: promotion used to delete the fixed 'dust-compass-
   * live-data' cache and copy files into it one at a time, so a `cache.put`
   * that failed partway through — independently of every fetch having
   * succeeded — could leave that cache holding neither the old nor the new
   * revision complete. Each refresh now builds a freshly named revision
   * cache and only switches the pointer once every file in it is confirmed
   * present, so a failing `cache.put` here must leave the previously
   * promoted revision exactly as it was.
   */
  it('leaves the previously promoted revision untouched when a cache.put fails partway through a later refresh', async () => {
    const cacheStorage = new FakeCacheStorage()
    const worker = loadWorker({
      cacheStorage,
      fetchImpl: async (req) => {
        const url = typeof req === 'string' ? req : req.url
        if (url.endsWith('layout.json')) return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } })
        if (url.endsWith('camp.json')) return new Response('[1]', { status: 200, headers: { 'content-type': 'application/json' } })
        return new Response('<html></html>', { status: 200 })
      },
    })
    await worker.fireInstall()

    // First refresh: nothing fails, this becomes the "previously promoted"
    // complete revision.
    await worker.fireFetch(dataUrl('layout.json'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    const firstRevision = await currentLiveRevision(worker)
    expect(firstRevision).toBeDefined()
    const firstLayout = await (await worker.caches.open(firstRevision)).match(dataUrl('layout.json'))
    expect(firstLayout).toBeDefined()

    // Second refresh: both fetches succeed, but the *second* destination
    // cache.put() into the new revision cache throws (simulated quota).
    cacheStorage.failPut = (name) => (name.startsWith('dust-compass-live-data-rev-') && name !== firstRevision ? 1 : undefined)
    await worker.fireFetch(dataUrl('layout.json'))
    await new Promise((resolve) => setTimeout(resolve, 20))

    // The pointer never moved: the same first revision is still the one served.
    expect(await currentLiveRevision(worker)).toBe(firstRevision)
    const stillLayout = await (await worker.caches.open(firstRevision)).match(dataUrl('layout.json'))
    expect(await stillLayout.text()).toBe(await firstLayout.text())
  })

  /**
   * The bug behind #25: `Cache.match(request)` matches the request's full
   * URL by default, including the query string. Deep links and shared
   * locations both land at the root as `?poi=`/`?at=` query params rather
   * than distinct paths, so a warm, fully offline-ready install still sent
   * every one of them past the precached shell and into the network-first
   * path below — at best a wasted round trip, at worst a captive portal's
   * 200 OK login page standing in for the app. Matching by pathname alone,
   * ahead of the exact-URL check, must return the cached shell for these
   * with no network attempt at all.
   */
  describe('root deep-link navigations (#25)', () => {
    it('serves the cached shell for a warm ?poi= deep link without touching the network', async () => {
      const calls = []
      const worker = loadWorker({
        fetchImpl: async (req) => {
          calls.push(typeof req === 'string' ? req : req.url)
          return new Response('<html>shell</html>', { status: 200 })
        },
      })
      await worker.fireInstall()
      calls.length = 0 // only the navigation below should be able to add to this

      const response = await worker.fireFetch('/?poi=xyz', { mode: 'navigate' })

      expect(calls).toEqual([])
      expect(response).toBeDefined()
      expect(await response.text()).toBe('<html>shell</html>')
    })

    it('serves the cached shell for a warm ?at= deep link without touching the network', async () => {
      const calls = []
      const worker = loadWorker({
        fetchImpl: async (req) => {
          calls.push(typeof req === 'string' ? req : req.url)
          return new Response('<html>shell</html>', { status: 200 })
        },
      })
      await worker.fireInstall()
      calls.length = 0

      const response = await worker.fireFetch('/?at=some-address', { mode: 'navigate' })

      expect(calls).toEqual([])
      expect(response).toBeDefined()
      expect(await response.text()).toBe('<html>shell</html>')
    })

    it('still falls back to the cached shell when a genuinely distinct page cannot be reached', async () => {
      // A path outside the precached shell (not just "/") — no fetch mock
      // ever resolves it, simulating a hung or offline network. The fallback
      // logic under test doesn't need the real 20s REQUEST_TIMEOUT_MS to
      // elapse: a rejected fetch promise exercises the same catch-and-fall-
      // through path a timed-out one would.
      const worker = loadWorker({
        fetchImpl: async (req) => {
          const url = typeof req === 'string' ? req : req.url
          if (url.endsWith('/some/other/page/')) throw new Error('network down')
          return new Response('<html>shell</html>', { status: 200 })
        },
      })
      await worker.fireInstall()

      const response = await worker.fireFetch('/some/other/page/', { mode: 'navigate' })

      expect(response).toBeDefined()
      expect(await response.text()).toBe('<html>shell</html>')
    })

    it('bounds the network-first attempt for a non-shell navigation with the shared request timeout', async () => {
      let capturedInit
      const worker = loadWorker({
        fetchImpl: async (req, init) => {
          const url = typeof req === 'string' ? req : req.url
          if (url.endsWith('/some/other/page/')) {
            capturedInit = init
            throw new Error('network down')
          }
          return new Response('<html>shell</html>', { status: 200 })
        },
      })
      await worker.fireInstall()

      // A genuinely distinct page still gets the existing network-first
      // treatment, now bounded by the same REQUEST_TIMEOUT_MS/AbortSignal
      // .timeout pattern used elsewhere in this file, so a hanging captive-
      // portal connection can't delay the eventual fallback indefinitely.
      const response = await worker.fireFetch('/some/other/page/', { mode: 'navigate' })

      expect(capturedInit?.signal).toBeInstanceOf(AbortSignal)
      expect(response).toBeDefined()
      expect(await response.text()).toBe('<html>shell</html>')
    })
  })
})
