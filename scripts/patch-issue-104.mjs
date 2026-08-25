import { readFile, writeFile, unlink } from 'node:fs/promises'

function replaceOnce(source, pattern, replacement, label) {
  const next = source.replace(pattern, replacement)
  if (next === source) throw new Error(`Patch failed: ${label}`)
  return next
}

const swPath = 'scripts/build-sw.mjs'
let sw = await readFile(swPath, 'utf8')

sw = replaceOnce(
  sw,
  "const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\\/$/, '')\nconst files = await walk(output)",
  "const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\\/$/, '')\n// Increment only when the shape/semantics consumed by app code become incompatible.\n// Content-only listing changes deliberately keep the same version.\nconst DATA_SCHEMA_VERSION = 1\nconst dataSchemaPath = join(output, 'data', 'schema.json')\nawait writeFile(dataSchemaPath, `${JSON.stringify({ schemaVersion: DATA_SCHEMA_VERSION }, null, 2)}\\n`, 'utf8')\nconst files = await walk(output)",
  'generate schema manifest',
)

sw = replaceOnce(
  sw,
  "const DATA_PREFIX = ${JSON.stringify(dataPrefix)};\n// The precached data files bundled with *this* build",
  "const DATA_PREFIX = ${JSON.stringify(dataPrefix)};\nconst DATA_SCHEMA_VERSION = ${DATA_SCHEMA_VERSION};\nconst DATA_SCHEMA_URL = DATA_PREFIX + 'schema.json';\n// The precached data files bundled with *this* build",
  'worker schema constants',
)

sw = replaceOnce(
  sw,
  "const DATA_FILES = PRECACHE.filter((url) => url.indexOf(DATA_PREFIX) === 0 && /\\\\.(?:geo)?json$/.test(url));",
  "const DATA_FILES = PRECACHE.filter((url) => url.indexOf(DATA_PREFIX) === 0 && url !== DATA_SCHEMA_URL && /\\\\.(?:geo)?json$/.test(url));",
  'exclude schema from revision payload',
)

sw = replaceOnce(
  sw,
  "    const revisionName = LIVE_REVISION_PREFIX + now;\n    let built = false;\n    try {\n      const responses = await Promise.all(DATA_FILES.map(async (url) => {",
  `    const revisionName = LIVE_REVISION_PREFIX + now;
    let built = false;
    try {
      // The public /data URLs can advance while this old worker is still the
      // active controller. Refuse to hot-load bytes whose schema requires the
      // waiting/new app build; content-only updates keep the same version and
      // continue through the normal revision path (#104).
      const schemaResponse = await fetch(DATA_SCHEMA_URL, {
        cache: 'reload',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const schemaType = schemaResponse.headers.get('content-type') || '';
      if (!schemaResponse.ok || !schemaType.includes('json')) return;
      const remoteSchema = await schemaResponse.json();
      if (remoteSchema?.schemaVersion !== DATA_SCHEMA_VERSION) return;

      const responses = await Promise.all(DATA_FILES.map(async (url) => {`,
  'schema gate refresh',
)

await writeFile(swPath, sw)

const testPath = 'scripts/__tests__/build-sw.test.mjs'
let tests = await readFile(testPath, 'utf8')
tests = replaceOnce(
  tests,
  "function loadWorker({ fetchImpl, cacheStorage, source = workerSource, origin = ORIGIN }) {",
  "function loadWorker({ fetchImpl, cacheStorage, source = workerSource, origin = ORIGIN, schemaVersion = 1 }) {",
  'test harness schema option',
)
tests = replaceOnce(
  tests,
  "    fetch: (...args) => fetchImpl(...args),",
  `    fetch: (...args) => {
      const request = args[0]
      const url = typeof request === 'string' ? request : request.url
      if (url.endsWith('/data/schema.json')) {
        const version = typeof schemaVersion === 'function' ? schemaVersion() : schemaVersion
        return Promise.resolve(new Response(JSON.stringify({ schemaVersion: version }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }))
      }
      return fetchImpl(...args)
    },`,
  'test harness schema response',
)

const anchor = "  it('does not promote a partial revision when one file in it fails', async () => {"
const regression = `  it('refuses live data from a newer incompatible schema (#104)', async () => {
    let live = false
    let schemaVersion = 1
    const worker = loadWorker({
      schemaVersion: () => schemaVersion,
      fetchImpl: async (req) => {
        const url = typeof req === 'string' ? req : req.url
        if (url.endsWith('layout.json')) return new Response(live ? '{"schema":"new"}' : '{}', { status: 200, headers: { 'content-type': 'application/json' } })
        if (url.endsWith('camp.json')) return new Response(live ? '[2]' : '[]', { status: 200, headers: { 'content-type': 'application/json' } })
        return new Response('<html></html>', { status: 200 })
      },
    })
    await worker.fireInstall()
    live = true
    schemaVersion = 2

    await worker.fireFetch(dataUrl('layout.json'))
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(await currentLiveRevision(worker)).toBeUndefined()
    expect(worker.notifications.some((m) => m.type === 'DATA_REFRESHED')).toBe(false)
  })

`
if (!tests.includes("newer incompatible schema (#104)")) {
  if (!tests.includes(anchor)) throw new Error('Patch failed: regression test anchor')
  tests = tests.replace(anchor, regression + anchor)
}
await writeFile(testPath, tests)

await unlink('scripts/patch-issue-104.mjs')
await unlink('.github/workflows/apply-issue-104.yml')
