import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const ORIGIN = 'https://dustcompass.test'

function generateWorker() {
  const dir = mkdtempSync(join(tmpdir(), 'dustcompass-sw-integrity-'))
  mkdirSync(join(dir, 'out', 'data', '2025'), { recursive: true })
  writeFileSync(join(dir, 'out', 'index.html'), '<html>build A</html>')
  writeFileSync(join(dir, 'out', 'data', '2025', 'layout.json'), '{"build":"A"}')
  writeFileSync(join(dir, 'out', 'data', '2025', 'camp.json'), '["A"]')
  execFileSync(process.execPath, [join(repoRoot, 'scripts', 'build-sw.mjs')], { cwd: dir })
  const source = readFileSync(join(dir, 'out', 'sw.js'), 'utf8')
  rmSync(dir, { recursive: true, force: true })
  return source
}

const keyFor = (request) => {
  const raw = typeof request === 'string' ? request : request.url
  return new URL(raw, ORIGIN).href
}

class FakeCache {
  constructor() {
    this.store = new Map()
  }
  async match(request) {
    const response = this.store.get(keyFor(request))
    return response ? response.clone() : undefined
  }
  async put(request, response) {
    this.store.set(keyFor(request), response)
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

class FakeRequest {
  constructor(url, init = {}) {
    this.url = typeof url === 'string' ? url : url.url
    this.method = init.method ?? 'GET'
    this.mode = init.mode
  }
}

function loadWorker(source) {
  const handlers = {}
  const notifications = []
  const caches = new FakeCacheStorage()
  let generation = 'A'

  const sandbox = {
    console,
    Request: FakeRequest,
    Response,
    AbortSignal,
    URL,
    setTimeout,
    Math,
    Uint8Array,
    Date,
    fetch: async (request) => {
      const url = typeof request === 'string' ? request : request.url
      if (url.endsWith('/data/schema.json')) {
        return new Response(JSON.stringify({ schemaVersion: 1 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(`${generation}:${url}`, { status: 200 })
    },
    caches,
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
  vm.runInContext(source, sandbox)
  const cacheName = vm.runInContext('CACHE_NAME', sandbox)

  return {
    cacheName,
    caches,
    notifications,
    setGeneration: (next) => {
      generation = next
    },
    fireInstall: async () => {
      let promise
      await handlers.install({ waitUntil: (value) => (promise = value) })
      return promise
    },
    fireMessage: async (data) => {
      let promise = Promise.resolve()
      await handlers.message({ data, waitUntil: (value) => (promise = value) })
      return promise
    },
  }
}

it('refuses newer deployment bytes when repairing an older active precache (#159)', async () => {
  const worker = loadWorker(generateWorker())
  await worker.fireInstall()

  const cache = await worker.caches.open(worker.cacheName)
  const shellKey = `${ORIGIN}/`
  const installedShell = await cache.match(shellKey)
  expect(installedShell).toBeDefined()
  expect(await installedShell.text()).toBe(`A:${shellKey}`)

  // Deployment B replaces the stable Pages URLs while worker/cache A remains
  // active. Storage pressure then removes one A asset.
  worker.setGeneration('B')
  cache.store.delete(shellKey)
  expect(await cache.match(shellKey)).toBeUndefined()

  worker.notifications.length = 0
  await worker.fireMessage({ type: 'CHECK_OFFLINE_READY' })

  // B's successful response is not allowed into A's content-hashed cache.
  expect(await cache.match(shellKey)).toBeUndefined()
  expect(worker.notifications.some((message) => message.type === 'OFFLINE_READY')).toBe(false)
  const failure = worker.notifications.find((message) => message.type === 'CACHE_FAILED')
  expect(failure).toBeDefined()
  expect(failure.url).toContain('Build fingerprint mismatch')
})
