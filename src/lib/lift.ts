// Lifting: what to do next session, what you've done, and how it's moving.
//
// The plan is double progression, worked out from what you lifted: every
// exercise has a rep range and one working weight. The weakest set aims for one
// more rep each session and the others for what they did last time; every set at
// the top of the range earns the next weight, starting again from the bottom.
// Lighter sets before the first at the working weight are the ramp up to it: they
// keep their weight and reps, and the rules run on the sets from there.
// Around that: a step too big to make the bottom of the range waits for more reps
// (an estimated one-rep max says when it's in reach); every set at the working
// weight far over or under the range sets it again from the weakest; under the
// range twice, or no reps gained in two sessions, takes a tenth off to build back
// from; so does a long break. Weight added to you counts with your body weight.
//
// Each week (Monday to Sunday) counts once, as its best session of the lift: a
// lift done twice a week moves on from the better of the two, so a tired second
// go doesn't pull it down, and backing off needs two weeks, not two sessions.
//
// A reverse pyramid (`Exercise.pyramid`) runs the same rules set by set: the top
// set first, then each set lighter and two reps higher, each moving on its own.
// A drop set is extra work logged after a set: it counts in the volume but never
// moves a target. Exercises in a superset are done in turns and still move on
// their own.
//
// A programme is some of your workouts run so many times a week, for a number of
// weeks or with no end: Next up only comes from the one you're on.

import { differenceInCalendarWeeks, parseISO, startOfWeek } from 'date-fns'
import { MUSCLES } from '../data/exercises'
import type { Exercise, LiftSummary, Programme, ProgrammeRun, Routine, SetEntry, Workout } from '../data/types'
import { isoDay } from './format'
import { median, round } from './math'

/** A set that counts: done, and not a warm-up or a drop set. */
export const isWorking = (s: SetEntry) => s.done && s.kind !== 'warmup' && s.kind !== 'drop'

/** Tracked by the weight on the bar, or the weight added to you. */
export const loaded = (ex: Pick<Exercise, 'kind'>) => ex.kind === 'weight' || ex.kind === 'weighted-bodyweight'

export function volume(w: Workout): number {
  let v = 0
  // drop sets are work too
  for (const we of w.exercises) for (const s of we.sets) if (s.done && s.kind !== 'warmup' && s.kg && s.reps) v += s.kg * s.reps
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

/** The sets the targets go on, in order: not warm-ups, and not drop sets. */
export const mainSets = (sets: SetEntry[]) => sets.filter((s) => s.kind !== 'warmup' && s.kind !== 'drop')
const work = mainSets
const countOf = (ex: Pick<Exercise, 'kind'>, s: SetEntry) => (ex.kind === 'duration' ? (s.secs ?? 0) : (s.reps ?? 0))

/** The most you moved in a session: the heaviest working set of a loaded lift, the most reps or the longest hold of anything else. */
export function topOf(ex: Pick<Exercise, 'kind'>, sets: SetEntry[]): number {
  return Math.max(0, ...work(sets).map((s) => (loaded(ex) ? (s.kg ?? 0) : countOf(ex, s))))
}

export interface Target {
  /** the plan against last time: your first go, more weight, more reps (or sets), or backing off */
  move: 'first' | 'up' | 'more' | 'back'
  /** kg on the bar, or added to you; missing until there's a session to go on, or while it's bodyweight alone */
  kg?: number
  /** reps (or seconds) to get on every set at the working weight, at least; in a reverse pyramid, the top set's */
  count: number
  /**
   * What each set aims for, in order: never under `count`, nor under what that set did last time at this weight.
   * The ramp up to the working weight (lighter sets before it last time) keeps its own weight and reps, and in a
   * reverse pyramid each set has its own weight too. Sets past the end aim for `kg` and `count`.
   */
  perSet: { kg?: number; count: number }[]
  /** the change, in a few characters: "+2.5 kg", "+1 rep", "+1 set"; empty the first time */
  note: string
}

export interface TargetOptions {
  /** working sets the workout has: when last time had fewer, the weight waits until they're all done */
  sets?: number
  /** today, to spot a long break */
  now?: Date
  /** your body weight, for lifts that add weight to you */
  bodyKg?: number
}

const DAY = 86_400_000
/** reps over or under the range that say the weight was wrong rather than the day */
const FAR = 3
/** what's left after backing off: a tenth comes off */
const BACK_OFF = 0.9
/** the shortest break that takes a tenth off; three times your usual gap if that's longer */
const BREAK_DAYS = 28

const roundTo = (x: number, step: number) => round(Math.round(x / step) * step, 2)
const floorTo = (x: number, step: number) => round(Math.floor(x / step + 1e-9) * step, 2)
export const fmtKg = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(x * 10 === Math.round(x * 10) ? 1 : 2))
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`

/** Reps a set of `reps` at `from` kg says you'd get at `kg`, by its estimated one-rep max (Epley). */
export const repsAt = (from: number, reps: number, kg: number) => 30 * ((from * (1 + reps / 30)) / kg - 1)
/** The weight a set of `reps0` at `from` kg says you'd lift for `reps`. */
export const kgFor = (from: number, reps0: number, reps: number) => (from * (1 + reps0 / 30)) / (1 + reps / 30)

/** How long off before a tenth comes off: four weeks, or three times your usual gap between sessions if that's longer. */
export function breakDays(history: ExerciseSession[]): number {
  const gaps = history.slice(0, 9).flatMap((h, i, a) => (i ? [(Date.parse(a[i - 1].date) - Date.parse(h.date)) / DAY] : []))
  return Math.max(BREAK_DAYS, gaps.length >= 2 ? 3 * median(gaps) : 0)
}

/** The latest sessions at `kg`, newest first, as long as they stayed at that weight: the weakest set there, and the average. */
function atWeight(history: ExerciseSession[], kg: number, n: number): { least: number; mean: number }[] {
  const out: { least: number; mean: number }[] = []
  for (const h of history.slice(0, n)) {
    const sets = work(h.sets)
    if (!sets.length || Math.max(...sets.map((s) => s.kg ?? 0)) !== kg) break
    const reps = sets.filter((s) => (s.kg ?? 0) === kg).map((s) => s.reps ?? 0)
    out.push({ least: Math.min(...reps), mean: reps.reduce((a, b) => a + b, 0) / reps.length })
  }
  return out
}

/** How many sets a session ramped up through before its first at the working weight `kg` (they're all lighter). */
export const rampOf = (sets: SetEntry[], kg: number) =>
  Math.max(
    0,
    sets.findIndex((s) => (s.kg ?? 0) === kg),
  )

/** The Monday a day's week starts on, yyyy-MM-dd: weeks run Monday to Sunday. */
export const mondayOf = (d: Date | string) => isoDay(startOfWeek(typeof d === 'string' ? parseISO(d) : d, { weekStartsOn: 1 }))

/**
 * The better of two sessions of a lift, the one to build on: the heavier, as long as its weakest set there reached the
 * range, then the one with more reps on that set, then more on average. A heavier go that fell short of the range
 * loses to a lighter one that didn't; between two that fell short, the one whose weakest set says the most for a
 * one-rep max wins. Work with nothing to load goes by the weakest set's reps or seconds. A tie keeps the newer.
 */
function better(ex: Exercise, a: ExerciseSession, b: ExerciseSession, bodyKg = 0): ExerciseSession {
  const [lo] = ex.repRange
  const rank = (h: ExerciseSession) => {
    const main = work(h.sets)
    if (!main.length) return { ok: false, kg: 0, least: 0, mean: 0, max: -1 }
    const kg = loaded(ex) ? topOf(ex, main) : 0
    const counts = (loaded(ex) ? main.slice(rampOf(main, kg)).filter((s) => (s.kg ?? 0) === kg) : main).map((s) => countOf(ex, s))
    const least = Math.min(...counts)
    const load = kg + (ex.kind === 'weighted-bodyweight' ? bodyKg : 0)
    return { ok: !loaded(ex) || least >= lo, kg, least, mean: counts.reduce((x, y) => x + y, 0) / counts.length, max: load * (1 + least / 30) }
  }
  const x = rank(a)
  const y = rank(b)
  if (x.ok !== y.ok) return x.ok ? a : b
  if (!x.ok) return y.max > x.max ? b : a
  return y.kg > x.kg || (y.kg === x.kg && (y.least > x.least || (y.least === x.least && y.mean > x.mean))) ? b : a
}

/** A lift's sessions with each week (Monday to Sunday) as its best one, newest first: what targets go on. */
export function weeksOf(ex: Exercise, history: ExerciseSession[], bodyKg?: number): ExerciseSession[] {
  const out: ExerciseSession[] = []
  let week = ''
  for (const h of history) {
    const k = mondayOf(h.date)
    if (k === week) out[out.length - 1] = better(ex, out[out.length - 1], h, bodyKg)
    else out.push(h)
    week = k
  }
  return out
}

/**
 * What to do next time, from the sessions before (newest first), each week as its best session. Nothing to
 * load: one more rep on the weakest set, or five more seconds. Loaded, the ramp
 * up to the working weight stays as it was and, in order: a long break takes a
 * tenth off; every set at the working weight far over or under the range sets it
 * again from the weakest, to land mid-range; under the range two weeks running, or
 * no reps gained in two weeks, takes a tenth off; every set at the top earns the next
 * weight, once the workout's sets are all done and the step is in reach;
 * otherwise the weakest set aims for one more rep.
 */
export function targetFor(ex: Exercise, sessions: ExerciseSession[], o: TargetOptions = {}): Target {
  const [lo, hi] = ex.repRange
  const mid = Math.round((lo + hi) / 2)
  const timed = ex.kind === 'duration'
  // each week counts once, as its best session: a tired second go in a week doesn't pull the target down, and the
  // rules that back off count weeks, not sessions
  const history = weeksOf(ex, sessions, o.bodyKg)
  const sets = work(history[0]?.sets ?? [])
  if (!sets.length) return { move: 'first', count: lo, perSet: [], note: '' }
  if (ex.pyramid && loaded(ex)) return pyramidTarget(ex, history, sessions, o)

  // nothing to load: another rep on the weakest set, or a longer hold
  if (!loaded(ex)) {
    const counts = sets.map((s) => countOf(ex, s))
    const least = Math.min(...counts)
    const count = Math.max(lo, least + (timed ? 5 : 1))
    return { move: 'more', count, perSet: counts.map((c) => ({ count: Math.max(c, count) })), note: timed ? `+${count - least} s` : `+${plural(count - least, 'rep')}` }
  }

  const step = ex.increment || 2.5
  // the working weight is your heaviest working set
  const kg = topOf(ex, sets)
  // lighter sets before the first at that weight were the ramp up to it: they say nothing about what you can do there
  // (40 × 10 on the way to 80 × 9 isn't a set you failed at 80), so the rules run on the sets from there
  const ramp = rampOf(sets, kg)
  const last = sets.slice(ramp)
  // and the ramp keeps its weight and reps, as long as it stays under the working weight
  const rampTo = (next: number) => sets.slice(0, ramp).map((s) => ({ kg: (s.kg ?? 0) < next ? (s.kg ?? 0) : floorTo(((s.kg ?? 0) * next) / kg, step), count: s.reps ?? 0 }))
  // estimates need the whole load: a lift that adds weight to you needs your body weight to go on
  const body = ex.kind === 'weighted-bodyweight' ? o.bodyKg : 0
  const known = body !== undefined && kg + body > 0
  const load = (x: number) => x + (body ?? 0)
  // what each set comes to at that weight: its reps, or for a lighter set what it says you'd get, short of the top
  // (a set done lighter doesn't count as done at the top)
  const counts = last.map((s) =>
    (s.kg ?? 0) === kg ? (s.reps ?? 0) : Math.min(hi - 1, known ? Math.max(0, Math.floor(repsAt(load(s.kg ?? 0), s.reps ?? 0, load(kg)))) : (s.reps ?? 0)),
  )
  const least = Math.min(...counts)
  // the reps of the sets done at the working weight: only they can say the weight was wrong
  const atKg = last.filter((s) => (s.kg ?? 0) === kg).map((s) => s.reps ?? 0)
  const at = (next: number, move: 'up' | 'back', count: number): Target => ({
    move,
    kg: next || undefined,
    count,
    perSet: [...rampTo(next), ...last.map(() => ({ kg: next || undefined, count }))],
    note: `${move === 'up' ? '+' : '−'}${fmtKg(round(Math.abs(next - kg), 2))} kg`,
  })
  const more = (count: number, note = `+${plural(count - least, 'rep')}`): Target => ({
    move: 'more',
    kg: kg || undefined,
    count,
    perSet: [...rampTo(kg), ...counts.map((c) => ({ kg: kg || undefined, count: Math.max(c, count) }))],
    note,
  })
  // a tenth off the whole load, on the weight's own steps; at least a step, and never under nothing added
  const lighter = () => {
    const next = Math.max(0, Math.min(kg - step, roundTo(load(kg) * BACK_OFF - (body ?? 0), step)))
    return ex.kind === 'weight' ? (next > 0 ? next : undefined) : next < kg ? next : undefined
  }

  // a long break: a tenth off
  // (from the last time you did it, and your usual gap between any two goes)
  const off = o.now ? (o.now.getTime() - Date.parse(sessions[0].date)) / DAY : 0
  if (off >= breakDays(sessions)) {
    const next = lighter()
    if (next !== undefined) return at(next, 'back', mid)
  }

  // every set at the working weight far over or under the range: the weight was wrong, so set it again from the
  // weakest, aiming mid-range. One set falling away is the day, not the weight, and a lighter set (or one done
  // lighter) never says you failed at it.
  const farOver = least >= hi + FAR
  const farUnder = Math.max(...atKg) <= lo - FAR
  if (known && (farOver || farUnder)) {
    const fit = floorTo(kgFor(load(kg), Math.min(...atKg), mid) - (body ?? 0), step)
    // more than a step up goes straight there, a quarter more at most; a single step goes the usual way, below
    if (farOver) {
      if (fit >= kg + 2 * step) return at(Math.min(fit, floorTo(load(kg) * 1.25 - (body ?? 0), step)), 'up', mid)
    } else {
      // the bar can't go under a step, though weight added to you can go back to none
      const minKg = ex.kind === 'weight' ? step : 0
      const next = Math.min(kg - step, Math.max(minKg, fit))
      if (next >= minKg && next < kg) return at(next, 'back', mid)
    }
  }

  // under the range two sessions running, or no reps gained in either of the last two (on average a set): a tenth off
  const recent = atWeight(history, kg, 3)
  const under = recent.length >= 2 && recent[0].least < lo && recent[1].least < lo
  const stalled = recent.length === 3 && Math.max(recent[0].mean, recent[1].mean) <= recent[2].mean
  if (under || (stalled && least < hi)) {
    const next = lighter()
    if (next !== undefined) return at(next, 'back', mid)
  }

  // every set at the top of the range
  if (least >= hi) {
    // the workout has more sets than you did: they all get to the top first
    const missing = (o.sets ?? 0) - sets.length
    if (missing > 0) return more(hi, `+${plural(missing, 'set')}`)
    // a step too big to make the bottom of the range waits for more reps, unless they've stopped coming
    const next = round(kg + step, 2)
    if (known && repsAt(load(kg), least, load(next)) < lo && least < 2 * hi && !stalled) return more(least + 1)
    return at(next, 'up', lo)
  }

  return more(Math.min(hi, Math.max(lo, least + 1)))
}

/** In a reverse pyramid each set after the top one aims this many reps higher than the set before. */
export const PYRAMID_REPS = 2
/** and a set with nothing to go on starts this much lighter than the set before */
const PYRAMID_LIGHTER = 0.9

/** A set's rep range in a reverse pyramid: the exercise's for the top set, two reps higher for each set after it. */
export const pyramidRange = (ex: Pick<Exercise, 'repRange'>, k: number): [number, number] => [ex.repRange[0] + PYRAMID_REPS * k, ex.repRange[1] + PYRAMID_REPS * k]

/** The next set down a reverse pyramid with nothing else to go on: a tenth lighter than `kg`, on the weight's own steps. */
export const pyramidStep = (ex: Pick<Exercise, 'increment'>, kg: number) => Math.max(0, roundTo(kg * PYRAMID_LIGHTER, ex.increment || 2.5)) || undefined

/**
 * A reverse pyramid, set by set: each set moves by the same rules as straight sets, from that set in the sessions
 * before, within its own rep range. A set the last session didn't have starts a tenth lighter than the one above it,
 * at the bottom of its range. The headline (`kg`, `count`, `move`, `note`) is the top set's.
 */
function pyramidTarget(ex: Exercise, history: ExerciseSession[], sessions: ExerciseSession[], o: TargetOptions): Target {
  // as many sets as the week's best session had
  const last = work(history[0].sets)
  const step = ex.increment || 2.5
  const body = ex.kind === 'weighted-bodyweight' ? (o.bodyKg ?? 0) : 0
  const sets: Target[] = []
  for (let k = 0; k < Math.max(1, o.sets ?? last.length); k++) {
    const range = pyramidRange(ex, k)
    if (k < last.length) {
      // this set in the sessions that had it, each week its best: the latest did
      const own = sessions.map((h) => ({ ...h, sets: work(h.sets).slice(k, k + 1) })).filter((h) => h.sets.length)
      sets.push(targetFor({ ...ex, pyramid: false, repRange: range }, own, { now: o.now, bodyKg: o.bodyKg }))
    } else {
      const above = sets[k - 1]
      const kg = above.kg !== undefined ? Math.max(0, roundTo((above.kg + body) * PYRAMID_LIGHTER - body, step)) : undefined
      sets.push({ move: 'more', kg: kg || undefined, count: range[0], perSet: [], note: '' })
    }
  }
  return { ...sets[0], perSet: sets.map((t) => ({ kg: t.kg, count: t.count })) }
}

/** The drop sets in a session, by the main set they follow (0 for the first). */
export function dropsBySet(sets: SetEntry[]): Map<number, SetEntry[]> {
  const out = new Map<number, SetEntry[]>()
  let k = -1
  for (const s of sets) {
    if (s.kind === 'warmup') continue
    if (s.kind !== 'drop') k++
    else if (k >= 0) out.set(k, [...(out.get(k) ?? []), s])
  }
  return out
}

/**
 * Where a drop set starts: as far down from the set before as last time's was, or a fifth, on the weight's own steps
 * and at least a step down; as many reps as last time's, or as the set before.
 */
export function dropFor(ex: Exercise, before: { kg?: number; count?: number }, last?: { from?: number; kg?: number; reps?: number }): { kg?: number; count?: number } {
  const step = ex.increment || 2.5
  const ratio = last?.kg && last.from ? last.kg / last.from : 0.8
  const kg = before.kg ? Math.max(0, Math.min(before.kg - step, floorTo(before.kg * ratio, step))) : undefined
  return { kg: kg || undefined, count: last?.reps ?? before.count }
}

/** Superset tags for a workout's exercises, in order: A1, A2 for the first done in turns, B1, B2 for the next; none for one done on its own. */
export function supersetTags(items: { superset?: string }[]): (string | undefined)[] {
  const tags: (string | undefined)[] = items.map(() => undefined)
  let letter = 0
  for (let i = 0; i < items.length;) {
    const key = items[i].superset
    let j = i + 1
    while (key && j < items.length && items[j].superset === key) j++
    if (j - i > 1) {
      const name = String.fromCharCode(65 + (letter++ % 26))
      for (let k = i; k < j; k++) tags[k] = `${name}${k - i + 1}`
    }
    i = j
  }
  return tags
}

/** Supersets after a move or a removal: an exercise left on its own isn't in one any more. */
export function tidySupersets<T extends { superset?: string }>(items: T[]): T[] {
  const tags = supersetTags(items)
  return items.map((x, i) => (x.superset && !tags[i] ? { ...x, superset: undefined } : x))
}

/** Do the exercises at `i` and `i + 1` in turns, or stop: a join brings the one below (and its superset) into the one above; a split starts a new one below. */
export function toggleSuperset<T extends { superset?: string }>(items: T[], i: number, newKey: () => string): T[] {
  const a = items[i]
  const b = items[i + 1]
  if (!a || !b) return items
  const out = items.map((x) => ({ ...x }))
  if (a.superset && a.superset === b.superset) {
    const key = newKey()
    for (let j = i + 1; j < out.length && out[j].superset === a.superset; j++) out[j].superset = key
  } else {
    const key = a.superset ?? newKey()
    const old = b.superset
    out[i].superset = key
    for (let j = i + 1; j < out.length && (j === i + 1 || (!!old && out[j].superset === old)); j++) out[j].superset = key
  }
  return tidySupersets(out)
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

/** A session's working sets on one line: "60 × 8, 8, 7", or set by set when the weight changed, and any drop sets after: "+ 50 × 8". */
export function setsLine(ex: Pick<Exercise, 'kind'>, sets: SetEntry[]): string {
  const drops = sets.filter((s) => s.kind === 'drop').map((s) => `+ ${setText(ex, s)}`)
  return [mainLine(ex, work(sets)), ...drops].filter(Boolean).join(' ')
}

function mainLine(ex: Pick<Exercise, 'kind'>, w: SetEntry[]): string {
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

/** The run of a programme that's still going, if any. */
export const openRun = (p: Programme): ProgrammeRun | undefined => {
  const r = p.runs[p.runs.length - 1]
  return r && !r.end ? r : undefined
}

/** The programme you're on: the one still running (the latest to start, should two copies merged together both be). */
export function currentProgramme(programmes: Programme[]): Programme | undefined {
  let pick: { p: Programme; start: string } | undefined
  for (const p of programmes) {
    const r = openRun(p)
    if (r && (!pick || r.start > pick.start)) pick = { p, start: r.start }
  }
  return pick?.p
}

/** Which week of a run a day falls in, from 1: weeks run Monday to Sunday, the first being the one it started in. */
export const weekOfRun = (run: ProgrammeRun, now: Date) => differenceInCalendarWeeks(now, parseISO(run.start), { weekStartsOn: 1 }) + 1

/** A programme's workouts in its order, as they are now: one deleted since is left out. */
export const routinesOf = (p: Programme, routines: Routine[]) => p.routineIds.flatMap((id) => routines.find((r) => r.id === id) ?? [])

/**
 * Sessions of a programme's workouts in each week of a run, from its first to the week `now` is in (or the run's last,
 * once it's ended). A session counts by the workout it came from, or its name.
 */
export function sessionsByWeek(p: Programme, run: ProgrammeRun, routines: Routine[], workouts: Workout[], now: Date): number[] {
  const mine = routinesOf(p, routines)
  const out = Array.from({ length: Math.max(1, weekOfRun(run, run.end ? parseISO(run.end) : now)) }, () => 0)
  for (const w of workouts) {
    const day = isoDay(parseISO(w.start))
    if (!w.end || day < run.start || (run.end && day > run.end) || !mine.some((r) => w.routineId === r.id || same(w.name, r.name))) continue
    const k = weekOfRun(run, parseISO(w.start)) - 1
    if (k < out.length) out[k]++
  }
  return out
}

/** Sessions of a programme's workouts done this week (Monday to Sunday) since its run started. */
export function doneThisWeek(p: Programme, routines: Routine[], workouts: Workout[], now: Date): number {
  const run = openRun(p)
  return run ? (sessionsByWeek(p, run, routines, workouts, now)[weekOfRun(run, now) - 1] ?? 0) : 0
}

/**
 * The workout that's waited longest: one you haven't done yet first (in their order), then the one done longest ago.
 * With a programme, only its workouts, as long as it has one with something in it. Workouts newest first.
 */
export function nextRoutine(routines: Routine[], workouts: Workout[], programme?: Programme): Routine | undefined {
  const own = programme ? routinesOf(programme, routines).filter((r) => r.items.length) : []
  let pick: { r: Routine; t: number } | undefined
  for (const r of own.length ? own : routines) {
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
