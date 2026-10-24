// Storage for the sync functions: one Netlify Blobs store holding JSON documents.
// Tests swap in the in-memory version, which behaves the same for conditional writes.

import { getStore } from '@netlify/blobs'

export interface WriteOptions {
  /** write only if the key doesn't exist yet */
  onlyIfNew?: boolean
  /** write only if the stored copy still has this etag */
  onlyIfMatch?: string
}

export interface KV {
  get<T>(key: string): Promise<T | null>
  getTagged<T>(key: string): Promise<{ data: T; etag?: string } | null>
  /** resolves false when a conditional write didn't happen */
  set(key: string, value: unknown, opts?: WriteOptions): Promise<boolean>
  del(key: string): Promise<void>
}

export function blobs(): KV {
  // strong consistency: a sync step must see what the previous step wrote a second ago
  const store = getStore({ name: 'overreach', consistency: 'strong' })
  return {
    get: async (key) => (await store.get(key, { type: 'json' })) ?? null,
    getTagged: async (key) => {
      const r = await store.getWithMetadata(key, { type: 'json' })
      return r ? { data: r.data, etag: r.etag } : null
    },
    set: async (key, value, opts) => {
      const r = opts?.onlyIfMatch
        ? await store.setJSON(key, value, { onlyIfMatch: opts.onlyIfMatch })
        : opts?.onlyIfNew
          ? await store.setJSON(key, value, { onlyIfNew: true })
          : await store.setJSON(key, value)
      return r.modified
    },
    del: (key) => store.delete(key),
  }
}

export function memoryKV(): KV & { data: Map<string, string> } {
  const data = new Map<string, string>()
  const tags = new Map<string, string>()
  let n = 0
  return {
    data,
    get: async (key) => (data.has(key) ? JSON.parse(data.get(key)!) : null),
    getTagged: async (key) => (data.has(key) ? { data: JSON.parse(data.get(key)!), etag: tags.get(key) } : null),
    set: async (key, value, opts) => {
      if (opts?.onlyIfNew && data.has(key)) return false
      if (opts?.onlyIfMatch && tags.get(key) !== opts.onlyIfMatch) return false
      data.set(key, JSON.stringify(value))
      tags.set(key, `e${++n}`)
      return true
    },
    del: async (key) => {
      data.delete(key)
      tags.delete(key)
    },
  }
}
