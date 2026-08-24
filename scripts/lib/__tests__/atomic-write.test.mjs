import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { commitAtomically, discardStaged, stageTempDir } from '../atomic-write.mjs'

let base
let target

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'atomic-write-'))
  target = join(base, 'public', 'data', '2026')
})

afterEach(async () => {
  await rm(base, { recursive: true, force: true })
})

describe('stageTempDir', () => {
  it('returns an empty sibling of the target, not inside it', async () => {
    const staged = await stageTempDir(target)
    expect(staged).not.toBe(target)
    expect(staged.startsWith(`${target}.tmp-`)).toBe(true)
    // A sibling, i.e. still directly under public/data/ — that's what keeps
    // the later rename on one filesystem.
    expect(join(staged, '..')).toBe(join(target, '..'))
    await expect(readdir(staged)).resolves.toEqual([])
  })

  it('works whether or not the target directory exists yet', async () => {
    await expect(readdir(target).catch((e) => e.code)).resolves.toBe('ENOENT')
    const staged = await stageTempDir(target)
    await expect(readdir(staged)).resolves.toEqual([])
  })

  it('clears out any leftover staging directory of its own past name', async () => {
    // Not realistically reachable since the suffix is random, but stageTempDir
    // should still leave a fresh, empty directory even if one is already there.
    const staged = await stageTempDir(target)
    await writeFile(join(staged, 'leftover.json'), '{}')
    await rm(staged, { recursive: true, force: true })
    await mkdir(staged, { recursive: true })
    await expect(readdir(staged)).resolves.toEqual([])
  })
})

describe('commitAtomically — merge mode (default)', () => {
  it('creates the target directory and moves staged files into it', async () => {
    const staged = await stageTempDir(target)
    await writeFile(join(staged, 'art.json'), '[]')
    await writeFile(join(staged, 'camp.json'), '[]')

    await commitAtomically(staged, target)

    await expect(readFile(join(target, 'art.json'), 'utf8')).resolves.toBe('[]')
    await expect(readFile(join(target, 'camp.json'), 'utf8')).resolves.toBe('[]')
    // The staging directory is consumed by the commit.
    await expect(readdir(staged).catch((e) => e.code)).resolves.toBe('ENOENT')
  })

  it('overwrites same-named files but leaves everything else in the target alone', async () => {
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'layout.json'), 'old-geometry')
    await writeFile(join(target, 'art.json'), 'old-art')

    const staged = await stageTempDir(target)
    await writeFile(join(staged, 'art.json'), 'new-art')

    await commitAtomically(staged, target)

    await expect(readFile(join(target, 'art.json'), 'utf8')).resolves.toBe('new-art')
    // Files this refresh never fetched — e.g. geometry owned by a different
    // script sharing the same public/data/YEAR directory — must survive.
    await expect(readFile(join(target, 'layout.json'), 'utf8')).resolves.toBe('old-geometry')
  })
})

describe('commitAtomically — replaceAll mode', () => {
  it('replaces the target directory wholesale, dropping files the new snapshot omits', async () => {
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'art.json'), 'stale-listing')
    await writeFile(join(target, 'layout.json'), 'old-geometry')

    const staged = await stageTempDir(target)
    await writeFile(join(staged, 'layout.json'), 'new-geometry')

    await commitAtomically(staged, target, { replaceAll: true })

    await expect(readFile(join(target, 'layout.json'), 'utf8')).resolves.toBe('new-geometry')
    // A geometry refresh intentionally invalidates old listings; replaceAll is
    // where that invalidation happens, as part of the successful commit.
    await expect(readdir(target)).resolves.toEqual(['layout.json'])
  })

  it('works for a first-ever fetch, with no previous target directory', async () => {
    const staged = await stageTempDir(target)
    await writeFile(join(staged, 'layout.json'), 'geometry')

    await commitAtomically(staged, target, { replaceAll: true })

    await expect(readdir(target)).resolves.toEqual(['layout.json'])
  })
})

describe('discardStaged', () => {
  it('removes the staging directory and never touches the target', async () => {
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'art.json'), 'good-data')

    const staged = await stageTempDir(target)
    await writeFile(join(staged, 'art.json'), 'half-fetched')

    await discardStaged(staged)

    await expect(readdir(staged).catch((e) => e.code)).resolves.toBe('ENOENT')
    await expect(readFile(join(target, 'art.json'), 'utf8')).resolves.toBe('good-data')
  })

  it('does not throw if the staging directory is already gone', async () => {
    const staged = await stageTempDir(target)
    await rm(staged, { recursive: true, force: true })
    await expect(discardStaged(staged)).resolves.toBeUndefined()
  })
})

describe('a failure partway through staging never touches the target', () => {
  it('simulates a rollback: stage some good files, hit a bad one, discard, leave target untouched', async () => {
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'art.json'), 'previous-art')
    await writeFile(join(target, 'camp.json'), 'previous-camp')
    const before = await readdir(target)

    const staged = await stageTempDir(target)
    await writeFile(join(staged, 'art.json'), 'new-art')
    // The third fetch (camp, say) fails validation here — nothing calls
    // commitAtomically; the caller discards the stage instead.
    await discardStaged(staged)

    await expect(readdir(target)).resolves.toEqual(before)
    await expect(readFile(join(target, 'art.json'), 'utf8')).resolves.toBe('previous-art')
    await expect(readFile(join(target, 'camp.json'), 'utf8')).resolves.toBe('previous-camp')
  })
})
