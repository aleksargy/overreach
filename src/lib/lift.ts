// Lifting: what to do next session, what you've done, and how it's moving.
//
// The plan is double progression, the plainest rule that works: every exercise
// has a rep range. Get the top of the range on every set and the weight goes
// up next time, starting again from the bottom of the range. Until then the
// weight stays and the target is one more rep. Miss the bottom of the range two
// sessions running and a tenth comes off, to build back up.

import { MUSCLES } from '../data/exercises'
import type { Exercise, LiftSummary, Routine, SetEntry, Workout } from '../data/types'
import { round } from './math'

export const isWorking = (s: SetEntry) => s.done && s.kind !== 'warmup'

/** Tracked by the weight on the bar, or the weight added to you. */
export const loaded = (ex: Pick<Exercise, 'kind'>) => ex.kind === 'weight' || ex.kind === 'weighted-bodyweight'

export function volume(w: Workout): number {
  let v = 0
  for (const we of w.exercises) for (const s of we.sets) if (isWorking(s) && s.kg && s.reps) v += s.kg * s.reps
  return v
}

export function workingSets(w: Workout): number {
  return w.exercises.reduce((a, we) => a + we.sets.filter(isWorking).length, 0)
}

export function liftSummary(w: Workout): LiftSummary {
  return { exercises: w.exercises.filter((we) => we.sets.some(isWorking)).length, sets: workingSets(w), volumeKg: Math.round(volume(w)) }
}

export interface ExerciseSession {
  workoutId: string
  date: string
  sets: SetEntry[]
}

/** Sessions for one exercise, newest first, only completed sets. */
export function historyFor(exerciseId: string, workouts: Workout[], excludeId?: string): ExerciseSession[] {
  const out: ExerciseSession[] = []
  for (const w of workouts) {
    if (w.id === excludeId || !w.end) continue
    for (const we of w.exercises) {
      if (we.exerciseId !== exerciseId) continue
      const sets = we.sets.filter((s) => s.done)
      if (sets.length) out.push({ workoutId: w.id, date: w.start, sets })
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

const work = (sets: SetEntry[]) => sets.filter((s) => s.kind !== 'warmup')
const countOf = (ex: Pick<Exercise, 'kind'>, s: SetEntry) => (ex.kind === 'duration' ? (s.secs ?? 0) : (s.reps ?? 0))

/** The most you moved in a session: the heaviest working set of a loaded lift, the most reps or the longest hold of anything else. */
export function topOf(ex: Pick<Exercise, 'kind'>, sets: SetEntry[]): number {
  return Math.max(0, ...work(sets).map((s) => (loaded(ex) ? (s.kg ?? 0) : countOf(ex, s))))
}

export interface Target {
  /** the plan against last time: your first go, more weight, more reps, or backing off */
  move: 'first' | 'up' | 'more' | 'back'
  /** kg on the bar, or added to you; missing until there's a session to go on, or while it's bodyweight alone */
  kg?: number
  /** reps (or seconds) to get on every set */
  count: number
  /** the change, in a few characters: "+2.5 kg", "+1 rep"; empty the first time */
  note: string
}

const roundTo = (x: number, step: number) => Math.round(x / step) * step
export const fmtKg = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(x * 10 === Math.round(x * 10) ? 1 : 2))

/** What to do on every set next time, from the last session's working sets. */
export function targetFor(ex: Exercise, history: ExerciseSession[]): Target {
  const [lo, hi] = ex.repRange
  const timed = ex.kind === 'duration'
  const sets = work(history[0]?.sets ?? [])
  if (!sets.length) return { move: 'first', count: lo, note: '' }
  const least = Math.min(...sets.map((s) => countOf(ex, s)))
  const more = (count: number): Target => {
    const d = count - least
    return { move: 'more', count, note: timed ? `+${d} s` : `+${d} ${d === 1 ? 'rep' : 'reps'}` }
  }
  // nothing to load: another rep, or a longer hold
  if (!loaded(ex)) return more(Math.max(lo, least + (timed ? 5 : 1)))
  const kg = topOf(ex, sets)
  const step = ex.increment || 2.5
  // the top of the range on every set: more weight, back to the bottom of the range
  if (least >= hi) return { move: 'up', kg: round(kg + step, 2), count: lo, note: `+${fmtKg(step)} kg` }
  // under the range twice running at this weight: a tenth off, and build back
  if (kg > 0 && stuck(ex, history, kg)) {
    const next = Math.min(kg - step, roundTo(kg * 0.9, step))
    if (next > 0) return { move: 'back', kg: next, count: Math.round((lo + hi) / 2), note: `−${fmtKg(round(kg - next, 2))} kg` }
  }
  return { ...more(Math.min(hi, Math.max(lo, least + 1))), kg: kg || undefined }
}

/** The last two sessions were both at this weight and both fell short of the range. */
function stuck(ex: Exercise, history: ExerciseSession[], kg: number): boolean {
  const short = (h?: ExerciseSession) => {
    const sets = work(h?.sets ?? [])
    return sets.length > 0 && topOf(ex, sets) === kg && Math.min(...sets.map((s) => countOf(ex, s))) < ex.repRange[0]
  }
  return short(history[0]) && short(history[1])
}

/** The target in a glance: "62.5 kg × 8", "+10 kg × 6", "12 reps", "45 s"; the range when it's your first go. */
export function targetText(ex: Exercise, t: Target): string {
  const [lo, hi] = ex.repRange
  if (ex.kind === 'duration') return t.move === 'first' ? `${lo}–${hi} s` : `${t.count} s`
  if (ex.kind === 'bodyweight') return t.move === 'first' ? `${lo}–${hi} reps` : `${t.count} reps`
  if (t.move === 'first') return `${lo}–${hi} reps`
  if (ex.kind === 'weighted-bodyweight') return `${t.kg ? `+${fmtKg(t.kg)} kg` : 'Bodyweight'} × ${t.count}`
  return `${t.kg ? `${fmtKg(t.kg)} kg` : '?'} × ${t.count}`
}

/** "72.5 × 8", "+10 × 6", "12 reps", "45 s" */
export function setText(ex: Pick<Exercise, 'kind'>, s: SetEntry): string {
  if (ex.kind === 'duration') return `${s.secs ?? 0} s`
  if (ex.kind === 'bodyweight') return `${s.reps ?? 0} reps`
  if (ex.kind === 'weighted-bodyweight') return s.kg ? `+${fmtKg(s.kg)} × ${s.reps ?? 0}` : `BW × ${s.reps ?? 0}`
  return `${fmtKg(s.kg ?? 0)} × ${s.reps ?? 0}`
}

/** A session's working sets on one line: "60 × 8, 8, 7", or set by set when the weight changed. */
export function setsLine(ex: Pick<Exercise, 'kind'>, sets: SetEntry[]): string {
  const w = work(sets)
  if (!w.length) return ''
  if (loaded(ex) && w.every((s) => s.kg === w[0].kg))
    return `${ex.kind === 'weighted-bodyweight' ? (w[0].kg ? `+${fmtKg(w[0].kg)}` : 'BW') : fmtKg(w[0].kg ?? 0)} × ${w.map((s) => s.reps ?? 0).join(', ')}`
  if (!loaded(ex)) return `${w.map((s) => countOf(ex, s)).join(', ')}${ex.kind === 'duration' ? ' s' : ''}`
  return w.map((s) => setText(ex, s)).join(', ')
}

/** Plates per side for a barbell load. */
export function plates(total: number, bar = 20): number[] {
  const out: number[] = []
  let side = (total - bar) / 2
  for (const p of [25, 20, 15, 10, 5, 2.5, 1.25]) {
    while (side >= p - 1e-9) {
      out.push(p)
      side -= p
    }
  }
  return out
}

export interface LiftRecord {
  exerciseId: string
  /** the number worth circling: "65 kg", "60 × 12" */
  value: string
  /** "Heaviest yet", "Most reps at 60 kg" */
  text: string
}

/** What a session set a new best in: the heaviest yet, or more reps than ever at that weight or heavier. One per exercise, and none the first time you log it. */
export function recordsIn(w: Workout, all: Workout[], exercises: Map<string, Exercise>): LiftRecord[] {
  const out: LiftRecord[] = []
  for (const we of w.exercises) {
    const ex = exercises.get(we.exerciseId)
    const sets = we.sets.filter(isWorking)
    if (!ex || !sets.length) continue
    const before = historyFor(ex.id, all, w.id)
      .filter((h) => h.date < w.start)
      .flatMap((h) => work(h.sets))
    if (!before.length) continue
    const top = topOf(ex, sets)
    if (!loaded(ex)) {
      if (top > topOf(ex, before))
        out.push({ exerciseId: ex.id, value: ex.kind === 'duration' ? `${top} s` : `${top} reps`, text: ex.kind === 'duration' ? 'Longest hold yet' : 'Most reps yet' })
      continue
    }
    const plus = ex.kind === 'weighted-bodyweight' ? '+' : ''
    if (top > topOf(ex, before)) {
      out.push({ exerciseId: ex.id, value: `${plus}${fmtKg(top)} kg`, text: 'Heaviest yet' })
      continue
    }
    const reps = (list: SetEntry[]) => Math.max(0, ...list.filter((s) => (s.kg ?? 0) >= top).map((s) => s.reps ?? 0))
    if (reps(sets) > reps(before))
      out.push({ exerciseId: ex.id, value: `${top ? `${plus}${fmtKg(top)}` : 'BW'} × ${reps(sets)}`, text: top ? `Most reps at ${plus}${fmtKg(top)} kg` : 'Most reps yet' })
  }
  return out
}

export interface Progress {
  ex: Exercise
  /** the most you moved each session, oldest first */
  points: { t: number; v: number }[]
  now: number
  /** against the first session in the window */
  change: number
  /** sessions in the window */
  sessions: number
}

/** How your lifts have moved over the last `weeks`, the ones you do most first. A lift needs two sessions in that time to show. */
export function progressOf(workouts: Workout[], exercises: Map<string, Exercise>, now: Date, weeks = 8): Progress[] {
  const from = now.getTime() - weeks * 7 * 86_400_000
  const ids = new Set(workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId)))
  const out: Progress[] = []
  for (const id of ids) {
    const ex = exercises.get(id)
    if (!ex) continue
    const points = historyFor(id, workouts)
      .map((h) => ({ t: Date.parse(h.date), v: topOf(ex, h.sets) }))
      .filter((p) => p.v > 0)
      .reverse()
    const recent = points.filter((p) => p.t >= from)
    if (recent.length < 2) continue
    const last = recent[recent.length - 1].v
    out.push({ ex, points: points.slice(-16), now: last, change: round(last - recent[0].v, 2), sessions: recent.length })
  }
  return out.sort((a, b) => b.sessions - a.sessions || b.points[b.points.length - 1].t - a.points[a.points.length - 1].t)
}

/** What a number on a lift means, with its unit: "62.5 kg", "+7.5 kg", "12 reps", "45 s". */
export function amount(ex: Pick<Exercise, 'kind'>, v: number, signed = false): string {
  const n = `${signed && v > 0 ? '+' : v < 0 ? '−' : ''}${fmtKg(Math.abs(v))}`
  if (ex.kind === 'duration') return `${n} s`
  if (ex.kind === 'bodyweight') return `${n} ${Math.abs(v) === 1 ? 'rep' : 'reps'}`
  return `${ex.kind === 'weighted-bodyweight' && !signed ? '+' : ''}${n} kg`
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** The last time a workout was done: by its id, or by its name for a session started again from history. Workouts newest first. */
export const lastDone = (r: Routine, workouts: Workout[]) => workouts.find((w) => w.routineId === r.id || same(w.name, r.name))

/** The workout that's waited longest: one you haven't done yet first, then the one done longest ago. Workouts newest first. */
export function nextRoutine(routines: Routine[], workouts: Workout[]): Routine | undefined {
  let pick: { r: Routine; t: number } | undefined
  for (const r of routines) {
    if (!r.items.length) continue
    const t = Date.parse(lastDone(r, workouts)?.start ?? '') || 0
    if (!pick || t < pick.t) pick = { r, t }
  }
  return pick?.r
}

/** What a workout mostly trains: its three biggest muscle groups by sets, biggest first. */
export function focusOf(r: Routine, exercises: Map<string, Exercise>): string {
  const sets = new Map<string, number>()
  for (const it of r.items) {
    const m = exercises.get(it.exerciseId)?.muscle
    if (m) sets.set(m, (sets.get(m) ?? 0) + it.sets)
  }
  const names = [...sets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([m]) => MUSCLES.find((x) => x.key === m)?.label ?? m)
  return names.map((n, i) => (i ? n.toLowerCase() : n)).join(', ')
}
