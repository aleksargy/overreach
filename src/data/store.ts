import { get as idbGet, set as idbSet } from 'idb-keyval'
import { create } from 'zustand'
import { BUILTIN_ROUTINES } from './exercises'
import { SAMPLE_PROFILE } from './sample'
import { backupOf, merge, type Backup } from '../lib/backup'
import { uid } from '../lib/rng'
import type { BodyEntry, Daily, Exercise, GarminActivity, Match, Profile, Routine, SetEntry, SyncState, Workout } from './types'

/** Everything you type into the app. Garmin data lives in `garmin`, sample data is generated. */
export interface UserData {
  version: 1
  profile: Profile
  matches: Match[]
  hiddenMatchIds: string[]
  /** football activities you chose not to rate */
  skippedRatings: string[]
  workouts: Workout[]
  customExercises: Exercise[]
  exerciseEdits: Record<string, Partial<Exercise>>
  routines: Routine[]
  body: BodyEntry[]
  active: Workout | null
  sync: SyncState
}

export interface GarminCache {
  activities: GarminActivity[]
  dailies: Daily[]
  body: BodyEntry[]
}

const EMPTY: UserData = {
  version: 1,
  profile: SAMPLE_PROFILE,
  matches: [],
  hiddenMatchIds: [],
  skippedRatings: [],
  workouts: [],
  customExercises: [],
  exerciseEdits: {},
  routines: BUILTIN_ROUTINES,
  body: [],
  active: null,
  sync: { mode: 'sample' },
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
  saveRoutine: (r: Routine) => void
  addBody: (e: BodyEntry) => void
  setSync: (s: Partial<SyncState>) => void
  setGarmin: (g: GarminCache | null) => void
  importWorkouts: (ws: Workout[], exercises: Exercise[]) => void
  /** fold in a backup file or the server's copy; nothing on the phone is replaced */
  mergeBackup: (saved: Partial<Backup>) => void
  resetAll: () => void
}

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

function pickUser(s: State): UserData {
  return {
    version: 1,
    profile: s.profile,
    matches: s.matches,
    hiddenMatchIds: s.hiddenMatchIds,
    skippedRatings: s.skippedRatings,
    workouts: s.workouts,
    customExercises: s.customExercises,
    exerciseEdits: s.exerciseEdits,
    routines: s.routines,
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
    const apply = ([user, garmin]: [UserData | undefined, GarminCache | undefined]) => set({ ...EMPTY, ...(user ?? {}), garmin: garmin ?? null, hydrated: true })
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

  saveRoutine: (r) => set((s) => ({ routines: [...s.routines.filter((x) => x.id !== r.id), r] })),

  addBody: (e) => set((s) => ({ body: [e, ...s.body] })),

  setSync: (p) => set((s) => ({ sync: { ...s.sync, ...p } })),

  setGarmin: (g) => {
    set({ garmin: g })
    void save(GARMIN_KEY, g)
  },

  importWorkouts: (ws, exercises) =>
    set((s) => ({
      workouts: [...s.workouts.filter((w) => !ws.some((n) => n.id === w.id)), ...ws],
      customExercises: [...s.customExercises, ...exercises.filter((e) => !s.customExercises.some((c) => c.id === e.id))],
    })),

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
