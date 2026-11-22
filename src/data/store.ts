import { get as idbGet, set as idbSet } from 'idb-keyval'
import { create } from 'zustand'
import { SAMPLE_PROFILE } from './sample'
import { backupOf, merge, withoutStarters, type Backup } from '../lib/backup'
import { isoDay } from '../lib/format'
import { withPoints } from '../lib/football'
import { openRun } from '../lib/lift'
import { uid } from '../lib/rng'
import type { BodyEntry, Daily, Exercise, GarminActivity, LiftGoal, Match, Profile, Programme, Routine, SetEntry, SyncState, Workout } from './types'

/** Everything you type into the app. Garmin data lives in `garmin`, sample data is generated. */
export interface UserData {
  /**
   * 2: matches have points (what went well and badly) instead of moments. 3: your workouts start empty, without
   * the four starters. 4: a phone that hasn't synced starts blank (sync mode 'off'), and sample data is the Demo switch.
   * 5: programmes.
   */
  version: 5
  profile: Profile
  matches: Match[]
  hiddenMatchIds: string[]
  /** football activities you chose not to rate */
  skippedRatings: string[]
  workouts: Workout[]
  customExercises: Exercise[]
  exerciseEdits: Record<string, Partial<Exercise>>
  routines: Routine[]
  /** sets of your workouts run for some weeks; the one with a run still open is the one you're on */
  programmes: Programme[]
  body: BodyEntry[]
  active: Workout | null
  sync: SyncState
}

export interface GarminCache {
  activities: GarminActivity[]
  dailies: Daily[]
  body: BodyEntry[]
}

/** a preview build (one-file, or a pull request's) opens on sample data; anything else starts blank */
// (import.meta.env is Vite's: tests that load this outside it see neither)
const START_DEMO = !!import.meta.env && (import.meta.env.VITE_PREVIEW === '1' || import.meta.env.VITE_DEMO === '1')

const EMPTY: UserData = {
  version: 5,
  // the sample athlete's heart rates until the watch says otherwise, but no name: it's yours to give
  profile: { ...SAMPLE_PROFILE, name: '' },
  matches: [],
  hiddenMatchIds: [],
  skippedRatings: [],
  workouts: [],
  customExercises: [],
  exerciseEdits: {},
  routines: [],
  programmes: [],
  body: [],
  active: null,
  sync: { mode: 'off', demo: START_DEMO || undefined },
}

interface State extends UserData {
  hydrated: boolean
  garmin: GarminCache | null
  hydrate: () => Promise<void>
  setProfile: (p: Partial<Profile>) => void
  saveMatch: (m: Match) => void
  deleteMatch: (id: string) => void
  /** stop asking to rate this game */
  skipRating: (activityId: string) => void
  startWorkout: (routine?: Routine) => void
  updateActive: (fn: (w: Workout) => Workout) => void
  finishWorkout: (srpe: number) => Workout | null
  discardWorkout: () => void
  deleteWorkout: (id: string) => void
  saveExercise: (e: Exercise) => void
  editExercise: (id: string, patch: Partial<Exercise>) => void
  /** add a workout of your own, or change one in place */
  saveRoutine: (r: Routine) => void
  deleteRoutine: (id: string) => void
  /** add a programme, or change one in place */
  saveProgramme: (p: Programme) => void
  /** a programme goes; its workouts stay */
  deleteProgramme: (id: string) => void
  /** run a programme from today, a new run if it's run before; the one you were on ends today */
  startProgramme: (p: Programme) => void
  /** end the programme you're on today: Next up comes from all your workouts again */
  stopProgramme: (p: Programme) => void
  /** the goals for the run of a programme you're on */
  setGoals: (p: Programme, goals: LiftGoal[]) => void
  addBody: (e: BodyEntry) => void
  setSync: (s: Partial<SyncState>) => void
  setGarmin: (g: GarminCache | null) => void
  /** fold in a backup file or the server's copy; nothing on the phone is replaced */
  mergeBackup: (saved: Partial<Backup>) => void
  resetAll: () => void
}

/** A list with `x` in it: in its place if it's there already, at the end if not. */
const upsert = <T extends { id: string }>(list: T[], x: T) => (list.some((y) => y.id === x.id) ? list.map((y) => (y.id === x.id ? x : y)) : [...list, x])

/** A programme with the run it has open ended on `day`. */
const endRun = (day: string) => (p: Programme) => (openRun(p) ? { ...p, runs: p.runs.map((r, i) => (i === p.runs.length - 1 ? { ...r, end: day } : r)) } : p)

const KEY = 'overreach:user:v1'
const GARMIN_KEY = 'overreach:garmin:v1'

// IndexedDB first, then localStorage, then memory: the app must work in a
// private tab or a sandboxed preview where storage throws, or never answers.
// A slow answer is not an empty one, so nothing is written back until
// IndexedDB has answered: a slow start can never save defaults over real data.
const withTimeout = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('storage timeout')), ms))])

let target: 'idb' | 'local' | 'wait' = 'wait'

function fromLocal<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : undefined
  } catch {
    return undefined
  }
}

async function save(key: string, value: unknown) {
  if (target === 'idb') {
    try {
      return await idbSet(key, value)
    } catch {
      target = 'local'
    }
  }
  if (target === 'local') {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* memory only */
    }
  }
}

/** What an older version of the app saved, brought up to date. */
export function upgrade(u: UserData): UserData {
  return {
    ...u,
    version: 5,
    matches: (u.matches ?? []).map(withPoints),
    routines: withoutStarters(u.routines ?? [], u.workouts ?? []),
    programmes: u.programmes ?? [],
    // before 4, a phone that hadn't synced said 'sample' and showed sample data; now it shows only what you log
    sync: { ...u.sync, mode: u.sync?.mode === 'live' ? 'live' : 'off' },
  }
}

function pickUser(s: State): UserData {
  return {
    version: 5,
    profile: s.profile,
    matches: s.matches,
    hiddenMatchIds: s.hiddenMatchIds,
    skippedRatings: s.skippedRatings,
    workouts: s.workouts,
    customExercises: s.customExercises,
    exerciseEdits: s.exerciseEdits,
    routines: s.routines,
    programmes: s.programmes,
    body: s.body,
    active: s.active,
    sync: { ...s.sync, status: 'idle' },
  }
}

export const useStore = create<State>()((set, get) => ({
  ...EMPTY,
  hydrated: false,
  garmin: null,

  hydrate: async () => {
    const apply = ([user, garmin]: [UserData | undefined, GarminCache | undefined]) => set({ ...EMPTY, ...(user && upgrade(user)), garmin: garmin ?? null, hydrated: true })
    // IndexedDB can throw before it returns a promise (a sandboxed frame), so start it inside one
    const read = Promise.resolve().then(() => Promise.all([idbGet<UserData>(KEY), idbGet<GarminCache>(GARMIN_KEY)]))
    try {
      apply(await withTimeout(read, 2000))
      target = 'idb'
    } catch {
      apply([fromLocal(KEY), fromLocal(GARMIN_KEY)])
      // IndexedDB may still answer late; its answer wins, and only then is anything saved there
      read.then(
        (r) => {
          apply(r)
          target = 'idb'
        },
        () => (target = 'local'),
      )
    }
  },

  setProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p } })),

  saveMatch: (m) =>
    set((s) => ({
      matches: [m, ...s.matches.filter((x) => x.id !== m.id)],
      hiddenMatchIds: m.id.startsWith('m-s-') ? [...new Set([...s.hiddenMatchIds, m.id])] : s.hiddenMatchIds,
    })),

  deleteMatch: (id) =>
    set((s) => ({
      matches: s.matches.filter((x) => x.id !== id),
      hiddenMatchIds: [...new Set([...s.hiddenMatchIds, id])],
    })),

  skipRating: (activityId) => set((s) => ({ skippedRatings: [...new Set([...s.skippedRatings, activityId])] })),

  startWorkout: (routine) => {
    const exercises = (routine?.items ?? []).map((item) => ({
      id: uid(),
      exerciseId: item.exerciseId,
      sets: Array.from({ length: item.sets }, (): SetEntry => ({ id: uid(), kind: 'working', done: false })),
      superset: item.superset,
    }))
    set({
      active: {
        id: uid(),
        name: routine?.name ?? 'Workout',
        routineId: routine?.id,
        start: new Date().toISOString(),
        exercises,
        source: 'manual',
      },
    })
  },

  updateActive: (fn) => set((s) => (s.active ? { active: fn(s.active) } : {})),

  finishWorkout: (srpe) => {
    const w = get().active
    if (!w) return null
    const done: Workout = {
      ...w,
      end: new Date().toISOString(),
      srpe,
      exercises: w.exercises.map((we) => ({ ...we, sets: we.sets.filter((x) => x.done) })).filter((we) => we.sets.length),
    }
    set((s) => ({ active: null, workouts: [done, ...s.workouts] }))
    return done
  },

  discardWorkout: () => set({ active: null }),

  deleteWorkout: (id) => set((s) => ({ workouts: s.workouts.filter((w) => w.id !== id) })),

  saveExercise: (e) => set((s) => ({ customExercises: [...s.customExercises.filter((x) => x.id !== e.id), e] })),

  editExercise: (id, patch) =>
    set((s) =>
      s.customExercises.some((x) => x.id === id)
        ? { customExercises: s.customExercises.map((x) => (x.id === id ? { ...x, ...patch } : x)) }
        : { exerciseEdits: { ...s.exerciseEdits, [id]: { ...s.exerciseEdits[id], ...patch } } },
    ),

  saveRoutine: (r) => set((s) => ({ routines: s.routines.some((x) => x.id === r.id) ? s.routines.map((x) => (x.id === r.id ? r : x)) : [...s.routines, r] })),

  // a workout that goes leaves the programmes it was in too
  deleteRoutine: (id) =>
    set((s) => ({
      routines: s.routines.filter((x) => x.id !== id),
      programmes: s.programmes.map((p) => (p.routineIds.includes(id) ? { ...p, routineIds: p.routineIds.filter((x) => x !== id) } : p)),
    })),

  saveProgramme: (p) => set((s) => ({ programmes: upsert(s.programmes, p) })),

  deleteProgramme: (id) => set((s) => ({ programmes: s.programmes.filter((x) => x.id !== id) })),

  startProgramme: (p) =>
    set((s) => {
      const today = isoDay(new Date())
      // only one runs at a time: whatever was going ends today, this one too if it's starting over
      const ended = upsert(s.programmes, s.programmes.find((x) => x.id === p.id) ?? p).map(endRun(today))
      const mine = ended.find((x) => x.id === p.id)!
      return { programmes: upsert(ended, { ...mine, runs: [...mine.runs, { start: today }] }) }
    }),

  stopProgramme: (p) => set((s) => ({ programmes: upsert(s.programmes, endRun(isoDay(new Date()))(s.programmes.find((x) => x.id === p.id) ?? p)) })),

  setGoals: (p, goals) =>
    set((s) => {
      const mine = s.programmes.find((x) => x.id === p.id) ?? p
      return openRun(mine) ? { programmes: upsert(s.programmes, { ...mine, runs: mine.runs.map((r, i) => (i === mine.runs.length - 1 ? { ...r, goals } : r)) }) } : {}
    }),

  addBody: (e) => set((s) => ({ body: [e, ...s.body] })),

  setSync: (p) => set((s) => ({ sync: { ...s.sync, ...p } })),

  setGarmin: (g) => {
    set({ garmin: g })
    void save(GARMIN_KEY, g)
  },

  mergeBackup: (saved) => set((s) => merge(backupOf(s), saved)),

  resetAll: () => {
    set({ ...EMPTY, garmin: null, hydrated: true })
    void save(GARMIN_KEY, null)
  },
}))

let saveTimer: ReturnType<typeof setTimeout> | undefined
const flush = () => {
  clearTimeout(saveTimer)
  saveTimer = undefined
  void save(KEY, pickUser(useStore.getState()))
}
useStore.subscribe((s, prev) => {
  if (!s.hydrated) return
  clearTimeout(saveTimer)
  // typing into a live workout saves after a pause, anything else straight away
  saveTimer = setTimeout(flush, s.active !== prev.active ? 300 : 0)
})
// iOS can freeze or close a home-screen app right after a tap, so a pending save is written as the app goes away
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => saveTimer && flush())
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && saveTimer && flush())
}
