import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { fetchStream } from './api'
import { BUILTIN_EXERCISES, SAMPLE_PROGRAMME, SAMPLE_ROUTINES } from './exercises'
import { SAMPLE_PROFILE, buildSample, sampleStreamFor, type SampleData } from './sample'
import { useStore } from './store'
import type { Activity, BodyEntry, Daily, Exercise, GarminActivity, Match, Profile, Programme, Routine, Stream, TabKey, Workout } from './types'
import { analyseFootball, gamesToRate, usualFormatAt, withWatchLines, type FootballAnalysis } from '../lib/football'
import { currentProgramme, liftSummary, mondayOf } from '../lib/lift'
import { isoDay } from '../lib/format'
import { loadModel, srpeLoad, trimp, zoneBounds, zoneSecondsFromAvg, type LoadModel } from '../lib/load'
import { runModel, type RunModel } from '../lib/running'
import { nextOccurrence, recurringSlots, type Slot } from '../lib/schedule'
import { footballSeries, liftSeries, recoverySeries, runSeries, weightSeries } from '../lib/series'
import { headline, standout, type Standout } from '../lib/standout'
import { differenceInCalendarDays, format, subWeeks } from 'date-fns'

export interface World {
  now: Date
  /** what's shown besides what you log: the sample athlete (the Demo switch), your Garmin data, or nothing ('own') */
  mode: 'sample' | 'live' | 'own'
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
  /** your programmes, and on sample data the sample lifter's */
  programmes: Programme[]
  /** the one you're on: Next up only comes from its workouts */
  programme?: Programme
  body: BodyEntry[]
  analyses: Map<string, FootballAnalysis>
  load: LoadModel
  /** whether a tab is on the tab bar (Settings, Tabs): a hidden one stays out of Today and the + sheet too */
  shows: (tab: TabKey) => boolean
  /** the one thing worth a look in each part of the app, when there is one; `today` is the rarest of them all, from the tabs you show */
  news: { today?: Standout; recovery?: Standout; run?: Standout; lift?: Standout; football?: Standout; body?: Standout }
  slots: Slot[]
  next: Upcoming | null
  nextFootball: Upcoming | null
  unrated: Activity[]
}

let sampleCache: { key: string; data: SampleData } | null = null
let worldCache: { day: string; inputs: unknown[]; world: World } | null = null

export function getSample(now: Date, profile: Profile): SampleData {
  const key = `${isoDay(now)}:${profile.hrMax}:${profile.name}`
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
 * Garmin activities get zones from your profile when Garmin didn't split them.
 * Load is Garmin's own training load where the watch worked one out, and TRIMP
 * from the zones where it didn't. A lifting session you logged here that the
 * watch also recorded is one session: it links to the workout and counts its
 * session-RPE load once.
 */
export function fromGarmin(list: GarminActivity[], p: Profile, workouts: Workout[]): Activity[] {
  const bounds = zoneBounds(p)
  return list.map((g) => {
    const zoneS = g.zoneS ?? zoneSecondsFromAvg(g.avgHr ?? 0, g.durationS, bounds)
    const a: Activity = { ...g, zoneS, load: g.garmin?.load ?? trimp(zoneS) }
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
  /** football: the format usually played then */
  format?: number
}

/** The soonest of your usual slots, optionally only those matching `pick`. Football says which format you usually play then. */
function upcoming(slots: Slot[], now: Date, matches: Match[], pick: (s: Slot) => boolean = () => true): Upcoming | null {
  let next: Upcoming | null = null
  for (const slot of slots) {
    if (!pick(slot)) continue
    const at = nextOccurrence(slot, now)
    if (next && at >= next.at) continue
    const days = differenceInCalendarDays(at, now)
    const when = days === 0 ? (at.getHours() >= 18 ? 'tonight' : 'today') : days === 1 ? 'tomorrow' : format(at, 'EEEE')
    const fmt = slot.sport === 'football' ? (usualFormatAt(at, matches) ?? (Number(slot.kind) || undefined)) : undefined
    const what = slot.sport === 'football' ? (fmt ? `${fmt}-a-side` : 'football') : (SPORT_PLAN[slot.sport] ?? slot.sport)
    next = { slot, at, label: `${what} ${when}`, format: fmt }
  }
  return next
}

export function useWorld(): World {
  const s = useStore(
    useShallow((st) => ({
      profile: st.profile,
      matches: st.matches,
      hidden: st.hiddenMatchIds,
      skipped: st.skippedRatings,
      workouts: st.workouts,
      custom: st.customExercises,
      edits: st.exerciseEdits,
      routines: st.routines,
      programmes: st.programmes,
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
    // the Demo switch shows the sample athlete; otherwise Garmin once it has synced, and before that only what you log
    const demo = !!s.sync.demo
    const live = !demo && s.sync.mode === 'live' && !!s.garmin
    const sample = demo ? getSample(now, s.profile) : null

    // on sample data the sample lifter's programme shows too, four weeks in, unless you've made it yours; the one you're
    // on comes first, then theirs
    const sampleProgrammes: Programme[] =
      demo && !s.programmes.some((p) => p.id === SAMPLE_PROGRAMME.id) ? [{ ...SAMPLE_PROGRAMME, runs: [{ start: mondayOf(subWeeks(now, 4)) }] }] : []
    const programmes = [...sampleProgrammes, ...s.programmes]
    const programme = currentProgramme(s.programmes) ?? currentProgramme(sampleProgrammes)

    const exercises = [...BUILTIN_EXERCISES.map((e) => ({ ...e, ...s.edits[e.id] })), ...s.custom]
    const exerciseById = new Map(exercises.map((e) => [e.id, e]))

    const workouts = [...s.workouts, ...(sample?.workouts ?? [])].filter((w) => w.end).sort((a, b) => b.start.localeCompare(a.start))

    const base = live ? fromGarmin(s.garmin!.activities, s.profile, s.workouts) : (sample?.activities ?? [])
    const linkedWorkouts = new Set(base.map((a) => a.workoutId).filter(Boolean))
    const activities = [...base, ...s.workouts.filter((w) => w.end && !linkedWorkouts.has(w.id)).map((w) => workoutToActivity(w, s.profile))].sort((a, b) =>
      b.start.localeCompare(a.start),
    )
    const byId = new Map(activities.map((a) => [a.id, a]))

    const userByActivity = new Set(s.matches.map((m) => m.activityId).filter(Boolean))
    // a rating saved before its game's summary was last made again shows that summary's watch lines (a fade that isn't one comes out)
    const yours = s.matches.map((m) => (m.activityId ? withWatchLines(m, byId.get(m.activityId)?.football) : m))
    const matches = [...yours, ...(sample?.matches ?? []).filter((m) => !s.hidden.includes(m.id) && !userByActivity.has(m.activityId))].sort((a, b) => b.date.localeCompare(a.date))
    const matchByActivity = new Map(matches.filter((m) => m.activityId).map((m) => [m.activityId!, m]))

    const dailies = live ? s.garmin!.dailies : (sample?.dailies ?? [])
    const body = [...s.body, ...(live ? s.garmin!.body : (sample?.body ?? []))].sort((a, b) => b.date.localeCompare(a.date))

    const load = loadModel(activities, 84, now)
    const slots = recurringSlots(activities, now)

    const next = upcoming(slots, now, matches)
    const nextFootball = upcoming(slots, now, matches, (s) => s.sport === 'football')

    const unrated = gamesToRate(activities, (id) => matchByActivity.has(id), s.skipped, now)

    const t = now.getTime()
    const news: World['news'] = {
      recovery: standout(recoverySeries(dailies), t),
      run: standout(runSeries(activities, now), t),
      lift: standout(liftSeries(workouts, exerciseById), t),
      football: standout(
        footballSeries(
          matches,
          activities.filter((a) => a.sport === 'football'),
        ),
        t,
      ),
      body: standout(weightSeries(body), t),
    }
    const hidden = new Set(s.profile.hiddenTabs ?? [])
    const shows = (tab: TabKey) => !hidden.has(tab)
    // Today only picks from the tabs you show: sleep and heart rate live on Body
    const tabOf: Record<string, TabKey> = { recovery: 'body', body: 'body', run: 'run', lift: 'lift', football: 'football' }
    news.today = headline(
      Object.entries(news)
        .filter(([k]) => shows(tabOf[k]))
        .map(([, v]) => v),
      t,
    )

    const world: World = {
      now,
      mode: demo ? 'sample' : live ? 'live' : 'own',
      shows,
      // the sample athlete goes by their own name when you haven't given yours
      profile: demo && !s.profile.name.trim() ? { ...s.profile, name: SAMPLE_PROFILE.name } : s.profile,
      activities,
      byId,
      dailies,
      matches,
      matchByActivity,
      workouts,
      exercises,
      exerciseById,
      // your own list starts empty; on sample data the sample lifter's workouts fill in, yours over theirs
      routines: demo ? [...SAMPLE_ROUTINES.filter((r) => !s.routines.some((x) => x.id === r.id)), ...s.routines] : s.routines,
      programmes,
      programme,
      body,
      analyses: sample?.analyses ?? new Map(),
      load,
      news,
      slots,
      next,
      nextFootball,
      unrated,
    }
    worldCache = { day, inputs, world }
    return world
  }, [s])
}

let runCache: { activities: Activity[]; profile: Profile; model: RunModel | null } | null = null

/** The running analysis for the world, worked out once however many screens ask. */
export function useRunModel(w: World): RunModel | null {
  return useMemo(() => {
    if (runCache?.activities !== w.activities || runCache.profile !== w.profile)
      runCache = { activities: w.activities, profile: w.profile, model: runModel(w.activities, w.profile, w.now) }
    return runCache.model
  }, [w])
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
