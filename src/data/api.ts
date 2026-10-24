// Client for the app's own Netlify Functions. The Garmin key never reaches the
// browser: functions hold it and answer only requests carrying your passphrase.

import { useStore } from './store'
import type { Activity, BodyEntry, Daily, Stream } from './types'

export interface ServerStatus {
  configured: boolean
  hasKey: boolean
  lastSync?: string
  activities: number
  days: number
  backfillDone: boolean
  message?: string
}

export interface SyncStep {
  done: boolean
  added: number
  total: number
  message: string
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const pass = useStore.getState().sync.passphrase ?? ''
  const res = await fetch(`/api/${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-overreach-key': pass, ...(init.headers ?? {}) },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let msg = text
    try {
      msg = (JSON.parse(text) as { error?: string }).error ?? text
    } catch {
      /* plain text */
    }
    throw new ApiError(res.status, msg || `Request failed (${res.status})`)
  }
  return (await res.json()) as T
}

export const getStatus = () => call<ServerStatus>('status')
export const syncStep = () => call<SyncStep>('sync', { method: 'POST' })
export const pullData = () => call<{ activities: Activity[]; dailies: Daily[]; body: BodyEntry[]; updatedAt: string }>('data')

export async function fetchStream(activityId: string): Promise<Stream | null> {
  try {
    return await call<Stream>(`stream?id=${encodeURIComponent(activityId)}`)
  } catch {
    return null
  }
}

/** Run sync steps until the server says it's caught up, then pull everything down. */
export async function syncAll(onProgress: (s: SyncStep) => void): Promise<number> {
  const { setSync, setGarmin } = useStore.getState()
  setSync({ status: 'syncing', message: 'Talking to Garmin…' })
  try {
    let added = 0
    for (let i = 0; i < 60; i++) {
      const step = await syncStep()
      added += step.added
      onProgress(step)
      setSync({ message: step.message })
      if (step.done) break
    }
    const data = await pullData()
    setGarmin({ activities: data.activities, dailies: data.dailies, body: data.body })
    setSync({ mode: 'live', status: 'idle', lastSync: new Date().toISOString(), message: `Synced ${data.activities.length} activities` })
    return added
  } catch (e) {
    const msg = e instanceof ApiError && e.status === 401 ? 'Wrong passphrase.' : e instanceof Error ? e.message : String(e)
    setSync({ status: 'error', message: msg })
    throw e
  }
}
