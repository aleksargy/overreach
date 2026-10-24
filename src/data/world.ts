import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { fetchStream } from './api'
import { BUILTIN_EXERCISES } from './exercises'
import { buildSample, sampleStreamFor, type SampleData } from './sample'
import { useStore } from './store'
import type { Activity, BodyEntry, Daily, Exercise, GarminActivity, Match, Profile, Routine, Stream, Workout } from './types'
import { analyseFootball, type FootballAnalysis } from '../lib/football'
import { liftSummary } from '../lib/lift'
import { isoDay } from '../lib/format'
import { loadModel, srpeLoad, trimp, zoneBounds, zoneSecondsFromAvg, type LoadModel } from '../lib/load'
import { readiness, type Readiness } from '../lib/readiness'
import { nextOccurrence, recurringSlots, type Slot } from '../lib/schedule'
import { differenceInCalendarDays, format } from 'date-fns'

export interface World {
  now: Date
  mode: 'sample' | 'live'
  profile: Profile
  activities: Activity[]
  byId: Map<string, Activity>
  dailies: Daily[]
  matches: Match[]
  matchByActivity: Map<string, Match>
  workouts: Workout[]
  exercises: Exercise[]
  exerciseById: Map<string, Exercise>
  routines: Routine[]
  body: BodyEntry[]
  analyses: Map<string, FootballAnalysis>
  load: LoadModel
  acwr: number
  readiness: Readiness | null
  slots: Slot[]
  next: Upcoming | null
  nextFootball: Upcoming | null
  unrated: Activity[]
}

let sampleCache: { key: string; data: SampleData } | null = null
let worldCache: { day: string; inputs: unknown[]; world: World } | null = null

export function getSample(now: Date, profile: Profile): SampleData {
  const key = `${isoDay(now)}:${profile.hrMax}:${profile.name}:${profile.position}`
  if (!sampleCache || sampleCache.key !== key) sampleCache = { key, data: buildSample(now, profile) }
  return sampleCache.data
}

export function workoutToActivity(w: Workout, p: Profile): Activity {
  const durationS = Math.max(60, (Date.parse(w.end ?? w.start) - Date.parse(w.start)) / 1000)
  const avgHr = 110
  return {
    id: `a-${w.id}`,
    source: w.source,
    sport: 'strength',
    kind: w.routineId,
    name: w.name,
    start: w.start,
    durationS,
    avgHr,
    zoneS: zoneSecondsFromAvg(avgHr, durationS, zoneBounds(p)),
    load: srpeLoad(durationS / 60, w.srpe ?? 7),
    hasStream: false,
    workoutId: w.id,
    lift: liftSummary(w),
  }
}

/**
 * Garmin activities get zones from your profile when Garmin didn't split them,
 * and load from those zones. A lifting session you logged here that the watch
 * also recorded is one session: it links to the workout and counts its
 * session-RPE load once.
 */
export function fromGarmin(list: GarminActivity[], p: Profile, workouts: Workout[]): Activity[] {
  const bounds = zoneBounds(p)
  return list.map((g) => {
    const zoneS = g.zoneS ?? zoneSecondsFromAvg(g.avgHr ?? 0, g.durationS, bounds)
    const a: Activity = { ...g, zoneS, load: trimp(zoneS) }
    if (a.sport !== 'strength') return a
    const w = workouts.find((x) => x.end && Math.abs(Date.parse(x.start) - Date.parse(a.start)) < 45 * 60_000)
    if (!w) return a
    return { ...a, name: w.name, workoutId: w.id, lift: liftSummary(w), load: w.srpe ? srpeLoad(a.durationS / 60, w.srpe) : a.load }
  })
}

const SPORT_PLAN: Record<string, string> = { football: 'football', run: 'your run', ride: 'your ride', swim: 'your swim', strength: 'the gym' }

export interface Upcoming {
  slot: Slot
  at: Date
  label: string
}

/** The soonest of your usual slots, optionally only those matching `pick`. */
function upcoming(slots: Slot[], now: Date, pick: (s: Slot) => boolean = () => true): Upcoming | null {
  let next: Upcoming | null = null
  for (const slot of slots) {
    if (!pick(slot)) continue
    const at = nextOccurrence(slot, now)
    if (next && at >= next.at) continue
    const days = differenceInCalendarDays(at, now)
    const when = days === 0 ? (at.getHours() >= 18 ? 'tonight' : 'today') : days === 1 ? 'tomorrow' : format(at, 'EEEE')
    const what = slot.sport === 'football' ? (slot.kind && Number(slot.kind) ? `${slot.kind}-a-side` : 'football') : (SPORT_PLAN[slot.sport] ?? slot.sport)
    next = { slot, at, label: `${what} ${when}` }
  }
  return next
}

export function useWorld(): World {
  const s = useStore(
    useShallow((st) => ({
      profile: st.profile,
      matches: st.matches,
      hidden: st.hiddenMatchIds,
      workouts: st.workouts,
      custom: st.customExercises,
      edits: st.exerciseEdits,
      routines: st.routines,
      body: st.body,
      sync: st.sync,
      garmin: st.garmin,
    })),
  )

  return useMemo(() => {
    // every screen calls useWorld; share one computation while the inputs are the same objects
    const inputs = Object.values(s)
    const day = isoDay(new Date())
    if (worldCache && worldCache.day === day && worldCache.inputs.length === inputs.length && worldCache.inputs.every((x, i) => x === inputs[i])) return worldCache.world
    const now = new Date()
    const live = s.sync.mode === 'live' && !!s.garmin
    const sample = live ? null : getSample(now, s.profile)

    const exercises = [...BUILTIN_EXERCISES.map((e) => ({ ...e, ...s.edits[e.id] })), ...s.custom]
    const exerciseById = new Map(exercises.map((e) => [e.id, e]))

    const workouts = [...s.workouts, ...(sample?.workouts ?? [])].filter((w) => w.end).sort((a, b) => b.start.localeCompare(a.start))

    const base = live ? fromGarmin(s.garmin!.activities, s.profile, s.workouts) : sample!.activities
    const linkedWorkouts = new Set(base.map((a) => a.workoutId).filter(Boolean))
    const activities = [...base, ...s.workouts.filter((w) => w.end && !linkedWorkouts.has(w.id)).map((w) => workoutToActivity(w, s.profile))].sort((a, b) =>
      b.start.localeCompare(a.start),
    )
    const byId = new Map(activities.map((a) => [a.id, a]))

    const userByActivity = new Set(s.matches.map((m) => m.activityId).filter(Boolean))
    const matches = [...s.matches, ...(sample?.matches ?? []).filter((m) => !s.hidden.includes(m.id) && !userByActivity.has(m.activityId))].sort((a, b) =>
      b.date.localeCompare(a.date),
    )
    const matchByActivity = new Map(matches.filter((m) => m.activityId).map((m) => [m.activityId!, m]))

    const dailies = live ? s.garmin!.dailies : sample!.dailies
    const body = [...s.body, ...(live ? s.garmin!.body : sample!.body)].sort((a, b) => b.date.localeCompare(a.date))

    const load = loadModel(activities, 84, now)
    // judge readiness on load up to yesterday, so this morning's empty day doesn't read as detraining
    const acwr = load.ratio[load.ratio.length - 2] ?? 1
    const slots = recurringSlots(activities, now)

    const next = upcoming(slots, now)
    const nextFootball = upcoming(slots, now, (s) => s.sport === 'football')
    const todays = next && differenceInCalendarDays(next.at, now) === 0 ? next.label : undefined

    const unrated = activities.filter((a) => a.sport === 'football' && !matchByActivity.has(a.id))

    const world: World = {
      now,
      mode: live ? 'live' : 'sample',
      profile: s.profile,
      activities,
      byId,
      dailies,
      matches,
      matchByActivity,
      workouts,
      exercises,
      exerciseById,
      routines: s.routines,
      body,
      analyses: sample?.analyses ?? new Map(),
      load,
      acwr,
      readiness: readiness(dailies, acwr, todays),
      slots,
      next,
      nextFootball,
      unrated,
    }
    worldCache = { day, inputs, world }
    return world
  }, [s])
}

const streamCache = new Map<string, Stream>()

/** Streams are generated for sample data and fetched (then cached) for Garmin data. */
export async function loadStream(a: Activity): Promise<Stream | null> {
  if (streamCache.has(a.id)) return streamCache.get(a.id)!
  let st: Stream | null = null
  if (a.source === 'sample') st = sampleStreamFor(a)
  else if (a.source === 'garmin') st = await fetchStream(a.id)
  if (st) streamCache.set(a.id, st)
  return st
}

const analysisCache = new Map<string, FootballAnalysis>()
export async function loadFootballAnalysis(a: Activity, w: World): Promise<FootballAnalysis | null> {
  if (w.analyses.has(a.id)) return w.analyses.get(a.id)!
  if (analysisCache.has(a.id)) return analysisCache.get(a.id)!
  const st = await loadStream(a)
  if (!st) return null
  const an = analyseFootball(st)
  analysisCache.set(a.id, an)
  return an
}

export function useStream(a: Activity | undefined): Stream | null {
  const [st, setSt] = useState<Stream | null>(() => (a && streamCache.get(a.id)) || null)
  useEffect(() => {
    let alive = true
    if (!a || !a.hasStream) return
    if (streamCache.has(a.id)) {
      setSt(streamCache.get(a.id)!)
      return
    }
    void loadStream(a).then((s) => alive && setSt(s))
    return () => {
      alive = false
    }
  }, [a])
  return st
}

export function useFootballAnalysis(a: Activity | undefined, w: World): FootballAnalysis | null {
  const [an, setAn] = useState<FootballAnalysis | null>(() => (a && (w.analyses.get(a.id) ?? analysisCache.get(a.id))) || null)
  useEffect(() => {
    let alive = true
    if (!a) return
    void loadFootballAnalysis(a, w).then((x) => alive && setAn(x))
    return () => {
      alive = false
    }
  }, [a, w])
  return an
}
