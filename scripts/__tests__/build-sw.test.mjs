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
import { beforeAll, describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

/**
 * Generates the real service worker against a minimal `out/` tree.
 *
 * Includes an attribution Markdown file alongside the data JSON by default —
 * `fetch-data.mjs`/`fetch-api.mjs` always write one in a real build — so
 * every test generated this way is, by construction, exercising the same
 * "data directory has non-JSON members" shape a real deploy has (#71), not a
 * hand-picked fixture that happens to avoid it.
 */
function generateWorker({ basePath, includeAttribution = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'dustcompass-sw-'))
  mkdirSync(join(dir, 'out', 'data', '2025'), { recursive: true })
  writeFileSync(join(dir, 'out', 'index.html'), '<html></html>')
  writeFileSync(join(dir, 'out', 'data', '2025', 'layout.json'), '{}')
  writeFileSync(join(dir, 'out', 'data', '2025', 'camp.json'), '[]')
  if (includeAttribution) {
    writeFileSync(join(dir, 'out', 'data', '2025', 'ATTRIBUTION.md'), '# Attribution\n')
  }
  execFileSync(process.execPath, [join(repoRoot, 'scripts', 'build-sw.mjs')], {
    cwd: dir,
    env: { ...process.env, NEXT_PUBLIC_BASE_PATH: basePath ?? '' },
  })
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
function loadWorker({ fetchImpl, cacheStorage, source = workerSource, origin = ORIGIN }) {
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
    location: { origin },
    skipWaiting: async () => {},
  }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox)

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
    const request = new FakeRequest(new URL(path, origin).href, init)
    await handlers.fetch({
      request,
      respondWith: (p) => (promise = p),
      waitUntil: (p) => p, // background work is awaited explicitly in tests where it matters
    })
    return promise
  }
  const fireMessage = async (data) => {
    let promise = Promise.resolve()
    await handlers.message({ data, waitUntil: (p) => (promise = p) })
    return promise
  }

  // Separate `vm.runInContext` calls against the same contextified sandbox
  // share top-level `const`/`let` bindings — the same mechanism the Node
  // REPL uses — so this reads the worker's own live globals straight out of
  // the executed source rather than re-deriving a copy of its filtering
  // logic here, which could drift from (or simply repeat a mistake in) the
  // real implementation.
  const dataFiles = vm.runInContext('DATA_FILES', sandbox)
  const cacheName = vm.runInContext('CACHE_NAME', sandbox)

  return { caches: sandbox.caches, notifications, dataFiles, cacheName, origin, fireInstall, fireActivate, fireFetch, fireMessage }
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
    const worker = loadWorker({ fetchImpl: async () => new Response('ok', { status: 200 }) })
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
    let live = false
    const worker = loadWorker({
      fetchImpl: async (req) => {
        const url = typeof req === 'string' ? req : req.url
        if (url.endsWith('layout.json')) return new Response(live ? '{"ok":"live"}' : '{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } })
        if (url.endsWith('camp.json')) return new Response(live ? '[2]' : '[1]', { status: 200, headers: { 'content-type': 'application/json' } })
        // The install-time precache asset (the app shell at "/").
        return new Response('<html></html>', { status: 200 })
      },
    })
    await worker.fireInstall()
    live = true

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

  it('does not promote, notify, or loop when live data is byte-for-byte unchanged (#78)', async () => {
    let dataFetches = 0
    const worker = loadWorker({
      fetchImpl: async (req) => {
        const url = typeof req === 'string' ? req : req.url
        if (url.endsWith('layout.json')) {
          dataFetches += 1
          return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
        }
        if (url.endsWith('camp.json')) {
          dataFetches += 1
          return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })
        }
        return new Response('<html></html>', { status: 200 })
      },
    })
    await worker.fireInstall()
    dataFetches = 0

    await worker.fireFetch(dataUrl('layout.json'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(dataFetches).toBe(worker.dataFiles.length)
    expect(worker.notifications.filter((message) => message.type === 'DATA_REFRESHED')).toEqual([])
    expect(await currentLiveRevision(worker)).toBeUndefined()

    // React-style reads after the completed check stay inside the throttle
    // window and do not download the catalogue again.
    await worker.fireFetch(dataUrl('camp.json'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(dataFetches).toBe(worker.dataFiles.length)
    expect(worker.notifications.filter((message) => message.type === 'DATA_REFRESHED')).toEqual([])
  })

  it('keeps the live pointer and its revision through activate\'s stale-cache cleanup', async () => {
    let live = false
    const worker = loadWorker({
      fetchImpl: async (req) => {
        const url = typeof req === 'string' ? req : req.url
        if (url.endsWith('layout.json')) return new Response(live ? '{"ok":"live"}' : '{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } })
        if (url.endsWith('camp.json')) return new Response(live ? '[2]' : '[1]', { status: 200, headers: { 'content-type': 'application/json' } })
        return new Response('<html></html>', { status: 200 })
      },
    })
    await worker.fireInstall()
    live = true
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
   * The bug behind #71: `DATA_FILES` used to be every precached URL under
   * `DATA_PREFIX`, which also caught `ATTRIBUTION.md`/`LISTINGS-
   * ATTRIBUTION.md` — real files `fetch-data.mjs`/`fetch-api.mjs` always
   * write alongside the JSON. `refreshLiveData()` requires every `DATA_FILES`
   * member to report a JSON content-type before promoting anything, so a
   * manifest containing a Markdown file made that impossible to satisfy for
   * any real build — live-data promotion was silently disabled entirely.
   * `generateWorker()` includes an attribution file by default (see its own
   * doc comment), so this isn't a hand-picked fixture engineered to catch
   * the bug — every other test in this file already exercises this shape.
   */
  describe('attribution files excluded from the live-data manifest (#71)', () => {
    it('keeps the real manifest scoped to JSON/GeoJSON, not every precached data-directory member', () => {
      const worker = loadWorker({ fetchImpl: async () => new Response('should not be fetched', { status: 200 }) })
      expect(worker.dataFiles.some((url) => url.endsWith('.md'))).toBe(false)
      expect(worker.dataFiles.some((url) => url.endsWith('layout.json'))).toBe(true)
      expect(worker.dataFiles.some((url) => url.endsWith('camp.json'))).toBe(true)
    })

    it('promotes a live-data refresh and never even fetches the attribution file, despite it being precached', async () => {
      const fetched = []
      let live = false
      const worker = loadWorker({
        fetchImpl: async (req) => {
          const url = typeof req === 'string' ? req : req.url
          fetched.push(url)
          if (url.endsWith('layout.json')) return new Response(live ? '{"ok":"live"}' : '{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } })
          if (url.endsWith('camp.json')) return new Response(live ? '[2]' : '[1]', { status: 200, headers: { 'content-type': 'application/json' } })
          // The install-time precache asset (the app shell, and — critically
          // — ATTRIBUTION.md itself, which install() still fetches to keep
          // the credit text available offline) responds with plain HTML,
          // deliberately not JSON: if refreshLiveData() ever tried to treat
          // this as a data file, `type.includes('json')` would be false and
          // promotion would fail exactly the way #71 describes.
          return new Response('<html></html>', { status: 200 })
        },
      })
      await worker.fireInstall()
      live = true
      expect(fetched.some((url) => url.endsWith('.md'))).toBe(true) // precached, so install() does fetch it once

      fetched.length = 0
      await worker.fireFetch(dataUrl('layout.json'))
      await new Promise((resolve) => setTimeout(resolve, 20))

      expect(worker.notifications.some((m) => m.type === 'DATA_REFRESHED')).toBe(true)
      expect(fetched.some((url) => url.endsWith('.md'))).toBe(false)
      const revisionName = await currentLiveRevision(worker)
      const revision = await worker.caches.open(revisionName)
      expect(await revision.match(dataUrl('layout.json'))).toBeDefined()
      expect(await revision.match(dataUrl('camp.json'))).toBeDefined()
    })
  })

  /**
   * The bug behind #72: the pointer cache and every revision cache are
   * deliberately preserved across worker activations (see the pointer
   * architecture's own comment above `LIVE_POINTER_CACHE`), with nothing
   * checking which build actually populated them. A newer worker shipping
   * newer bundled data activated over an older worker's still-named pointer
   * and inherited that older, by-definition-unvetted-by-this-build live
   * revision — preferring it forever over its own freshly bundled,
   * guaranteed-current precache.
   */
  it('clears a live pointer left by a different build on activate, so a new build reads its own bundled data (#72)', async () => {
    const cacheStorage = new FakeCacheStorage()
    let buildALive = false
    const buildA = loadWorker({
      source: generateWorker(),
      cacheStorage,
      fetchImpl: async (req) => {
        const url = typeof req === 'string' ? req : req.url
        if (url.endsWith('layout.json')) return new Response(buildALive ? '{"build":"A-live"}' : '{"build":"A"}', { status: 200, headers: { 'content-type': 'application/json' } })
        if (url.endsWith('camp.json')) return new Response(buildALive ? '["A-live"]' : '["A"]', { status: 200, headers: { 'content-type': 'application/json' } })
        return new Response('<html>A</html>', { status: 200 })
      },
    })
    await buildA.fireInstall()
    await buildA.fireActivate()
    buildALive = true
    await buildA.fireFetch(dataUrl('layout.json'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    const aRevision = await currentLiveRevision(buildA)
    expect(aRevision).toBeDefined()
    expect(await (await buildA.caches.open(aRevision)).match(dataUrl('layout.json'))).toBeDefined()

    // Build B: distinguishable generated source (different precache content,
    // so a real, different CACHE_NAME digest), sharing the same persistent
    // Cache Storage the way a real browser's storage survives a worker
    // update. B's own bundled precache is fetched with build-B content.
    const bWorkDir = mkdtempSync(join(tmpdir(), 'dustcompass-sw-b-'))
    mkdirSync(join(bWorkDir, 'out', 'data', '2025'), { recursive: true })
    writeFileSync(join(bWorkDir, 'out', 'index.html'), '<html>B build marker</html>')
    writeFileSync(join(bWorkDir, 'out', 'data', '2025', 'layout.json'), '{"build":"B-bundled"}')
    writeFileSync(join(bWorkDir, 'out', 'data', '2025', 'camp.json'), '["B-bundled"]')
    execFileSync(process.execPath, [join(repoRoot, 'scripts', 'build-sw.mjs')], {
      cwd: bWorkDir,
      env: { ...process.env, NEXT_PUBLIC_BASE_PATH: '' },
    })
    const bSource = readFileSync(join(bWorkDir, 'out', 'sw.js'), 'utf8')
    rmSync(bWorkDir, { recursive: true, force: true })

    const buildB = loadWorker({
      source: bSource,
      cacheStorage,
      fetchImpl: async (req) => {
        const url = typeof req === 'string' ? req : req.url
        if (url.endsWith('layout.json')) return new Response('{"build":"B-bundled"}', { status: 200, headers: { 'content-type': 'application/json' } })
        if (url.endsWith('camp.json')) return new Response('["B-bundled"]', { status: 200, headers: { 'content-type': 'application/json' } })
        return new Response('<html>B build marker</html>', { status: 200 })
      },
    })
    expect(buildB.cacheName).not.toBe(buildA.cacheName)
    await buildB.fireInstall()
    await buildB.fireActivate()

    // A's pointer/revision belonged to a different build — activation must
    // have cleared it rather than leaving B pointed at A's data.
    expect(await currentLiveRevision(buildB)).toBeUndefined()

    const response = await buildB.fireFetch(dataUrl('layout.json'))
    expect(await response.text()).toBe('{"build":"B-bundled"}')
  })

  /**
   * The bug behind #75: `Response.redirect()` requires an absolute URL.
   * `SHELL` is root-relative on a project-subpath deployment (e.g.
   * "/dustcompass/"), which threw a `TypeError` with no base to resolve
   * against — breaking the entire offline listing-share fallback on exactly
   * the deployment this app actually uses (GitHub Pages project sites).
   */
  describe('offline listing-page redirect target is always absolute (#75)', () => {
    it.each([
      { label: 'a project-subpath deployment', basePath: '/dustcompass' },
      { label: 'a root-domain deployment', basePath: '' },
    ])('produces a redirect Response.redirect() can accept for $label', async ({ basePath }) => {
      const source = generateWorker({ basePath })
      const worker = loadWorker({
        source,
        // Install must still succeed (its own precache fetches never carry
        // `mode: 'navigate'`) — only the later runtime navigation fetch is
        // made to fail, to force the offline listing-redirect fallback
        // under test without also breaking the install this test needs
        // to have already completed.
        fetchImpl: async (req) => {
          const mode = req && typeof req === 'object' ? req.mode : undefined
          if (mode === 'navigate') throw new Error('network unreachable — forces the offline fallback')
          const url = typeof req === 'string' ? req : req.url
          if (url.endsWith('layout.json')) return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } })
          if (url.endsWith('camp.json')) return new Response('[1]', { status: 200, headers: { 'content-type': 'application/json' } })
          return new Response('<html></html>', { status: 200 })
        },
      })
      await worker.fireInstall()

      const shellPath = basePath ? `${basePath}/` : '/'
      const response = await worker.fireFetch(`${shellPath}p/some-uid/`, { mode: 'navigate' })
      expect(response.status).toBe(302)
      const location = response.headers.get('location')
      expect(location).toBeTruthy()
      // The real bug threw before a Response was ever constructed — merely
      // getting here proves Response.redirect() accepted the target. This
      // also checks it resolved to the intended absolute URL, not just any
      // absolute one.
      const resolved = new URL(location)
      expect(resolved.href).toBe(`${ORIGIN}${shellPath}?poi=some-uid`)
    })
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
    let generation = 0
    const worker = loadWorker({
      cacheStorage,
      fetchImpl: async (req) => {
        const url = typeof req === 'string' ? req : req.url
        if (url.endsWith('layout.json')) return new Response(`{"generation":${generation}}`, { status: 200, headers: { 'content-type': 'application/json' } })
        if (url.endsWith('camp.json')) return new Response(`[${generation}]`, { status: 200, headers: { 'content-type': 'application/json' } })
        return new Response('<html></html>', { status: 200 })
      },
    })
    await worker.fireInstall()
    generation = 1

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
    generation = 2
    fakeClock += 5 * 60 * 1000
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
  /**
   * The bug behind #58: `PwaStatus` used to treat an active service-worker
   * registration alone as proof the offline map was still complete, even
   * though Cache Storage can be evicted under storage pressure while the
   * worker registration stays active. `CHECK_OFFLINE_READY` is the
   * verification (and self-repair) handshake that replaces that assumption.
   */
  describe('CHECK_OFFLINE_READY (#58)', () => {
    it('reports OFFLINE_READY straight away when every precache entry is already present', async () => {
      const worker = loadWorker({ fetchImpl: async () => new Response('should not be fetched', { status: 200 }) })
      await worker.fireInstall()
      worker.notifications.length = 0

      await worker.fireMessage({ type: 'CHECK_OFFLINE_READY' })

      expect(worker.notifications).toEqual([{ type: 'OFFLINE_READY', total: expect.any(Number) }])
    })

    it('repairs a precache entry that was evicted after install, then reports OFFLINE_READY', async () => {
      const worker = loadWorker({ fetchImpl: async () => new Response('refetched', { status: 200 }) })
      await worker.fireInstall()

      const cacheNameMatch = /CACHE_NAME = "(dust-compass-[a-f0-9]+)"/.exec(workerSource)
      const cache = await worker.caches.open(cacheNameMatch[1])
      // Simulate the browser evicting one entry under storage pressure —
      // the registration itself (and this cache) is still active.
      const [evictedUrl] = await cache.keys()
      cache.store.delete(evictedUrl)
      expect(await cache.match(evictedUrl)).toBeUndefined()

      worker.notifications.length = 0
      await worker.fireMessage({ type: 'CHECK_OFFLINE_READY' })

      expect(await cache.match(evictedUrl)).toBeDefined()
      expect(worker.notifications.some((m) => m.type === 'CACHE_PROGRESS')).toBe(true)
      expect(worker.notifications.at(-1)).toEqual({ type: 'OFFLINE_READY', total: expect.any(Number) })
    })

    it('reports CACHE_FAILED, not OFFLINE_READY, when a missing entry cannot be re-fetched', async () => {
      let installed = false
      const worker = loadWorker({
        fetchImpl: async () => {
          if (!installed) return new Response('ok', { status: 200 })
          throw new Error('network down')
        },
      })
      await worker.fireInstall()
      installed = true

      const cacheNameMatch = /CACHE_NAME = "(dust-compass-[a-f0-9]+)"/.exec(workerSource)
      const cache = await worker.caches.open(cacheNameMatch[1])
      const [evictedUrl] = await cache.keys()
      cache.store.delete(evictedUrl)

      worker.notifications.length = 0
      await worker.fireMessage({ type: 'CHECK_OFFLINE_READY' })

      expect(worker.notifications.some((m) => m.type === 'OFFLINE_READY')).toBe(false)
      expect(worker.notifications.some((m) => m.type === 'CACHE_FAILED')).toBe(true)
    })
  })

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
