import { describe, expect, it } from 'vitest'
import { __audioGuideTest } from '../ui/ArtAudioGuide'

function centralEntry(name: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(name)
  const bytes = new Uint8Array(46 + encoded.length)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x02014b50, true)
  view.setUint16(10, 8, true)
  view.setUint32(20, 1234, true)
  view.setUint32(24, 4321, true)
  view.setUint16(28, encoded.length, true)
  view.setUint32(42, 99, true)
  bytes.set(encoded, 46)
  return bytes.buffer
}

describe('2026 art audio guide ZIP index', () => {
  it('associates tracks by UID filename rather than title', () => {
    const index = __audioGuideTest.parseCentralDirectory(centralEntry('tracks/a2I0V00000123AbQAI.mp3'))
    const entry = index.get('a2i0v00000123abqai')
    expect(entry).toMatchObject({
      name: 'tracks/a2I0V00000123AbQAI.mp3',
      compression: 8,
      compressedSize: 1234,
      uncompressedSize: 4321,
      localHeaderOffset: 99,
    })
  })

  it('ignores non-MP3 archive members', () => {
    expect(__audioGuideTest.uidFromEntryName('Theme.wav')).toBeUndefined()
    expect(__audioGuideTest.uidFromEntryName('notes.txt')).toBeUndefined()
  })
})
