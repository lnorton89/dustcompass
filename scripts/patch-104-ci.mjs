import { readFile, writeFile } from 'node:fs/promises'

async function edit(path, transform) {
  const before = await readFile(path, 'utf8')
  const after = transform(before)
  if (after === before) throw new Error(`No change made to ${path}`)
  await writeFile(path, after)
}

await edit('scripts/build-sw.mjs', (source) => {
  source = source.replace(
    "import { readdir, readFile, writeFile } from 'node:fs/promises'",
    "import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'",
  )
  const needle = "const dataSchemaPath = join(output, 'data', 'schema.json')\nawait writeFile(dataSchemaPath, `${JSON.stringify({ schemaVersion: DATA_SCHEMA_VERSION }, null, 2)}\\n`, 'utf8')"
  const replacement = "const dataSchemaPath = join(output, 'data', 'schema.json')\nawait mkdir(join(output, 'data'), { recursive: true })\nawait writeFile(dataSchemaPath, `${JSON.stringify({ schemaVersion: DATA_SCHEMA_VERSION }, null, 2)}\\n`, 'utf8')"
  if (!source.includes(needle)) throw new Error('schema write block not found')
  return source.replace(needle, replacement)
})

await edit('scripts/__tests__/live-refresh-throttle.test.mjs', (source) => {
  const needle = "      if (url.includes('/data/')) {\n        if (refreshing) dataRequests += 1"
  const replacement = "      if (url.endsWith('/data/schema.json')) {\n        return new Response('{\"schemaVersion\":1}', { status: 200, headers: { 'content-type': 'application/json' } })\n      }\n      if (url.includes('/data/')) {\n        if (refreshing) dataRequests += 1"
  const occurrences = source.split(needle).length - 1
  if (occurrences !== 2) throw new Error(`expected 2 throttle fetch blocks, found ${occurrences}`)
  return source.replaceAll(needle, replacement)
})
