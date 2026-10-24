import type { Exercise, LiftSummary, SetEntry, Workout } from '../data/types'
import { clamp, round } from './math'

/** Estimated 1RM from a set, using reps in reserve from RPE (Epley on reps + RIR). */
export function e1rm(kg: number | undefined, reps: number | undefined, rpe?: number): number {
  if (!kg || !reps) return 0
  const rir = rpe ? clamp(10 - rpe, 0, 5) : 0
  const eff = reps + rir
  return eff <= 1 ? kg : kg * (1 + eff / 30)
}

export const isWorking = (s: SetEntry) => s.done && s.kind !== 'warmup'

/** e1RM only means something for plain loaded lifts; bodyweight work is judged on reps and added kg. */
export const hasE1rm = (ex: Pick<Exercise, 'kind'>) => ex.kind === 'weight'

export function setLoad(ex: Exercise, s: SetEntry, bodyweight = 0): number {
  if (ex.kind === 'weighted-bodyweight') return (s.kg ?? 0) + bodyweight
  return s.kg ?? 0
}

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

export function bestE1rm(ex: Exercise, sets: SetEntry[], bw = 0): number {
  let best = 0
  for (const s of sets) if (s.kind !== 'warmup') best = Math.max(best, e1rm(setLoad(ex, s, bw), s.reps, s.rpe))
  return best
}

export interface Suggestion {
  tag: 'first' | 'up' | 'reps' | 'hold' | 'deload' | 'easy'
  kg?: number
  reps: string
  rpe: number
  text: string
}

/**
 * What to do next time, from the last session's working sets.
 * Double progression: earn the top of the rep range at or under target RPE,
 * then add load and drop back to the bottom of the range.
 */
export function suggest(ex: Exercise, history: ExerciseSession[], readinessScore?: number): Suggestion {
  const [lo, hi] = ex.repRange
  const t = ex.targetRpe
  const isDuration = ex.kind === 'duration'
  const unit = isDuration ? 's' : ''
  let s: Suggestion

  const last = history[0]
  const work = last?.sets.filter((x) => x.kind !== 'warmup') ?? []
  if (!last || !work.length) {
    s = {
      tag: 'first',
      reps: `${lo}–${hi}${unit}`,
      rpe: t,
      text: isDuration
        ? `First time. Hold for ${lo}–${hi}s with a little left in the tank.`
        : `First time. Pick a load you could do ${hi} times with 2 reps left.`,
    }
  } else {
    const vals = work.map((x) => (isDuration ? x.secs ?? 0 : x.reps ?? 0))
    const minVal = Math.min(...vals)
    const maxRpe = Math.max(...work.map((x) => x.rpe ?? t))
    const kg = Math.max(...work.map((x) => x.kg ?? 0))
    const stalls = countStalls(history, lo)
    if (minVal >= hi && maxRpe <= t + 0.5) {
      if (isDuration) s = { tag: 'up', reps: `${hi + 5}s`, rpe: t, text: `Held ${hi}s on every set. Push the hold to ${hi + 5}s.` }
      else if (ex.kind === 'bodyweight')
        s = { tag: 'up', reps: `${hi}+`, rpe: t, text: `Hit ${hi}+ on every set at RPE ${fmtRpe(maxRpe)}. Time for a harder variation or a weight belt.` }
      else {
        const next = round(kg + ex.increment, 2)
        s = { tag: 'up', kg: next, reps: `${lo}–${hi}`, rpe: t, text: `Hit ${hi} on every set at RPE ${fmtRpe(maxRpe)} or less. Go up to ${fmtKg(next)} kg and start back at ${lo}.` }
      }
    } else if (stalls >= 2 && kg > 0) {
      const next = roundTo(kg * 0.9, ex.increment || 2.5)
      s = { tag: 'deload', kg: next, reps: `${lo}–${hi}`, rpe: 7, text: `Stuck under ${lo} reps twice in a row. Drop to ${fmtKg(next)} kg and build back up.` }
    } else if (minVal >= lo && maxRpe <= 9) {
      const target = Math.min(hi, minVal + (isDuration ? 5 : 1))
      s = {
        tag: 'reps',
        kg: kg || undefined,
        reps: `${target}${unit}`,
        rpe: t,
        text: kg ? `Stay at ${fmtKg(kg)} kg and chase ${target}${unit} on every set.` : `Same again, chasing ${target}${unit} on every set.`,
      }
    } else {
      s = {
        tag: 'hold',
        kg: kg || undefined,
        reps: `${lo}${unit}`,
        rpe: t,
        text: kg ? `That was a grind. Hold ${fmtKg(kg)} kg and own ${lo}${unit} on every set first.` : `Hold here and own ${lo}${unit} on every set first.`,
      }
    }
  }
  if (readinessScore !== undefined && readinessScore < 45 && s.tag !== 'first') {
    return { ...s, tag: 'easy', kg: s.tag === 'up' ? history[0] && Math.max(...history[0].sets.map((x) => x.kg ?? 0)) : s.kg, rpe: 7, text: `Readiness is ${readinessScore} today, so no heroics: repeat last time's load and cap it at RPE 7.` }
  }
  return s
}

function countStalls(history: ExerciseSession[], lo: number): number {
  let n = 0
  for (const h of history.slice(0, 3)) {
    const work = h.sets.filter((x) => x.kind !== 'warmup')
    if (work.length && Math.min(...work.map((x) => x.reps ?? 0)) < lo) n++
    else break
  }
  return n
}

const roundTo = (x: number, step: number) => Math.round(x / step) * step
export const fmtKg = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(x * 10 === Math.round(x * 10) ? 1 : 2))
export const fmtRpe = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1))

export const RPE_SCALE: { rpe: number; label: string }[] = [
  { rpe: 6, label: '4+ reps left' },
  { rpe: 6.5, label: '3–4 left' },
  { rpe: 7, label: '3 reps left' },
  { rpe: 7.5, label: '2–3 left' },
  { rpe: 8, label: '2 reps left' },
  { rpe: 8.5, label: '1–2 left' },
  { rpe: 9, label: '1 rep left' },
  { rpe: 9.5, label: 'Maybe 1 more' },
  { rpe: 10, label: 'Nothing left' },
]

export function rpeTone(rpe?: number): string {
  if (!rpe) return 'bg-ink-3 text-fg-3'
  if (rpe < 7) return 'bg-z1 text-ink-0'
  if (rpe < 8) return 'bg-z2 text-ink-0'
  if (rpe < 9) return 'bg-z3 text-ink-0'
  if (rpe < 10) return 'bg-z4 text-ink-0'
  return 'bg-z5 text-ink-0'
}

/** Session RPE (Foster's 1–10) runs on a wider scale than set RPE, so it gets its own colours. */
export function srpeTone(n: number): string {
  if (n <= 3) return 'bg-z1 text-ink-0'
  if (n <= 5) return 'bg-z2 text-ink-0'
  if (n <= 7) return 'bg-z3 text-ink-0'
  if (n <= 9) return 'bg-z4 text-ink-0'
  return 'bg-z5 text-ink-0'
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

export interface PR {
  exerciseId: string
  kind: 'e1rm' | 'weight' | 'reps'
  label: string
}

export function prsFor(w: Workout, all: Workout[], exercises: Map<string, Exercise>, bw = 0): PR[] {
  const prs: PR[] = []
  for (const we of w.exercises) {
    const ex = exercises.get(we.exerciseId)
    if (!ex || ex.kind === 'duration') continue
    const sets = we.sets.filter(isWorking)
    if (!sets.length) continue
    const prev = historyFor(ex.id, all, w.id).filter((h) => h.date < w.start)
    if (!prev.length) continue
    const prevSets = prev.flatMap((h) => h.sets.filter((x) => x.kind !== 'warmup'))
    const nowBest = bestE1rm(ex, sets, bw)
    const prevBest = bestE1rm(ex, prevSets, bw)
    // 2% clears the wobble RPE adds to the estimate, so a trophy means real progress
    if (hasE1rm(ex) && nowBest > prevBest * 1.02) {
      prs.push({ exerciseId: ex.id, kind: 'e1rm', label: `e1RM ${fmtKg(round(nowBest, 1))} kg` })
      continue
    }
    const nowKg = Math.max(...sets.map((x) => x.kg ?? 0))
    const prevKg = Math.max(...prevSets.map((x) => x.kg ?? 0))
    if (nowKg > prevKg && nowKg > 0) {
      prs.push({ exerciseId: ex.id, kind: 'weight', label: ex.kind === 'weighted-bodyweight' ? `Most added, +${fmtKg(nowKg)} kg` : `Heaviest ${fmtKg(nowKg)} kg` })
      continue
    }
    const nowReps = Math.max(...sets.map((x) => x.reps ?? 0))
    const prevReps = Math.max(...prevSets.filter((x) => (x.kg ?? 0) >= nowKg).map((x) => x.reps ?? 0), 0)
    if (nowReps > prevReps) prs.push({ exerciseId: ex.id, kind: 'reps', label: `${nowReps} reps${nowKg ? ` at ${fmtKg(nowKg)} kg` : ''}` })
  }
  return prs
}
