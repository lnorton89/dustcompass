import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { beforeAll, describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const ORIGIN = 'https://dustcompass.test'
const INTERVAL = 5 * 60 * 1000

function generateWorker() {
  const dir = mkdtempSync(join(tmpdir(), 'dustcompass-refresh-'))
  mkdirSync(join(dir, 'out', 'data', '2025'), { recursive: true })
  writeFileSync(join(dir, 'out', 'index.html'), '<html></html>')
  writeFileSync(join(dir, 'out', 'data', '2025', 'layout.json'), '{}')
  writeFileSync(join(dir, 'out', 'data', '2025', 'camp.json'), '[]')
  execFileSync(process.execPath, [join(repoRoot, 'scripts', 'build-sw.mjs')], { cwd: dir, env: process.env })
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
    const value = this.store.get(keyFor(request))
    return value ? value.clone() : undefined
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

let workerSource
beforeAll(() => {
  workerSource = generateWorker()
})

function loadWorker({ caches, fetchImpl, clock }) {
  const handlers = {}
  const sandbox = {
    console,
    Request: FakeRequest,
    Response,
    AbortSignal,
    URL,
    setTimeout,
    Date: { now: () => clock.now },
    fetch: (...args) => fetchImpl(...args),
    caches,
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
  vm.runInContext(workerSource, sandbox)

  return {
    async install() {
      let promise
      handlers.install({ waitUntil: (value) => (promise = value) })
      await promise
    },
    async refresh() {
      await vm.runInContext('refreshLiveData()', sandbox)
    },
  }
}

describe('live-data refresh throttle', () => {
  it('backs off failed attempts until the interval expires', async () => {
    const caches = new FakeCacheStorage()
    const clock = { now: 1_700_000_000_000 }
    let refreshing = false
    let dataRequests = 0
    const fetchImpl = async (request) => {
      const url = typeof request === 'string' ? request : request.url
      if (url.endsWith('/data/schema.json')) {
        return new Response('{"schemaVersion":1}', { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url.includes('/data/')) {
        if (refreshing) dataRequests += 1
        if (refreshing && url.endsWith('camp.json')) {
          return new Response('bad gateway', { status: 502, headers: { 'content-type': 'text/plain' } })
        }
        return new Response(url.endsWith('camp.json') ? '[]' : '{}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response('<html></html>', { status: 200 })
    }

    const worker = loadWorker({ caches, fetchImpl, clock })
    await worker.install()
    refreshing = true

    await worker.refresh()
    expect(dataRequests).toBe(2)

    await worker.refresh()
    await worker.refresh()
    expect(dataRequests).toBe(2)

    clock.now += INTERVAL + 1
    await worker.refresh()
    expect(dataRequests).toBe(4)
  })

  it('keeps the throttle after the service-worker global is recreated', async () => {
    const caches = new FakeCacheStorage()
    const clock = { now: 1_700_100_000_000 }
    let refreshing = false
    let dataRequests = 0
    const fetchImpl = async (request) => {
      const url = typeof request === 'string' ? request : request.url
      if (url.endsWith('/data/schema.json')) {
        return new Response('{"schemaVersion":1}', { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url.includes('/data/')) {
        if (refreshing) dataRequests += 1
        if (refreshing && url.endsWith('camp.json')) {
          return new Response('nope', { status: 500, headers: { 'content-type': 'text/plain' } })
        }
        return new Response(url.endsWith('camp.json') ? '[]' : '{}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response('<html></html>', { status: 200 })
    }

    const first = loadWorker({ caches, fetchImpl, clock })
    await first.install()
    refreshing = true
    await first.refresh()
    expect(dataRequests).toBe(2)

    // New VM context, same Cache Storage: this is the lifecycle boundary that
    // used to reset the in-memory timestamp to zero (#92).
    const restarted = loadWorker({ caches, fetchImpl, clock })
    await restarted.refresh()
    expect(dataRequests).toBe(2)

    clock.now += INTERVAL + 1
    await restarted.refresh()
    expect(dataRequests).toBe(4)
  })
})
