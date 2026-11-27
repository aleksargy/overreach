// Goals: a set to reach on a lift by the end of a run of a programme.
//
// What's suggested comes from where the lift stands (its best set the latest
// week it was done) and how fast it's been going up: a straight line through
// the estimated one-rep max (Epley) of its weekly bests over the last twelve
// weeks, kept between a quarter and one and a half percent a week, or half a
// percent with less than four weeks to go on. Gains slow down, so each week
// past eight counts half. The goal keeps the reps of the set it starts from (in
// the lift's range) and puts on weight, on the lift's own steps and at least a
// step. You can move it a step either way; one that needs half as fast again as
// the lift has been going, or over a percent a week, is a stretch.
//
// How it's going: the best set since it was set against the goal, by estimated
// one-rep max; done once a set reaches the goal's weight for its reps;
// on pace or behind from where the weekly bests since are heading, once there
// are three weeks of them.

import { addDays, differenceInCalendarDays, parseISO } from 'date-fns'
import type { Exercise, LiftGoal, Programme, ProgrammeRun, Routine } from '../data/types'
import { isoDay } from './format'
import { bestSet, loaded, mainSets, mondayOf, oneRm, routinesOf, type BestSet, type ExerciseSession } from './lift'
import { round } from './math'

export { bestSet, oneRm, type BestSet }

/** with less than this to go on, a lift is taken to go up half a percent a week */
export const DEFAULT_RATE = 0.005
/** what's suggested stays between these, a share a week */
export const MIN_RATE = 0.0025
export const MAX_RATE = 0.015
/** a goal is a stretch past this, or half as fast again as the lift has been going */
export const STRETCH_RATE = 0.01
/** with no end to the programme, goals are for ten weeks on */
export const GOAL_WEEKS = 10

const WEEK = 7 * 86_400_000
const floorTo = (x: number, step: number) => round(Math.floor(x / step + 1e-9) * step, 2)

/** Weeks counted towards a goal: each past eight counts half, as gains slow down. */
export const counted = (weeks: number) => (weeks <= 8 ? weeks : 8 + (weeks - 8) / 2)

const bodyOf = (ex: Exercise, bodyKg = 0) => (ex.kind === 'weighted-bodyweight' ? bodyKg : 0)

/** A lift's best set each week (Monday to Sunday) it was done, oldest first. */
export function weeklyBests(ex: Exercise, history: ExerciseSession[], bodyKg?: number): BestSet[] {
  const weeks = new Map<string, BestSet>()
  for (const h of history) {
    const b = bestSet(ex, h, bodyKg)
    const k = mondayOf(h.date)
    if (b && (!weeks.get(k) || b.max > weeks.get(k)!.max)) weeks.set(k, b)
  }
  return [...weeks.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** A straight line through the log of some bests against weeks: its slope (a share a week, compounded) and where it says a day would be. */
function fit(points: BestSet[]): { rate: number; at: (t: number) => number } {
  const xs = points.map((p) => Date.parse(p.date) / WEEK)
  const ys = points.map((p) => Math.log(p.max))
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length
  const my = ys.reduce((a, b) => a + b, 0) / ys.length
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0)
  const slope = sxx ? xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx : 0
  return { rate: Math.exp(slope) - 1, at: (t) => Math.exp(my + slope * (t / WEEK - mx)) }
}

/**
 * How fast a lift's estimated one-rep max has been going up, a share a week: a straight line through its weekly bests
 * in the twelve weeks before `now`. Needs four weeks of them, at least three weeks apart end to end.
 */
export function rateOf(points: BestSet[], now: Date): number | undefined {
  const pts = points.filter((p) => Date.parse(p.date) <= now.getTime() && Date.parse(p.date) > now.getTime() - 12 * WEEK)
  if (pts.length < 4 || Date.parse(pts[pts.length - 1].date) - Date.parse(pts[0].date) < 3 * WEEK) return undefined
  return fit(pts).rate
}

/** The day a run's goals are aimed for: the Sunday its last week ends on, or ten weeks on from `now` with no end. */
export function goalDay(p: Programme, run: ProgrammeRun, now: Date): string {
  return isoDay(p.weeks ? addDays(parseISO(mondayOf(run.start)), p.weeks * 7 - 1) : addDays(now, GOAL_WEEKS * 7))
}

const weeksTo = (from: string | Date, by: string) => Math.max(1, differenceInCalendarDays(parseISO(by), typeof from === 'string' ? parseISO(from) : from) / 7)

/** The goal to suggest for a lift, aimed at `by`; none for a lift with nothing to load or no sessions yet. */
export function suggestGoal(ex: Exercise, history: ExerciseSession[], o: { now: Date; by: string; bodyKg?: number }): LiftGoal | undefined {
  if (!loaded(ex)) return undefined
  const points = weeklyBests(ex, history, o.bodyKg)
  const from = points[points.length - 1]
  if (!from) return undefined
  const known = rateOf(points, o.now)
  const rate = known === undefined ? DEFAULT_RATE : Math.min(MAX_RATE, Math.max(MIN_RATE, known))
  const [lo, hi] = ex.repRange
  const reps = Math.min(hi, Math.max(lo, from.reps))
  const body = bodyOf(ex, o.bodyKg)
  const step = ex.increment || 2.5
  let kg = Math.max(0, floorTo((from.max * (1 + rate) ** counted(weeksTo(o.now, o.by))) / (1 + reps / 30) - body, step))
  // at least a step on from where it stands
  while (oneRm(kg + body, reps) <= from.max) kg = round(kg + step, 2)
  return { exerciseId: ex.id, kg, reps, from: { kg: from.kg, reps: from.reps }, set: isoDay(o.now), by: o.by }
}

/** The share a week a goal needs, from where the lift stood to the goal by its day, the weeks past eight counting half. */
export function rateNeeded(g: LiftGoal, ex: Exercise, bodyKg?: number): number {
  const body = bodyOf(ex, bodyKg)
  return (oneRm(g.kg + body, g.reps) / oneRm(g.from.kg + body, g.from.reps)) ** (1 / counted(weeksTo(g.set, g.by))) - 1
}

/** A goal that needs half as fast again as the lift has been going up (twelve weeks before it was set), or over a percent a week. */
export function isStretch(g: LiftGoal, ex: Exercise, history: ExerciseSession[], bodyKg?: number): boolean {
  const known = rateOf(weeklyBests(ex, history, bodyKg), parseISO(g.set)) ?? 0
  return rateNeeded(g, ex, bodyKg) > Math.max(STRETCH_RATE, known * 1.5) + 1e-9
}

/** A goal a step heavier or lighter, never down to where the lift stood. */
export function nudge(g: LiftGoal, ex: Exercise, d: -1 | 1, bodyKg?: number): LiftGoal {
  const body = bodyOf(ex, bodyKg)
  const kg = round(g.kg + d * (ex.increment || 2.5), 2)
  return d < 0 && oneRm(kg + body, g.reps) <= oneRm(g.from.kg + body, g.from.reps) ? g : { ...g, kg }
}

export interface GoalProgress {
  /** your best set since the goal was set (in the run), or where the lift stood if it's not been done since */
  now: { kg: number; reps: number }
  /** how far that is from where it stood to the goal, by estimated one-rep max, 0 to 1 */
  share: number
  /** a set at the goal's weight for its reps, or more, since it was set */
  done: boolean
  /** where the weekly bests since it was set are heading against it, once there are three weeks of them */
  pace?: 'on' | 'behind'
}

/** How a goal is going in a run, as of `now`. */
export function goalProgress(g: LiftGoal, ex: Exercise, history: ExerciseSession[], run: ProgrammeRun, now: Date, bodyKg?: number): GoalProgress {
  const body = bodyOf(ex, bodyKg)
  const start = oneRm(g.from.kg + body, g.from.reps)
  const end = oneRm(g.kg + body, g.reps)
  const day = (h: ExerciseSession) => isoDay(parseISO(h.date))
  const during = history.filter((h) => day(h) >= g.set && day(h) >= run.start && (!run.end || day(h) <= run.end))
  const best = during.map((h) => bestSet(ex, h, bodyKg)).reduce<BestSet | undefined>((a, b) => (b && (!a || b.max > a.max) ? b : a), undefined)
  const at = best && best.max > start ? best : { ...g.from, max: start }
  const done = during.some((h) => mainSets(h.sets).some((s) => (s.kg ?? 0) >= g.kg && (s.reps ?? 0) >= g.reps))
  const since = weeklyBests(
    ex,
    history.filter((h) => day(h) >= g.set),
    bodyKg,
  )
  const points = [{ ...g.from, max: start, date: `${g.set}T12:00:00` }, ...since]
  const pace =
    done || since.length < 3 || differenceInCalendarDays(now, parseISO(g.set)) < 21 ? undefined : fit(points).at(Date.parse(`${g.by}T12:00:00`)) >= end - 1e-9 ? 'on' : 'behind'
  return { now: { kg: at.kg, reps: at.reps }, share: Math.min(1, Math.max(0, (at.max - start) / (end - start))), done, pace }
}

/** Every lift with weight on it in a programme, once each, in the order they come round: the ones a goal can go on. */
export function liftsOf(p: Programme, routines: Routine[], exercises: Map<string, Exercise>): Exercise[] {
  const out: Exercise[] = []
  for (const r of routinesOf(p, routines))
    for (const it of r.items) {
      const ex = exercises.get(it.exerciseId)
      if (ex && loaded(ex) && !out.includes(ex)) out.push(ex)
    }
  return out
}

/** The lifts goals are suggested for: each workout's first one with weight on it, once each. */
export function mainLiftsOf(p: Programme, routines: Routine[], exercises: Map<string, Exercise>): Exercise[] {
  const out: Exercise[] = []
  for (const r of routinesOf(p, routines)) {
    const ex = r.items.map((it) => exercises.get(it.exerciseId)).find((e) => e && loaded(e))
    if (ex && !out.includes(ex)) out.push(ex)
  }
  return out
}
