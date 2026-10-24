// One sync step: a bounded slice of work that leaves the store consistent, so the
// phone can call it in a loop and the hourly job can pick up where it stopped.
//
// Each step, in order, while time is left:
//   1. recent: newest activities, the last two weeks of health data, weight
//      (skipped if it ran in the last 10 minutes, unless forced)
//   2. football games waiting for their FIT file (GPS speed → sprints, top speed)
//   3. activity history, 50 at a time, back HISTORY_DAYS
//   4. health history, 180 days at a time, back HISTORY_DAYS

import type { BodyEntry, Daily, GarminActivity } from '../../src/data/types'
import { fitFromDownload, footballSummary, streamFromFit } from './fit'
import { GarminError, type Garmin } from './garmin'
import type { KV } from './kv'
import { foldHrv, foldSleep, foldSummaries, foldWeight, hrProfile, list, mapActivity, shape, type Obj } from './mapping'

export const HISTORY_DAYS = 730
const RECENT_DAYS = 14
/** sleep stages only matter for recent months; older nights keep the duration from the daily summary */
const SLEEP_DAYS = 120
const PAGE = 50
const DAILY_CHUNK = 180
const SLEEP_CHUNK = 28
const RECENT_EVERY_MS = 10 * 60_000
const LOCK_MS = 55_000
/** be gentle with Garmin: no more requests than this per step */
const MAX_CALLS = 30

const SEARCH = '/activitylist-service/activities/search/activities'

export interface SyncState {
  v: 1
  /** the last time everything was caught up */
  lastSync?: string
  /** the last time the newest activities and days were fetched */
  recentAt?: string
  activityOffset: number
  activitiesDone: boolean
  /** health backfill: the next chunk ends the day before this */
  dailiesBefore?: string
  dailiesDone: boolean
  /** football games waiting for their FIT file */
  pending: string[]
  profile?: { hrMax?: number; hrRest?: number; at: string }
  error?: { at: string; message: string }
  /** endpoints that failed on the last pass, by name */
  warnings?: Record<string, string>
}

export interface Data {
  activities: Record<string, GarminActivity>
  dailies: Record<string, Daily>
  body: Record<string, BodyEntry>
}

export interface StepResult {
  done: boolean
  added: number
  total: number
  message: string
  /** Garmin rate-limited us: stop calling until later */
  paused?: boolean
  /** another step is running (the hourly job, or a second phone): try again shortly */
  busy?: boolean
}

export const freshState = (): SyncState => ({ v: 1, activityOffset: 0, activitiesDone: false, dailiesDone: false, pending: [] })

const dayOf = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (iso: string, n: number) => dayOf(new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000))
const monthYear = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })

export async function loadAll(kv: KV): Promise<{ state: SyncState; data: Data }> {
  const [state, activities, dailies, body] = await Promise.all([
    kv.get<SyncState>('state'),
    kv.get<Data['activities']>('activities'),
    kv.get<Data['dailies']>('dailies'),
    kv.get<Data['body']>('body'),
  ])
  return { state: { ...freshState(), ...state }, data: { activities: activities ?? {}, dailies: dailies ?? {}, body: body ?? {} } }
}

export function isCaughtUp(s: SyncState) {
  return s.activitiesDone && s.dailiesDone && s.pending.length === 0
}

async function lock(kv: KV, owner: string): Promise<boolean> {
  const claim = { owner, until: Date.now() + LOCK_MS }
  if (await kv.set('lock', claim, { onlyIfNew: true })) return true
  const held = await kv.getTagged<{ owner: string; until: number }>('lock')
  if (!held) return kv.set('lock', claim, { onlyIfNew: true })
  if (held.data.until > Date.now()) return false
  return kv.set('lock', claim, { onlyIfMatch: held.etag })
}

async function unlock(kv: KV, owner: string) {
  const held = await kv.get<{ owner: string }>('lock')
  if (held?.owner === owner) await kv.del('lock')
}

export interface StepOptions {
  kv: KV
  api: Garmin
  /** stop starting new work after this long */
  budgetMs: number
  /** fetch the newest data even if that ran a minute ago (the hourly job, pull-to-refresh) */
  forceRecent?: boolean
  now?: Date
}

export async function runStep(opts: StepOptions): Promise<StepResult> {
  const owner = Math.random().toString(36).slice(2)
  if (!(await lock(opts.kv, owner))) {
    const { data } = await loadAll(opts.kv)
    return { done: false, added: 0, total: Object.keys(data.activities).length, message: 'Another sync is running…', busy: true }
  }
  try {
    return await step(opts)
  } finally {
    await unlock(opts.kv, owner)
  }
}

async function step({ kv, api, budgetMs, forceRecent = false, now = new Date() }: StepOptions): Promise<StepResult> {
  const t0 = Date.now()
  const calls0 = api.calls
  const left = () => (api.calls - calls0 >= MAX_CALLS ? 0 : budgetMs - (Date.now() - t0))
  const { state, data } = await loadAll(kv)
  const firstEver = Object.keys(data.activities).length === 0 && state.activityOffset === 0
  const dirty = { activities: false, dailies: false, body: false }
  const shapes: Record<string, unknown> = {}
  // a warning stays until that endpoint answers again
  const warnings: Record<string, string> = { ...state.warnings }
  const today = dayOf(now)
  const cutoff = addDays(today, -HISTORY_DAYS)
  let added = 0
  let oldestSeen: string | undefined

  /** a failing endpoint is noted and skipped; rate limits and auth problems stop the step */
  const get = async (label: string, path: string, query?: Record<string, string | number>) => {
    try {
      const res = await api.get(path, query)
      shapes[label] ??= shape(res, 4)
      delete warnings[label]
      return res
    } catch (e) {
      if (!(e instanceof GarminError) || e.status === 429 || e.status === 401 || e.status === 403) throw e
      warnings[label] = e.message
      return null
    }
  }

  const addActivities = (items: Obj[]) => {
    let fresh = 0
    for (const g of items) {
      const a = mapActivity(g)
      if (!a) continue
      const prev = data.activities[a.id]
      if (!prev) fresh++
      // the football numbers came from the FIT file, which the list doesn't carry
      data.activities[a.id] = { ...a, football: prev?.football }
      if (a.sport === 'football' && a.hasStream && !prev?.football && !state.pending.includes(a.id)) state.pending.push(a.id)
      if (!oldestSeen || a.start < oldestSeen) oldestSeen = a.start
    }
    if (items.length) dirty.activities = true
    return fresh
  }

  try {
    // 1. recent
    const recentDue = forceRecent || !state.recentAt || now.getTime() - Date.parse(state.recentAt) > RECENT_EVERY_MS
    if (recentDue) {
      for (let page = 0; page < 6; page++) {
        const items = list(await get('activities', SEARCH, { start: page * PAGE, limit: PAGE }), 'activityList', 'activities')
        const fresh = addActivities(items)
        added += fresh
        if (firstEver) state.activityOffset = items.length
        // keep paging only while every activity on the page is new (a long time since the last sync)
        if (firstEver || fresh < items.length || items.length < PAGE) break
      }
      const from = addDays(today, -(RECENT_DAYS - 1))
      foldSummaries(data.dailies, await get('dailies', '/usersummary-service/v2/dailysummaries', { startDate: from, endDate: today }))
      foldHrv(data.dailies, await get('hrv', `/hrv-service/hrv/daily/${from}/${today}`))
      foldSleep(data.dailies, await get('sleep', '/sleep-service/sleep/dailySleepSummariesByDate', { startDate: from, endDate: today }))
      foldWeight(data.body, await get('weight', `/weight-service/weight/range/${addDays(today, -29)}/${today}`, { includeAll: 'true' }))
      dirty.dailies = dirty.body = true
      if (!state.profile || now.getTime() - Date.parse(state.profile.at) > 86_400_000) {
        state.profile = { ...hrProfile(await get('zones', '/biometric-service/heartRateZones/v2')), at: now.toISOString() }
      }
      state.recentAt = now.toISOString()
    }

    // 2. football games waiting for their FIT file
    while (state.pending.length && left() > 8_000) {
      const id = state.pending[0]
      const a = data.activities[id]
      if (a?.garminId) {
        try {
          const stream = streamFromFit(fitFromDownload(await api.bytes(`/download-service/files/activity/${a.garminId}`)), id, a.sport)
          await kv.set(`stream/${id}`, stream)
          const football = footballSummary(stream)
          if (football) data.activities[id] = { ...a, football }
          dirty.activities = true
        } catch (e) {
          if (e instanceof GarminError && (e.status === 429 || e.status === 401 || e.status === 403)) throw e
          warnings.fit = `${a.name} (${a.start.slice(0, 10)}): ${e instanceof Error ? e.message : String(e)}`
        }
      }
      state.pending.shift()
    }

    // 3. activity history
    while (!state.activitiesDone && left() > 5_000) {
      const items = list(await get('activities', SEARCH, { start: state.activityOffset, limit: PAGE }), 'activityList', 'activities')
      added += addActivities(items)
      state.activityOffset += items.length
      if (items.length < PAGE || (oldestSeen && oldestSeen.slice(0, 10) < cutoff)) state.activitiesDone = true
    }

    // 4. health history
    while (!state.dailiesDone && left() > 6_000) {
      const end = state.dailiesBefore ? addDays(state.dailiesBefore, -1) : addDays(today, -RECENT_DAYS)
      const start = addDays(end, -(DAILY_CHUNK - 1)) < cutoff ? cutoff : addDays(end, -(DAILY_CHUNK - 1))
      foldSummaries(data.dailies, await get('dailies', '/usersummary-service/v2/dailysummaries', { startDate: start, endDate: end }))
      foldHrv(data.dailies, await get('hrv', `/hrv-service/hrv/daily/${start}/${end}`))
      foldWeight(data.body, await get('weight', `/weight-service/weight/range/${start}/${end}`, { includeAll: 'true' }))
      const sleepFrom = addDays(today, -SLEEP_DAYS)
      for (let s = start < sleepFrom ? sleepFrom : start; s <= end; s = addDays(s, SLEEP_CHUNK)) {
        const e = addDays(s, SLEEP_CHUNK - 1) > end ? end : addDays(s, SLEEP_CHUNK - 1)
        foldSleep(data.dailies, await get('sleep', '/sleep-service/sleep/dailySleepSummariesByDate', { startDate: s, endDate: e }))
      }
      dirty.dailies = dirty.body = true
      state.dailiesBefore = start
      if (start <= cutoff) state.dailiesDone = true
    }
    state.error = undefined
  } catch (e) {
    // keep what this step already fetched; a rate limit just pauses the loop
    state.error = { at: now.toISOString(), message: e instanceof Error ? e.message : String(e) }
    if (!(e instanceof GarminError && e.status === 429)) {
      await save()
      throw e
    }
    await save()
    return { done: false, added, total: Object.keys(data.activities).length, message: state.error.message, paused: true }
  }

  const done = isCaughtUp(state)
  if (done) state.lastSync = now.toISOString()
  await save()
  return { done, added, total: Object.keys(data.activities).length, message: progress() }

  async function save() {
    state.warnings = Object.keys(warnings).length ? warnings : undefined
    const writes: Promise<unknown>[] = [kv.set('state', state)]
    if (dirty.activities) writes.push(kv.set('activities', data.activities))
    if (dirty.dailies) writes.push(kv.set('dailies', data.dailies))
    if (dirty.body) writes.push(kv.set('body', data.body))
    if (Object.keys(shapes).length) writes.push(kv.get<Record<string, unknown>>('shapes').then((old) => kv.set('shapes', { ...old, ...shapes })))
    await Promise.all(writes)
  }

  function progress(): string {
    if (isCaughtUp(state)) return added ? `${added} new ${added === 1 ? 'activity' : 'activities'}` : 'Up to date'
    if (state.pending.length) return `Reading your football games: ${state.pending.length} to go`
    if (!state.activitiesDone) {
      const oldest = Object.values(data.activities).reduce((min, a) => (a.start < min ? a.start : min), now.toISOString())
      return `Activities back to ${monthYear(oldest)}`
    }
    return `Health data back to ${monthYear(state.dailiesBefore ?? today)}`
  }
}
