import { readFile, writeFile } from 'node:fs/promises'

async function edit(path, fn) {
  const before = await readFile(path, 'utf8')
  const after = fn(before)
  if (after === before) throw new Error(`No change made to ${path}`)
  await writeFile(path, after)
}

await edit('src/App.tsx', (s) => {
  const needle = [
    '  useEffect(() => {',
    '    if (!pendingNearest || !locationWatchHasFailed(location.status)) return',
    '    const id = requestAnimationFrame(() => {',
    '      setPendingNearest(undefined)',
    "      releaseLocation('nearest')",
    "      setProbe('Could not get your location')",
    '    })',
    '    return () => cancelAnimationFrame(id)',
    '  }, [pendingNearest, location.status, releaseLocation])',
    '',
  ].join('\n')
  const extra = [
    '  useEffect(() => {',
    '    // A successful browser fix can still be unusable for a BRC-only lookup.',
    '    // Treat that as a completed request rather than waiting forever with a',
    '    // high-accuracy watch owned by nearest (#107).',
    "    if (!pendingNearest || location.status !== 'tracking' || !here || usableFix) return",
    '    const id = requestAnimationFrame(() => {',
    '      setPendingNearest(undefined)',
    "      releaseLocation('nearest')",
    "      setProbe('Your current location is too far from Black Rock City for nearest-service lookup')",
    '    })',
    '    return () => cancelAnimationFrame(id)',
    '  }, [pendingNearest, location.status, here, usableFix, releaseLocation])',
    '',
  ].join('\n')
  if (!s.includes(needle)) throw new Error('App nearest block not found')
  return s.replace(needle, needle + extra)
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
  const replacement = [
    'export function sanitizeEventOccurrences(kind, records) {',
    "  if (kind !== 'event') return { records, dropped: [], droppedEvents: [] }",
    '  const dropped = []',
    '  const droppedEvents = []',
    '  const sanitized = []',
    '  for (const record of records) {',
    '    if (!Array.isArray(record?.occurrence_set)) {',
    '      sanitized.push(record)',
    '      continue',
    '    }',
    '    const kept = record.occurrence_set.filter((occurrence) => {',
    '      const start = Date.parse(occurrence?.start_time)',
    '      const end = Date.parse(occurrence?.end_time)',
    '      const ok = Number.isFinite(start) && Number.isFinite(end) && end > start',
    '      if (!ok) {',
    '        dropped.push({',
    '          uid: record.uid,',
    '          title: record.title,',
    '          start: occurrence?.start_time,',
    '          end: occurrence?.end_time,',
    '        })',
    '      }',
    '      return ok',
    '    })',
    '    if (record.occurrence_set.length > 0 && kept.length === 0) {',
    '      droppedEvents.push({ uid: record.uid, title: record.title })',
    '      continue',
    '    }',
    '    sanitized.push(kept.length === record.occurrence_set.length ? record : { ...record, occurrence_set: kept })',
    '  }',
    '  return { records: sanitized, dropped, droppedEvents }',
    '}',
  ].join('\n')
  return s.slice(0, start) + replacement + s.slice(end)
})

await edit('scripts/fetch-api.mjs', (s) => {
  const beforeDecl = '    const { records, dropped } = sanitizeEventOccurrences(kind, fetched)'
  const afterDecl = '    const { records, dropped, droppedEvents } = sanitizeEventOccurrences(kind, fetched)'
  if (!s.includes(beforeDecl)) throw new Error('fetch-api sanitize declaration not found')
  s = s.replace(beforeDecl, afterDecl)
  const marker = '    const result = validateDataset(kind, records)'
  if (!s.includes(marker)) throw new Error('fetch-api validation marker not found')
  s = s.replace(marker, [
    '    for (const event of droppedEvents) {',
    '      console.warn(`  · dropped event with no valid occurrences: "${event.title ?? event.uid}"`)',
    '    }',
    marker,
  ].join('\n'))
  s = s.replace('Set VITE_DATA_YEAR=${YEAR} to use it.', 'Set NEXT_PUBLIC_DATA_YEAR=${YEAR} to use it.')
  return s
})

await edit('scripts/lib/atomic-write.mjs', (s) => {
  s = s.replace("import { mkdir, readdir, rename, rm } from 'node:fs/promises'", "import { cp, mkdir, readdir, rename, rm } from 'node:fs/promises'")
  const start = s.indexOf('export async function commitAtomically(')
  const end = s.indexOf('\n\n/** Remove a staged directory', start)
  if (start < 0 || end < 0) throw new Error('commitAtomically not found')
  const replacement = [
    'export async function commitAtomically(tempDir, targetDir, { replaceAll = false } = {}) {',
    '  await mkdir(dirname(targetDir), { recursive: true })',
    '',
    '  const swapDirectory = async (readyDir) => {',
    "    const displaced = `${targetDir}.prev-${randomBytes(4).toString('hex')}`",
    '    let hadPrevious = false',
    '    try {',
    '      await rename(targetDir, displaced)',
    '      hadPrevious = true',
    '    } catch (error) {',
    "      if (error.code !== 'ENOENT') throw error",
    '    }',
    '    try {',
    '      await rename(readyDir, targetDir)',
    '    } catch (error) {',
    '      if (hadPrevious) await rename(displaced, targetDir)',
    '      throw error',
    '    }',
    '    if (hadPrevious) await rm(displaced, { recursive: true, force: true })',
    '  }',
    '',
    '  if (replaceAll) {',
    '    await swapDirectory(tempDir)',
    '    return',
    '  }',
    '',
    '  // Merge mode prepares a complete candidate snapshot before the one observable swap (#112).',
    "  const merged = `${targetDir}.merged-${randomBytes(4).toString('hex')}`",
    '  try {',
    '    try {',
    '      await cp(targetDir, merged, { recursive: true })',
    '    } catch (error) {',
    "      if (error.code !== 'ENOENT') throw error",
    '      await mkdir(merged, { recursive: true })',
    '    }',
    '    for (const entry of await readdir(tempDir)) {',
    '      await cp(join(tempDir, entry), join(merged, entry), { recursive: true, force: true })',
    '    }',
    '    await swapDirectory(merged)',
    '    await rm(tempDir, { recursive: true, force: true })',
    '  } catch (error) {',
    '    await rm(merged, { recursive: true, force: true })',
    '    throw error',
    '  }',
    '}',
  ].join('\n')
  return s.slice(0, start) + replacement + s.slice(end)
})

await edit('scripts/lib/event-range.mjs', (s) => {
  const start = s.indexOf('export function deriveEventRange(events) {')
  if (start < 0) throw new Error('deriveEventRange not found')
  const replacement = [
    'export function deriveEventRange(events) {',
    '  const occurrences = events',
    '    .flatMap((event) => (event.occurrence_set ?? []).map((occurrence) => ({ event, occurrence })))',
    '    .map(({ event, occurrence }) => ({',
    '      event,',
    "      start: Date.parse(occurrence.start_time ?? ''),",
    "      end: Date.parse(occurrence.end_time ?? ''),",
    '    }))',
    '    .filter(({ start, end }) => Number.isFinite(start) && Number.isFinite(end))',
    '    .sort((a, b) => a.start - b.start)',
    '',
    '  if (occurrences.length === 0) return undefined',
    '',
    '  let bestStartIndex = 0',
    '  let bestEndIndex = 0',
    '  let right = 0',
    '  for (let left = 0; left < occurrences.length; left += 1) {',
    '    if (right < left) right = left',
    '    const limit = occurrences[left].start + WINDOW_MS',
    '    while (right + 1 < occurrences.length && occurrences[right + 1].start <= limit) right += 1',
    '    if (right - left > bestEndIndex - bestStartIndex) {',
    '      bestStartIndex = left',
    '      bestEndIndex = right',
    '    }',
    '  }',
    '',
    '  const start = occurrences[bestStartIndex].start',
    '  const windowEnd = start + WINDOW_MS',
    '  const inWindow = occurrences.filter((o) => o.start >= start && o.start <= windowEnd && o.end <= windowEnd)',
    '  const end = Math.max(...inWindow.map((o) => o.end))',
    '  const inWindowSet = new Set(inWindow)',
    '',
    '  const outliers = occurrences',
    '    .filter((o) => !inWindowSet.has(o))',
    '    .map((o) => ({',
    '      uid: o.event.uid ?? o.event.event_id,',
    '      title: o.event.title,',
    '      start: new Date(o.start).toISOString(),',
    '      end: new Date(o.end).toISOString(),',
    '    }))',
    '',
    '  return {',
    '    rangeInfo: { startDate: new Date(start).toISOString(), endDate: new Date(end).toISOString() },',
    '    outliers,',
    '  }',
    '}',
    '',
  ].join('\n')
  return s.slice(0, start) + replacement
})

await edit('README.md', (s) => {
  const before = 'Pushing to `master` runs the GitHub Pages workflow in `.github/workflows/deploy.yml`. The workflow fetches data, runs the quality gates against an E2E-instrumented production build, rebuilds without test instrumentation, retests the artifact that will actually ship, and publishes `out/`.'
  const after = 'Pushing to `master` runs the GitHub Pages workflow in `.github/workflows/deploy.yml`. The workflow fetches current data, builds one production `out/` artifact, runs smoke, accessibility, UI-invariant, and offline browser suites against that exact artifact using the runtime-only test hook, and uploads the same unchanged `out/` to Pages.'
  if (!s.includes(before)) throw new Error('README deployment text not found')
  return s.replace(before, after)
})

console.log('patched issues 107,108,110,111,112,113,114')
