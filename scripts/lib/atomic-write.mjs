/**
 * Turn a fetch script's slow, fallible work — network requests, validation,
 * derived files — into a single all-or-nothing commit against `public/data`.
 *
 * The pattern: stage the entire new snapshot into a temp directory that is
 * never opened for writing until every fetch/validate/derive step upstream
 * has already succeeded, then swap it in with `fs.rename`, which is atomic
 * when both paths are on the same filesystem. `stageTempDir` places that temp
 * directory as a sibling of the target, inside `public/data/`, specifically
 * to guarantee that. Until the swap, the target directory is not touched at
 * all, so any failure — network, validation, a downstream derivation — walks
 * away with `discardStaged` and leaves the previous snapshot exactly as it was.
 */
import { mkdir, readdir, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'

/**
 * Create a fresh, empty staging directory next to `targetDir` and return its
 * path. Call this before any fetching starts, then write the new snapshot's
 * files into the returned directory instead of `targetDir` itself.
 */
export async function stageTempDir(targetDir) {
  const tempDir = `${targetDir}.tmp-${randomBytes(4).toString('hex')}`
  await rm(tempDir, { recursive: true, force: true })
  await mkdir(tempDir, { recursive: true })
  return tempDir
}

/**
 * Commit a staged directory over the real one.
 *
 * Default (merge) mode moves each entry out of `tempDir` into `targetDir`,
 * overwriting same-named files but leaving anything else already in
 * `targetDir` untouched. Use this when the script only owns some of the files
 * a shared directory holds — `fetch-api.mjs` and `fetch-archive.mjs` write
 * listings into the same `public/data/YEAR` that `fetch-data.mjs` writes
 * geometry into, and must not disturb files they didn't fetch.
 *
 * `replaceAll: true` instead swaps `targetDir` out wholesale for `tempDir`,
 * displacing (and then discarding) whatever was there. Use this when the
 * script is the sole owner of the directory and a successful refresh is
 * supposed to fully replace its previous contents — `fetch-data.mjs` uses
 * this because a geometry refresh intentionally invalidates any listings a
 * prior fetch left in the same directory, and that invalidation belongs in
 * this same all-or-nothing swap rather than an eager pre-step.
 */
export async function commitAtomically(tempDir, targetDir, { replaceAll = false } = {}) {
  await mkdir(dirname(targetDir), { recursive: true })

  if (replaceAll) {
    const displaced = `${targetDir}.prev-${randomBytes(4).toString('hex')}`
    let hadPrevious = false
    try {
      await rename(targetDir, displaced)
      hadPrevious = true
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    try {
      await rename(tempDir, targetDir)
    } catch (error) {
      // The swap itself failed (e.g. cross-device); put the previous snapshot
      // straight back rather than leaving the target directory missing.
      if (hadPrevious) await rename(displaced, targetDir)
      throw error
    }
    if (hadPrevious) await rm(displaced, { recursive: true, force: true })
    return
  }

  await mkdir(targetDir, { recursive: true })
  for (const entry of await readdir(tempDir)) {
    await rename(join(tempDir, entry), join(targetDir, entry))
  }
  await rm(tempDir, { recursive: true, force: true })
}

/** Remove a staged directory after a failed refresh. Never touches the target. */
export async function discardStaged(tempDir) {
  await rm(tempDir, { recursive: true, force: true })
}
