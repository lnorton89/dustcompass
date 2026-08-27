/**
 * @vitest-environment jsdom
 */
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ArtAudioGuide } from '../ArtAudioGuide'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

describe('ArtAudioGuide UID isolation (#100)', () => {
  const indexFetch = deferred<Response>()
  const revokeObjectURL = vi.fn()
  const createObjectURL = vi.fn(() => 'blob:art-a')

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => indexFetch.promise))
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true })
    const cache = {
      match: vi.fn((key: string) =>
        key.endsWith('/art-a.mp3')
          ? Promise.resolve(new Response(new Blob(['audio-a']), { headers: { 'content-length': '7' } }))
          : Promise.resolve(undefined),
      ),
      put: vi.fn(),
      delete: vi.fn(),
    }
    Object.defineProperty(window, 'caches', {
      value: { open: vi.fn(() => Promise.resolve(cache)) },
      configurable: true,
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    // @ts-expect-error test-only cleanup
    delete window.caches
  })

  it('removes and revokes art A audio before uncached art B resolves', async () => {
    const { container, rerender, unmount } = render(<ArtAudioGuide uid="art-a" />)

    await waitFor(() => {
      const audio = container.querySelector('audio')
      expect(audio?.getAttribute('src')).toBe('blob:art-a')
    })

    rerender(<ArtAudioGuide uid="art-b" />)
    await waitFor(() => expect(container.querySelector('audio')).toBeNull())
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:art-a')

    // B's ZIP index request is intentionally still pending: the old player is
    // already gone before any result for B exists.
    expect(indexFetch.resolve).toBeTypeOf('function')
    unmount()
  })
})
