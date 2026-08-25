import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const ORIGIN = 'https://dustcompass.test'
const AUDIO_CACHE = 'dust-compass-audio-guide-2026'

function generateWorker() {
  const dir = mkdtempSync(join(tmpdir(), 'dustcompass-audio-activation-'))
  mkdirSync(join(dir, 'out'), { recursive: true })
  writeFileSync(join(dir, 'out', 'index.html'), '<html></html>')
  execFileSync(process.execPath, [join(repoRoot, 'scripts', 'build-sw.mjs')], { cwd: dir, env: process.env })
  const source = readFileSync(join(dir, 'out', 'sw.js'), 'utf8')
  rmSync(dir, { recursive: true, force: true })
  return source
}

class FakeCache {
  constructor() {
    this.store = new Map()
  }

  async match(key) {
    return this.store.get(String(key))
  }

  async put(key, response) {
    this.store.set(String(key), response)
  }
}

class FakeCacheStorage {
  constructor(names) {
    this.byName = new Map(names.map((name) => [name, new FakeCache()]))
    this.deleted = []
  }

  async keys() {
    return [...this.byName.keys()]
  }

  async has(name) {
    return this.byName.has(name)
  }

  async open(name) {
    if (!this.byName.has(name)) this.byName.set(name, new FakeCache())
    return this.byName.get(name)
  }

  async delete(name) {
    this.deleted.push(name)
    return this.byName.delete(name)
  }
}

describe('service-worker activation cache cleanup', () => {
  it('preserves user-downloaded audio while deleting stale build caches', async () => {
    const source = generateWorker()
    const cacheName = source.match(/const CACHE_NAME = "([^"]+)";/)?.[1]
    expect(cacheName).toBeTruthy()

    const stalePrecache = 'dust-compass-deadbeef0000'
    const caches = new FakeCacheStorage([cacheName, AUDIO_CACHE, stalePrecache])
    const audio = await caches.open(AUDIO_CACHE)
    await audio.put('saved-track', new Response('mp3'))

    const handlers = {}
    const sandbox = {
      console,
      Request,
      Response,
      AbortSignal,
      URL,
      setTimeout,
      Date,
      fetch: async () => new Response('ok'),
      caches,
      self: undefined,
    }
    sandbox.self = {
      addEventListener: (type, handler) => { handlers[type] = handler },
      clients: { matchAll: async () => [], claim: async () => {} },
      location: { origin: ORIGIN },
      skipWaiting: async () => {},
    }

    vm.createContext(sandbox)
    vm.runInContext(source, sandbox)

    let activation
    handlers.activate({ waitUntil: (promise) => { activation = promise } })
    await activation

    expect(await caches.has(AUDIO_CACHE)).toBe(true)
    expect(await (await caches.open(AUDIO_CACHE)).match('saved-track')).toBeTruthy()
    expect(await caches.has(stalePrecache)).toBe(false)
    expect(caches.deleted).toContain(stalePrecache)
    expect(caches.deleted).not.toContain(AUDIO_CACHE)
  })
})
