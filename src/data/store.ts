import { get as idbGet, set as idbSet } from 'idb-keyval'
import { create } from 'zustand'
import { BUILTIN_ROUTINES } from './exercises'
import { SAMPLE_PROFILE } from './sample'
import { uid } from '../lib/rng'
import type { Activity, BodyEntry, Daily, Exercise, Match, Profile, Routine, SetEntry, SyncState, Workout } from './types'

/** Everything you type into the app. Garmin data lives in `garmin`, sample data is generated. */
export interface UserData {
  version: 1
  profile: Profile
  matches: Match[]
  hiddenMatchIds: string[]
  workouts: Workout[]
  customExercises: Exercise[]
  exerciseEdits: Record<string, Partial<Exercise>>
  routines: Routine[]
  body: BodyEntry[]
  active: Workout | null
  sync: SyncState
}

export interface GarminCache {
  activities: Activity[]
  dailies: Daily[]
  body: BodyEntry[]
}

const EMPTY: UserData = {
  version: 1,
  profile: SAMPLE_PROFILE,
  matches: [],
  hiddenMatchIds: [],
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
  resetAll: () => void
}

const KEY = 'overreach:user:v1'
const GARMIN_KEY = 'overreach:garmin:v1'

// IndexedDB first, then localStorage, then memory: the app must work in a
// private tab or a sandboxed preview where storage throws, or never answers.
const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('storage timeout')), ms))])

const storage = {
  async get<T>(key: string): Promise<T | undefined> {
    try {
      return (await withTimeout(idbGet(key), 2000)) as T | undefined
    } catch {
      try {
        const raw = localStorage.getItem(key)
        return raw ? (JSON.parse(raw) as T) : undefined
      } catch {
        return undefined
      }
    }
  },
  async set(key: string, value: unknown) {
    try {
      await idbSet(key, value)
    } catch {
      try {
        localStorage.setItem(key, JSON.stringify(value))
      } catch {
        /* memory only */
      }
    }
  },
}

function pickUser(s: State): UserData {
  return {
    version: 1,
    profile: s.profile,
    matches: s.matches,
    hiddenMatchIds: s.hiddenMatchIds,
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
    const [user, garmin] = await Promise.all([storage.get<UserData>(KEY), storage.get<GarminCache>(GARMIN_KEY)])
    set({ ...EMPTY, ...(user ?? {}), garmin: garmin ?? null, hydrated: true })
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
      exercises: w.exercises
        .map((we) => ({ ...we, sets: we.sets.filter((x) => x.done) }))
        .filter((we) => we.sets.length),
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
    void storage.set(GARMIN_KEY, g)
  },

  importWorkouts: (ws, exercises) =>
    set((s) => ({
      workouts: [...s.workouts.filter((w) => !ws.some((n) => n.id === w.id)), ...ws],
      customExercises: [...s.customExercises, ...exercises.filter((e) => !s.customExercises.some((c) => c.id === e.id))],
    })),

  resetAll: () => {
    set({ ...EMPTY, garmin: null, hydrated: true })
    void storage.set(GARMIN_KEY, null)
  },
}))

let saveTimer: ReturnType<typeof setTimeout> | undefined
useStore.subscribe((s) => {
  if (!s.hydrated) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void storage.set(KEY, pickUser(useStore.getState())), 300)
})
