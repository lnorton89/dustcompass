import { describe, expect, it, vi } from 'vitest'
import { requestPersistentStorage } from '../ui/PwaStatus'

function storage(overrides: Partial<StorageManager>): StorageManager {
  return overrides as StorageManager
}

describe('requestPersistentStorage', () => {
  it('reports already-persisted storage without requesting again', async () => {
    const persist = vi.fn(async () => true)
    const result = await requestPersistentStorage(storage({ persisted: async () => true, persist }))
    expect(result).toBe('protected')
    expect(persist).not.toHaveBeenCalled()
  })

  it('reports protection when the browser grants persistence', async () => {
    const result = await requestPersistentStorage(storage({ persisted: async () => false, persist: async () => true }))
    expect(result).toBe('protected')
  })

  it('keeps the offline map usable when persistence is denied', async () => {
    const result = await requestPersistentStorage(storage({ persisted: async () => false, persist: async () => false }))
    expect(result).toBe('best-effort')
  })

  it('reports unsupported when the persistence API is unavailable', async () => {
    expect(await requestPersistentStorage(undefined)).toBe('unsupported')
    expect(await requestPersistentStorage(storage({}))).toBe('unsupported')
  })

  it('falls back to best-effort when the persistence API rejects', async () => {
    const result = await requestPersistentStorage(storage({ persisted: async () => { throw new Error('blocked') }, persist: async () => true }))
    expect(result).toBe('best-effort')
  })
})
