import { readFile, writeFile } from 'node:fs/promises'

async function edit(path, fn) {
  const before = await readFile(path, 'utf8')
  const after = fn(before)
  if (after === before) throw new Error(`No change made to ${path}`)
  await writeFile(path, after)
}

await edit('src/App.tsx', (s) => {
  const needle = `  useEffect(() => {\n    if (!pendingNearest || !locationWatchHasFailed(location.status)) return\n    const id = requestAnimationFrame(() => {\n      setPendingNearest(undefined)\n      releaseLocation('nearest')\n      setProbe('Could not get your location')\n    })\n    return () => cancelAnimationFrame(id)\n  }, [pendingNearest, location.status, releaseLocation])\n`
  const insert = needle + `  useEffect(() => {\n    // A successful browser fix can still be unusable for a BRC-only lookup.\n    // Treat that as a completed request rather than waiting forever with a\n    // high-accuracy watch owned by \\`nearest\\` (#107).\n    if (!pendingNearest || location.status !== 'tracking' || !here || usableFix) return\n    const id = requestAnimationFrame(() => {\n      setPendingNearest(undefined)\n      releaseLocation('nearest')\n      setProbe('Your current location is too far from Black Rock City for nearest-service lookup')\n    })\n    return () => cancelAnimationFrame(id)\n  }, [pendingNearest, location.status, here, usableFix, releaseLocation])\n`
  if (!s.includes(needle)) throw new Error('App nearest block not found')
  return s.replace(needle, insert)
})

await edit('src/brc/geocode.ts', (s) => {
  const before = "const open = new RegExp(String.raw`^(${CLOCK})\\s*[,&@]?\\s*(\\d{1,5})(?![\\d:.])\\s*(?:'|ft|feet)?`, 'i').exec(raw)"
  const after = "const open = new RegExp(String.raw`^(${CLOCK})\\s*[,&@]?\\s*(\\d{1,5})(?![\\d:.])\\s*(?:'|ft|feet)?\\s*$`, 'i').exec(raw)"
  if (!s.includes(before)) throw new Error('open-playa regex not found')
  return s.replace(before, after)
})

await edit('.github/workflows/deploy.yml', (s) => {
  const before = "    if: github.event_name == 'workflow_dispatch' || github.ref_name == github.event.repository.default_branch"
  const after = "    if: github.ref_name == github.event.repository.default_branch"
  if (!s.includes(before)) throw new Error('deploy condition not found')
  return s.replace(before, after)
})

await edit('scripts/lib/api.mjs', (s) => {
  const start = s.indexOf('export function sanitizeEventOccurrences(kind, records) {')
  const end = s.indexOf('\n\nexport function validateDataset', start)
  if (start < 0 || end < 0) throw new Error('sanitize function not found')
  const replacement = `export function sanitizeEventOccurrences(kind, records) {\n  if (kind !== 'event') return { records, dropped: [], droppedEvents: [] }\n  const dropped = []\n  const droppedEvents = []\n  const sanitized = []\n  for (const record of records) {\n    if (!Array.isArray(record?.occurrence_set)) {\n      sanitized.push(record)\n      continue\n    }\n    const kept = record.occurrence_set.filter((occurrence) => {\n      const start = Date.parse(occurrence?.start_time)\n      const end = Date.parse(occurrence?.end_time)\n      const ok = Number.isFinite(start) && Number.isFinite(end) && end > start\n      if (!ok) {\n        dropped.push({\n          uid: record.uid,\n          title: record.title,\n          start: occurrence?.start_time,\n          end: occurrence?.end_time,\n        })\n      }\n      return ok\n    })\n    if (record.occurrence_set.length > 0 && kept.length === 0) {\n      droppedEvents.push({ uid: record.uid, title: record.title })\n      continue\n    }\n    sanitized.push(kept.length === record.occurrence_set.length ? record : { ...record, occurrence_set: kept })\n  }\n  return { records: sanitized, dropped, droppedEvents }\n}`
  return s.slice(0, start) + replacement + s.slice(end)
})

await edit('scripts/fetch-api.mjs', (s) => {
  s = s.replace(
    '    const { records, dropped } = sanitizeEventOccurrences(kind, fetched)',
    '    const { records, dropped, droppedEvents } = sanitizeEventOccurrences(kind, fetched)',
  )
  const needle = `    for (const occurrence of dropped) {\n      console.warn(\n        \`  · dropped one bad occurrence (\${occurrence.start} – \${occurrence.end}) from "\${occurrence.title ?? occurrence.uid}"\`,\n      )\n    }\n`
  const insert = needle + `    for (const event of droppedEvents) {\n      console.warn(\`  · dropped event with no valid occurrences: "\${event.title ?? event.uid}"\`)\n    }\n`
  if (!s.includes(needle)) throw new Error('fetch-api dropped loop not found')
  s = s.replace(needle, insert)
  s = s.replace('Set VITE_DATA_YEAR=${YEAR} to use it.', 'Set NEXT_PUBLIC_DATA_YEAR=${YEAR} to use it.')
  return s
})

await edit('scripts/lib/atomic-write.mjs', (s) => {
  s = s.replace("import { mkdir, readdir, rename, rm } from 'node:fs/promises'", "import { cp, mkdir, readdir, rename, rm } from 'node:fs/promises'")
  const start = s.indexOf('export async function commitAtomically(')
  const end = s.indexOf('\n\n/** Remove a staged directory', start)
  if (start < 0 || end < 0) throw new Error('commitAtomically not found')
  const replacement = `export async function commitAtomically(tempDir, targetDir, { replaceAll = false } = {}) {\n  await mkdir(dirname(targetDir), { recursive: true })\n\n  const swapDirectory = async (readyDir) => {\n    const displaced = \`\${targetDir}.prev-\${randomBytes(4).toString('hex')}\`\n    let hadPrevious = false\n    try {\n      await rename(targetDir, displaced)\n      hadPrevious = true\n    } catch (error) {\n      if (error.code !== 'ENOENT') throw error\n    }\n    try {\n      await rename(readyDir, targetDir)\n    } catch (error) {\n      if (hadPrevious) await rename(displaced, targetDir)\n      throw error\n    }\n    if (hadPrevious) await rm(displaced, { recursive: true, force: true })\n  }\n\n  if (replaceAll) {\n    await swapDirectory(tempDir)\n    return\n  }\n\n  // Merge mode still commits with one observable directory swap. Build a\n  // complete candidate snapshot beside the target first, overlay the files\n  // owned by this caller, then swap that whole directory in. A failure while\n  // preparing the candidate cannot mutate the live target (#112).\n  const merged = \`\${targetDir}.merged-\${randomBytes(4).toString('hex')}\`\n  try {\n    try {\n      await cp(targetDir, merged, { recursive: true })\n    } catch (error) {\n      if (error.code !== 'ENOENT') throw error\n      await mkdir(merged, { recursive: true })\n    }\n    for (const entry of await readdir(tempDir)) {\n      await cp(join(tempDir, entry), join(merged, entry), { recursive: true, force: true })\n    }\n    await swapDirectory(merged)\n    await rm(tempDir, { recursive: true, force: true })\n  } catch (error) {\n    await rm(merged, { recursive: true, force: true })\n    throw error\n  }\n}`
  return s.slice(0, start) + replacement + s.slice(end)
})

await edit('scripts/lib/event-range.mjs', (s) => {
  const start = s.indexOf('export function deriveEventRange(events) {')
  if (start < 0) throw new Error('deriveEventRange not found')
  const replacement = `export function deriveEventRange(events) {\n  const occurrences = events\n    .flatMap((event) => (event.occurrence_set ?? []).map((occurrence) => ({ event, occurrence })))\n    .map(({ event, occurrence }) => ({\n      event,\n      start: Date.parse(occurrence.start_time ?? ''),\n      end: Date.parse(occurrence.end_time ?? ''),\n    }))\n    .filter(({ start, end }) => Number.isFinite(start) && Number.isFinite(end))\n    .sort((a, b) => a.start - b.start)\n\n  if (occurrences.length === 0) return undefined\n\n  // Find the densest 14-day cluster by actual timestamps, not calendar month.\n  // This keeps one contiguous burn together across Aug/Sep and cannot be\n  // distorted by UTC month boundaries (#114).\n  let bestStartIndex = 0\n  let bestEndIndex = 0\n  let right = 0\n  for (let left = 0; left < occurrences.length; left += 1) {\n    if (right < left) right = left\n    const limit = occurrences[left].start + WINDOW_MS\n    while (right + 1 < occurrences.length && occurrences[right + 1].start <= limit) right += 1\n    if (right - left > bestEndIndex - bestStartIndex) {\n      bestStartIndex = left\n      bestEndIndex = right\n    }\n  }\n\n  const start = occurrences[bestStartIndex].start\n  const windowEnd = start + WINDOW_MS\n  const inWindow = occurrences.filter((o) => o.start >= start && o.start <= windowEnd && o.end <= windowEnd)\n  const end = Math.max(...inWindow.map((o) => o.end))\n  const inWindowSet = new Set(inWindow)\n\n  const outliers = occurrences\n    .filter((o) => !inWindowSet.has(o))\n    .map((o) => ({\n      uid: o.event.uid ?? o.event.event_id,\n      title: o.event.title,\n      start: new Date(o.start).toISOString(),\n      end: new Date(o.end).toISOString(),\n    }))\n\n  return {\n    rangeInfo: { startDate: new Date(start).toISOString(), endDate: new Date(end).toISOString() },\n    outliers,\n  }\n}\n`
  return s.slice(0, start) + replacement
})

await edit('README.md', (s) => {
  const before = 'Pushing to `master` runs the GitHub Pages workflow in `.github/workflows/deploy.yml`. The workflow fetches data, runs the quality gates against an E2E-instrumented production build, rebuilds without test instrumentation, retests the artifact that will actually ship, and publishes `out/`.'
  const after = 'Pushing to `master` runs the GitHub Pages workflow in `.github/workflows/deploy.yml`. The workflow fetches current data, builds one production `out/` artifact, runs smoke, accessibility, UI-invariant, and offline browser suites against that exact artifact using the runtime-only test hook, and uploads the same unchanged `out/` to Pages.'
  if (!s.includes(before)) throw new Error('README deployment text not found')
  return s.replace(before, after)
})

console.log('patched issues 107,108,110,111,112,113,114')
