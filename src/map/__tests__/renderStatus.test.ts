import { describe, expect, it } from 'vitest'
import { nextRenderStatus, type RenderStatus } from '../MapView'

/**
 * A blank/background-only map has no other way to tell the user anything is
 * wrong. These transitions decide when that recovery screen shows — get them
 * wrong in one direction and a real failure never surfaces; get them wrong in
 * the other and an ordinary transient warning blanks a perfectly working map.
 */
describe('nextRenderStatus', () => {
  it('treats an error or watchdog timeout during startup as fatal', () => {
    expect(nextRenderStatus('starting', 'error')).toBe('failed')
    expect(nextRenderStatus('starting', 'timeout')).toBe('failed')
  })

  it('does not fail an already-loaded map on a transient error or a stale timeout', () => {
    expect(nextRenderStatus('ready', 'error')).toBe('ready')
    expect(nextRenderStatus('ready', 'timeout')).toBe('ready')
  })

  it('load always resolves to ready', () => {
    expect(nextRenderStatus('starting', 'load')).toBe('ready')
  })

  it('context loss fails the map even after it was already ready', () => {
    expect(nextRenderStatus('ready', 'context-lost')).toBe('failed')
  })

  it('context restoration recovers a failed map', () => {
    expect(nextRenderStatus('failed', 'context-restored')).toBe('ready')
  })

  it('never gets stuck once failed except by an explicit restore/load', () => {
    const stillFailed: RenderStatus = nextRenderStatus('failed', 'error')
    expect(stillFailed).toBe('failed')
  })
})
