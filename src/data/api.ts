// Client for the app's own Netlify Functions. The Garmin key never reaches the
// browser: functions hold it and answer only requests carrying your passphrase.

import { useStore } from './store'
import type { BodyEntry, Daily, GarminActivity, Stream } from './types'

export interface ServerStatus {
  configured: boolean
  hasKey: boolean
  lastSync?: string
  activities: number
  days: number
  backfillDone: boolean
  pending: number
  message?: string
  warnings?: Record<string, string>
}

export interface SyncStep {
  done: boolean
  added: number
  total: number
  message: string
  /** Garmin rate-limited the server: stop, and carry on next time */
  paused?: boolean
  /** another sync holds the lock: wait a moment and ask again */
  busy?: boolean
  /** when the server's data last changed */
  dataAt?: string
}

export interface ServerData {
  activities: GarminActivity[]
  dailies: Daily[]
  body: BodyEntry[]
  profile?: { hrMax?: number; hrRest?: number }
  updatedAt: string | null
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
export const syncStep = (fresh = false) => call<SyncStep>(fresh ? 'sync?fresh=1' : 'sync', { method: 'POST' })
export const pullData = () => call<ServerData>('data')

export async function fetchStream(activityId: string): Promise<Stream | null> {
  try {
    return await call<Stream>(`stream?id=${encodeURIComponent(activityId)}`)
  } catch {
    return null
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Store what the server has. The first sync also takes max and resting HR from Garmin's zone settings. */
async function pull() {
  const { sync, setGarmin, setProfile, setSync } = useStore.getState()
  const data = await pullData()
  if (!sync.lastSync && data.profile) {
    const { hrMax, hrRest } = data.profile
    setProfile({ ...(hrMax && hrMax > 120 ? { hrMax } : {}), ...(hrRest && hrRest > 30 ? { hrRest } : {}) })
  }
  setGarmin({ activities: data.activities, dailies: data.dailies, body: data.body })
  setSync({ mode: 'live', status: 'idle', lastSync: new Date().toISOString(), dataAt: data.updatedAt ?? undefined, message: `Synced ${data.activities.length} activities` })
  return data
}

/**
 * Sync now: run steps until the server says it's caught up, then pull everything
 * down. The first sync walks two years of history, so it can take a few minutes;
 * if you leave, opening the app again (or the morning job) carries on.
 */
export async function syncAll(onProgress: (s: SyncStep) => void): Promise<number> {
  const { setSync } = useStore.getState()
  setSync({ status: 'syncing', message: 'Talking to Garmin…' })
  try {
    let added = 0
    for (let i = 0; i < 80; i++) {
      const step = await syncStep(i === 0)
      added += step.added
      onProgress(step)
      setSync({ message: step.message })
      if (step.done || step.paused) break
      if (step.busy) await wait(3000)
    }
    await pull()
    return added
  } catch (e) {
    const msg = e instanceof ApiError && e.status === 401 ? 'Wrong passphrase.' : e instanceof Error ? e.message : String(e)
    setSync({ status: 'error', message: msg })
    throw e
  }
}

/**
 * On opening the app: let the server catch up, then download only if something
 * changed. The server calls Garmin at most every 10 minutes however often the
 * app opens, so this is cheap. Quiet on failure.
 */
export async function refresh(): Promise<void> {
  const { sync } = useStore.getState()
  if (sync.mode !== 'live' || !sync.passphrase || sync.status === 'syncing') return
  try {
    let step = await syncStep()
    // history still coming in: keep going for a while as the app is open anyway
    for (let i = 0; i < 10 && !step.done && !step.paused && !step.busy; i++) step = await syncStep()
    if (!step.dataAt || step.dataAt !== useStore.getState().sync.dataAt) await pull()
  } catch {
    /* offline, or the server is busy: the cached copy stays */
  }
}
