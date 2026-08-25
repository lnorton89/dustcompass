import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const ORIGIN = 'https://dustcompass.test'

function generateWorker(basePath = '/dustcompass') {
  const dir = mkdtempSync(join(tmpdir(), 'dustcompass-share-sw-'))
  mkdirSync(join(dir, 'out', 'data', '2025'), { recursive: true })
  writeFileSync(join(dir, 'out', 'index.html'), '<html><body>shell</body></html>')
  writeFileSync(join(dir, 'out', 'data', '2025', 'layout.json'), '{}')
  writeFileSync(join(dir, 'out', 'data', '2025', 'camp.json'), '[]')
  execFileSync(process.execPath, [join(repoRoot, 'scripts', 'build-sw.mjs')], {
    cwd: dir,
    env: { ...process.env, NEXT_PUBLIC_BASE_PATH: basePath },
  })
  const source = readFileSync(join(dir, 'out', 'sw.js'), 'utf8')
  rmSync(dir, { recursive: true, force: true })
  return source
}

const keyFor = (request) => {
  const raw = typeof request === 'string' ? request : request.url
  return new URL(raw, ORIGIN).href
}

class FakeRequest {
  constructor(url, init = {}) {
    this.url = typeof url === 'string' ? url : url.url
    this.method = init.method ?? 'GET'
    this.mode = init.mode
  }
}

class FakeCache {
  constructor() {
    this.store = new Map()
  }

  async match(request) {
    const response = this.store.get(keyFor(request))
    return response?.clone()
  }

  async put(request, response) {
    this.store.set(keyFor(request), response.clone())
  }
}

class FakeCacheStorage {
  constructor() {
    this.byName = new Map()
  }

  async open(name) {
    if (!this.byName.has(name)) this.byName.set(name, new FakeCache())
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

function loadWorker(source, fetchImpl) {
  const handlers = {}
  const sandbox = {
    console,
    Request: FakeRequest,
    Response,
    AbortSignal,
    URL,
    Uint8Array,
    setTimeout,
    fetch: (...args) => fetchImpl(...args),
    caches: new FakeCacheStorage(),
    self: undefined,
  }
  sandbox.self = {
    addEventListener: (type, handler) => {
      handlers[type] = handler
    },
    clients: {
      matchAll: async () => [],
      claim: async () => {},
    },
    location: { origin: ORIGIN },
    skipWaiting: async () => {},
  }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox)

  return {
    async install() {
      let promise
      handlers.install({ waitUntil: (value) => (promise = value) })
      await promise
    },
    async navigate(path) {
      let responsePromise
      const request = new FakeRequest(new URL(path, ORIGIN).href, { mode: 'navigate' })
      handlers.fetch({
        request,
        respondWith: (value) => (responsePromise = value),
        waitUntil: () => {},
      })
      return responsePromise
    },
  }
}

function installResponse() {
  return new Response('precache asset', { status: 200 })
}

describe('share-page navigation validation (#94)', () => {
  it('rejects unrelated captive-portal 200 HTML and restores the cached app with the UID', async () => {
    const worker = loadWorker(generateWorker(), async (request) => {
      if (request.mode === 'navigate') {
        return new Response('<html><title>Sign in to Wi-Fi</title></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        })
      }
      return installResponse()
    })
    await worker.install()

    const response = await worker.navigate('/dustcompass/p/known-art-uid/')
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(
      `${ORIGIN}/dustcompass/?poi=known-art-uid`,
    )
  })

  it('accepts a genuine online Dust Compass share page carrying the stable marker', async () => {
    const genuineHtml = '<html><main data-dust-compass-share-page="1">Opening the map</main></html>'
    const worker = loadWorker(generateWorker(), async (request) => {
      if (request.mode === 'navigate') {
        return new Response(genuineHtml, {
          status: 200,
          headers: { 'content-type': 'text/html' },
        })
      }
      return installResponse()
    })
    await worker.install()

    const response = await worker.navigate('/dustcompass/p/known-art-uid/')
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('data-dust-compass-share-page="1"')
  })
})
