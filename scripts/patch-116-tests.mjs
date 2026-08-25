import { readFile, writeFile } from 'node:fs/promises'

async function edit(path, transform) {
  const before = await readFile(path, 'utf8')
  const after = transform(before)
  if (after === before) throw new Error(`No change made to ${path}`)
  await writeFile(path, after)
}

await edit('src/brc/geocode.ts', (source) => {
  const before = "const open = new RegExp(String.raw`^(${CLOCK})\\s*[,&@]?\\s*(\\d{1,5})(?![\\d:.])\\s*(?:'|ft|feet)?\\s*$`, 'i').exec(raw)"
  const after = "const open = new RegExp(String.raw`^(${CLOCK})\\s*[,&@]?\\s*(\\d{1,5})(?![\\d:.])\\s*(?:'|ft|feet)?(?:\\s*,?\\s*Open Playa)?\\s*$`, 'i').exec(raw)"
  if (!source.includes(before)) throw new Error('anchored open-playa parser not found')
  return source.replace(before, after)
})

await edit('src/brc/__tests__/geocode.test.ts', (source) => {
  const needle = `  it('accepts open-playa distances, as art listings use', () => {\n    const at = geocode("12:00 2500', Open Playa", layout)\n    expect(at?.distanceFeet).toBe(2500)\n    expect(at?.clock).toBe('12:00')\n  })`
  const replacement = needle + `\n\n  it('does not geocode arbitrary text after a valid open-playa prefix', () => {\n    expect(geocode('7:30 2000 feet near the Temple', layout)).toBeUndefined()\n    expect(geocode("7:30 2000' / then 8:00 & B", layout)).toBeUndefined()\n  })`
  if (!source.includes(needle)) throw new Error('open-playa geocode test not found')
  return source.replace(needle, replacement)
})

await edit('scripts/lib/__tests__/api.test.mjs', (source) => {
  const oneBad = `  it('drops an occurrence whose end is not after its start', () => {\n    const { records, dropped } = sanitizeEventOccurrences('event', [\n      {\n        uid: 'e1',\n        title: 'Fire Talk',\n        occurrence_set: [\n          { start_time: '2026-08-30T12:00:00-07:00', end_time: '2026-08-30T12:00:00-07:00' },\n        ],\n      },\n    ])\n    expect(records[0].occurrence_set).toEqual([])\n    expect(dropped).toHaveLength(1)\n  })`
  const oneBadReplacement = `  it('drops an event when its only occurrence is invalid', () => {\n    const { records, dropped, droppedEvents } = sanitizeEventOccurrences('event', [\n      {\n        uid: 'e1',\n        title: 'Fire Talk',\n        occurrence_set: [\n          { start_time: '2026-08-30T12:00:00-07:00', end_time: '2026-08-30T12:00:00-07:00' },\n        ],\n      },\n    ])\n    expect(records).toEqual([])\n    expect(dropped).toHaveLength(1)\n    expect(droppedEvents).toEqual([{ uid: 'e1', title: 'Fire Talk' }])\n  })`
  if (!source.includes(oneBad)) throw new Error('single invalid occurrence test not found')
  source = source.replace(oneBad, oneBadReplacement)

  const allBad = `  it('keeps the event even when every one of its occurrences is bad', () => {\n    const { records } = sanitizeEventOccurrences('event', [\n      {\n        uid: 'e1',\n        title: 'Fire Talk',\n        occurrence_set: [{ start_time: 'not-a-date', end_time: 'also-not-a-date' }],\n      },\n    ])\n    expect(records).toHaveLength(1)\n    expect(records[0].occurrence_set).toEqual([])\n  })`
  const allBadReplacement = `  it('does not retain an empty shell when every occurrence is bad', () => {\n    const { records, droppedEvents } = sanitizeEventOccurrences('event', [\n      {\n        uid: 'e1',\n        title: 'Fire Talk',\n        occurrence_set: [{ start_time: 'not-a-date', end_time: 'also-not-a-date' }],\n      },\n    ])\n    expect(records).toEqual([])\n    expect(droppedEvents).toEqual([{ uid: 'e1', title: 'Fire Talk' }])\n  })`
  if (!source.includes(allBad)) throw new Error('all-invalid occurrence test not found')
  return source.replace(allBad, allBadReplacement)
})
