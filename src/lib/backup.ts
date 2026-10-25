// Everything you type into the app as one portable copy. The server keeps one
// (src/data/backup.ts), Settings downloads one, and either folds back in.

import type { BodyEntry, Exercise, Match, Profile, Routine, Workout } from '../data/types'

export interface Backup {
  profile: Profile
  matches: Match[]
  hiddenMatchIds: string[]
  skippedRatings: string[]
  workouts: Workout[]
  customExercises: Exercise[]
  exerciseEdits: Record<string, Partial<Exercise>>
  routines: Routine[]
  body: BodyEntry[]
}

export const BACKUP_KEYS = [
  'profile',
  'matches',
  'hiddenMatchIds',
  'skippedRatings',
  'workouts',
  'customExercises',
  'exerciseEdits',
  'routines',
  'body',
] as const satisfies readonly (keyof Backup)[]

const LISTS = ['matches', 'workouts', 'customExercises', 'routines', 'body'] as const

export function backupOf(s: Backup): Backup {
  const { profile, matches, hiddenMatchIds, skippedRatings, workouts, customExercises, exerciseEdits, routines, body } = s
  return { profile, matches, hiddenMatchIds, skippedRatings, workouts, customExercises, exerciseEdits, routines, body }
}

/** Anything you'd miss: a match, a workout, a weigh-in or an exercise of your own. */
export const hasContent = (b: Partial<Backup>) => !!(b.matches?.length || b.workouts?.length || b.body?.length || b.customExercises?.length)

/**
 * Fold a saved copy into what's on the phone. Lists join by id and the phone's
 * version of an item wins; a match deleted on the phone stays deleted. The saved
 * settings only come in when the phone has nothing of yours yet.
 */
export function merge(mine: Backup, saved: Partial<Backup>): Backup {
  const join = <T extends { id: string }>(a: T[], b: T[] = [], keep: (x: T) => boolean = () => true) => [...a, ...b.filter((x) => keep(x) && !a.some((y) => y.id === x.id))]
  return {
    profile: hasContent(mine) ? mine.profile : { ...mine.profile, ...saved.profile },
    matches: join(mine.matches, saved.matches, (m) => !mine.hiddenMatchIds.includes(m.id)),
    hiddenMatchIds: [...new Set([...mine.hiddenMatchIds, ...(saved.hiddenMatchIds ?? [])])],
    skippedRatings: [...new Set([...mine.skippedRatings, ...(saved.skippedRatings ?? [])])],
    workouts: join(mine.workouts, saved.workouts),
    customExercises: join(mine.customExercises, saved.customExercises),
    exerciseEdits: { ...saved.exerciseEdits, ...mine.exerciseEdits },
    routines: join(mine.routines, saved.routines),
    body: join(mine.body, saved.body),
  }
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)

/** A backup file or the server's copy, checked enough to merge safely; null if it's neither. */
export function readBackup(x: unknown): Partial<Backup> | null {
  const o = isObj(x) && isObj(x.data) ? x.data : x
  if (!isObj(o)) return null
  const out: Partial<Backup> = {}
  for (const k of LISTS) {
    const v = o[k]
    if (v === undefined) continue
    if (!Array.isArray(v) || !v.every((item) => isObj(item) && typeof item.id === 'string')) return null
    out[k] = v as never
  }
  for (const k of ['hiddenMatchIds', 'skippedRatings'] as const) {
    const v = o[k]
    if (Array.isArray(v)) out[k] = v.filter((id): id is string => typeof id === 'string')
  }
  if (isObj(o.profile)) out.profile = o.profile as unknown as Profile
  if (isObj(o.exerciseEdits)) out.exerciseEdits = o.exerciseEdits as Backup['exerciseEdits']
  return LISTS.some((k) => out[k]) ? out : null
}

export interface Counts {
  matches: number
  workouts: number
  body: number
}

export const counts = (b: Partial<Backup>): Counts => ({ matches: b.matches?.length ?? 0, workouts: b.workouts?.length ?? 0, body: b.body?.length ?? 0 })

/** "12 matches, 3 workouts and 8 weigh-ins"; empty when there are none */
export function describe(c: Counts): string {
  const parts = (
    [
      [c.matches, 'match', 'matches'],
      [c.workouts, 'workout', 'workouts'],
      [c.body, 'weigh-in', 'weigh-ins'],
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`)
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : (parts[0] ?? '')
}
