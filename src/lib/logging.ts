// The logger, as far as it can be worked out without a screen: what each set of a workout in progress shows and
// what ticking it writes down, which exercises share a card, and how lifts on one belt are laid out a round at a
// time. The screen (WorkoutOverlay) draws what comes out of here.

import type { Exercise, SetEntry, WorkoutExercise } from '../data/types'
import {
  bestSets,
  countAt,
  dropFor,
  dropsBySet,
  historyFor,
  loaded,
  mainSets,
  pyramidOf,
  stepDown,
  tidySupersets,
  toggleSuperset,
  weeksOf,
  type ExerciseSession,
  type Target,
} from './lift'

/** A set as the logger shows it: its label, last time's beside it, and what ticking it writes down if it's left as it is. */
export interface Row {
  s: SetEntry
  /** its number among the sets that count, W for a warm-up, D for a drop set */
  label: string
  /** which of the sets that count it is, from 0; none for a warm-up or a drop set */
  k?: number
  previous?: SetEntry
  phKg?: number
  phCount?: number
  /** done, and a new best */
  best?: boolean
}

/** What a lift has behind it: every session, and the one its target builds on (the latest week's best, which a tired second go that week isn't). */
export interface Past {
  history: ExerciseSession[]
  base?: ExerciseSession
}

export function pastOf(ex: Exercise | undefined, workouts: Parameters<typeof historyFor>[1], bodyKg?: number): Past {
  const history = ex ? historyFor(ex.id, workouts) : []
  return { history, base: ex ? weeksOf(ex, history, bodyKg)[0] : undefined }
}

/**
 * An exercise's sets as the logger's rows: each with last time's beside it and what ticking it writes down if you
 * leave it as it is (its target, or for a warm-up what you did last time). `worn(k)` is the weight a lift sharing the
 * belt has on it for round `k`, if it has.
 */
export function logRows(ex: Exercise, we: WorkoutExercise, target: Target, past: Past, bodyKg?: number, worn: (k: number) => number | undefined = () => undefined): Row[] {
  const weighted = loaded(ex)
  const timed = ex.kind === 'duration'
  const prev = past.base
  // last time's sets beside today's; in a reverse pyramid from its top set, the warm-up to it left out
  const prevWork = prev ? (ex.pyramid && weighted ? pyramidOf(ex, prev.sets) : mainSets(prev.sets)) : []
  const prevWarm = prev?.sets.filter((s) => s.kind === 'warmup') ?? []
  const prevDrops = prev ? dropsBySet(prev.sets) : new Map<number, SetEntry[]>()
  const countOf = (x?: SetEntry) => (timed ? x?.secs : x?.reps)
  let nWork = 0
  let nWarm = 0
  let nDrop = 0
  // straight sets: the weight you last put in on a set today carries down the sets after it planned at the same weight,
  // whatever the plan said (so not from the ramp up to the working weight onto it)
  let typed: { plan?: number; kg: number } | undefined
  // the set above, as it stands: a drop set goes down from it, and so does the next set of a pyramid
  let above: { kg?: number; count?: number } = {}
  let main: { kg?: number; count?: number } = {}
  const rows = we.sets.map((s): Row => {
    if (s.kind === 'warmup') {
      const previous = prevWarm[nWarm++]
      return { s, label: 'W', previous, phKg: previous?.kg, phCount: countOf(previous) }
    }
    if (s.kind === 'drop') {
      const k = nWork - 1
      const previous = prevDrops.get(k)?.[nDrop]
      const from = nDrop ? prevDrops.get(k)?.[nDrop - 1]?.kg : prevWork[k]?.kg
      nDrop++
      const t = dropFor(ex, above, previous && { from, kg: previous.kg, reps: countOf(previous) }, bodyKg)
      above = { kg: s.kg ?? t.kg, count: countOf(s) ?? t.count }
      return { s, label: 'D', previous, phKg: t.kg, phCount: t.count }
    }
    const k = nWork++
    nDrop = 0
    const slot = target.perSet[k]
    // what the set was planned at: its own weight and reps, else the target's; weight added to you with none is
    // bodyweight (a set planned at bodyweight isn't the target's weight, nor the set above's)
    const none = ex.kind === 'weighted-bodyweight' ? 0 : undefined
    let kgPlan = (slot ? slot.kg : target.kg) ?? none
    let countPlan = slot?.count ?? target.count
    // down a pyramid a set sits under the one above as it stands: when that isn't what was planned (you loaded more
    // or less than it said), or this set has no plan, it's placed again under it, as the plan would have
    if (ex.pyramid && weighted && k && main.kg !== undefined && (!slot || main.kg !== (target.perSet[k - 1]?.kg ?? none))) {
      const t = stepDown(ex, k, { kg: main.kg || undefined, count: main.count ?? countPlan }, prevWork, target.move === 'back', bodyKg)
      kgPlan = t.kg ?? none
      countPlan = t.count
    }
    // straight sets: the weight you put in above carries down the sets planned at the same weight. And lifts done
    // in turns go round on one belt: the weight the other has on it this round
    const phKg = worn(k) ?? (!ex.pyramid && typed && typed.plan === kgPlan ? typed.kg : kgPlan)
    // the reps go with the weight that's on the set, typed or not: what the plan for it comes to there. A first go
    // has no reps planned at a weight, and a weight half typed in (8 on the way to 80) is nothing to go by, so only
    // one within half the planned load of it moves them
    const on = s.kg ?? phKg
    const body = ex.kind === 'weighted-bodyweight' ? (bodyKg ?? 0) : 0
    const near = on !== undefined && kgPlan !== undefined && on !== kgPlan && Math.abs(on - kgPlan) <= (kgPlan + body) / 2
    const phCount = weighted && target.move !== 'first' && near ? countAt(ex, { kg: kgPlan, count: countPlan }, on, bodyKg) : countPlan
    if (s.kg !== undefined) typed = { plan: kgPlan, kg: s.kg }
    main = above = { kg: s.kg ?? phKg, count: countOf(s) ?? phCount }
    return { s, label: String(k + 1), k, previous: prevWork[k], phKg, phCount }
  })
  // a best as it's ticked: at the heaviest weight the session has, done or still to do, so the ramp up to it and the
  // sets down a pyramid aren't in the running
  const top = Math.max(0, ...rows.filter((r) => r.k !== undefined).map((r) => r.s.kg ?? r.phKg ?? 0))
  const bests = bestSets(
    ex,
    we.sets,
    past.history.flatMap((h) => h.sets),
    top,
  )
  return bests.size ? rows.map((r) => (bests.has(r.s.id) ? { ...r, best: true } : r)) : rows
}

/**
 * What ticking a row writes down: done, with what it was prefilled with wherever nothing was typed. Or what's still
 * missing, when there's nothing to go on: the reps (or seconds), or on a bar the weight.
 */
export function tickOf(ex: Pick<Exercise, 'kind'>, r: Row): { patch: Partial<SetEntry> } | { missing: 'reps' | 'seconds' | 'weight' } {
  const { s } = r
  if (s.done) return { patch: { done: false } }
  const timed = ex.kind === 'duration'
  const patch: Partial<SetEntry> = { done: true }
  if (timed) {
    if (s.secs === undefined) patch.secs = r.phCount
  } else {
    if (s.reps === undefined) patch.reps = r.phCount
    if (loaded(ex) && s.kg === undefined && r.phKg) patch.kg = r.phKg
  }
  if (!(timed ? (patch.secs ?? s.secs) : (patch.reps ?? s.reps))) return { missing: timed ? 'seconds' : 'reps' }
  if (ex.kind === 'weight' && !(patch.kg ?? s.kg)) return { missing: 'weight' }
  return { patch }
}

/**
 * A workout's exercises as the logger's cards, by their place in it: a card each, except lifts that go round on one
 * belt (`beltMates`) and sit next to each other, which are one card.
 */
export function cardsOf(count: number, mates: number[][]): number[][] {
  const cards: number[][] = []
  for (let i = 0; i < count;) {
    let j = i + 1
    while (j < count && mates[i]?.includes(j)) j++
    cards.push(Array.from({ length: j - i }, (_, n) => i + n))
    i = j
  }
  return cards
}

/** One lift on a card of lifts sharing a belt. */
export interface BeltLift {
  ex: Exercise
  we: WorkoutExercise
  target: Target
  past: Past
  /** the weight a lift sharing the belt elsewhere in the workout has put in for a round, if it has */
  worn?: (k: number) => number | undefined
}

export interface Turn {
  /** which lift on the card */
  n: number
  r: Row
}

export interface BeltCard {
  /** each lift's rows, in its own order */
  rows: Row[][]
  /** rounds on the card: the most sets that count any of its lifts has */
  rounds: number
  /** the sets of round `k`, in the card's order: a lift with fewer sets sits the last rounds out */
  turns: (k: number) => Turn[]
  /** round `k` has one box for the belt: its lifts were planned at one weight, and none has been given another */
  shared: (k: number) => boolean
  /** what's on the belt in round `k`, once any lift in it says */
  on: (k: number) => number | undefined
  /** warm-ups, by the round they were done before (`rounds` for after the last), each lift's in its own order */
  warmups: Turn[][]
  /** drop sets, by the round they follow: `k + 1` for round `k`, 0 for one before any round */
  drops: Turn[][]
  /** what the − button takes off: the last warm-up or drop set after the last round, else the last round itself */
  last: { n: number; id: string }[]
}

/**
 * Lifts that go round on one belt, laid out a round at a time. In a round that's shared, the first lift in it leads:
 * the others take what it has on the belt, typed or planned, and their reps follow that weight. A round the plan
 * gives them different weights in, or where they've been given different weights, keeps a weight each. Warm-ups sit
 * before the round they lead into and drop sets after the round they follow.
 */
export function beltCard(lifts: BeltLift[], bodyKg?: number): BeltCard {
  const mains = lifts.map((l) => mainSets(l.we.sets))
  const rounds = Math.max(0, ...mains.map((m) => m.length))
  const planned = (n: number, k: number) => (lifts[n].target.perSet[k] ?? lifts[n].target).kg ?? 0
  const inRound = (k: number) => lifts.map((_, n) => n).filter((n) => mains[n][k])
  const put = (k: number) =>
    inRound(k)
      .map((n) => mains[n][k].kg)
      .filter((x): x is number => x !== undefined)
  const shared = (k: number) => {
    const who = inRound(k)
    return who.length > 1 && who.every((n) => planned(n, k) === planned(who[0], k)) && put(k).every((x) => x === put(k)[0])
  }
  const rows: Row[][] = []
  lifts.forEach((l, n) => {
    const worn = (k: number) => {
      const lead = shared(k) ? rows.slice(0, n).flatMap((list) => list.find((r) => r.k === k) ?? [])[0] : undefined
      return lead ? (lead.s.kg ?? lead.phKg ?? 0) : l.worn?.(k)
    }
    rows.push(logRows(l.ex, l.we, l.target, l.past, bodyKg, worn))
  })
  const warmups: Turn[][] = Array.from({ length: rounds + 1 }, () => [])
  const drops: Turn[][] = Array.from({ length: rounds + 1 }, () => [])
  rows.forEach((list, n) => {
    // the round a lift's next set that counts is
    let next = 0
    for (const r of list) {
      if (r.k !== undefined) next = r.k + 1
      else (r.s.kind === 'drop' ? drops : warmups)[Math.min(next, rounds)].push({ n, r })
    }
  })
  const turns = (k: number) => inRound(k).map((n) => ({ n, r: rows[n].find((x) => x.k === k)! }))
  const tail = [...drops[rounds], ...warmups[rounds]]
  const last = tail.length ? tail.slice(-1).map(({ n, r }) => ({ n, id: r.s.id })) : rounds ? turns(rounds - 1).map(({ n, r }) => ({ n, id: r.s.id })) : []
  return { rows, rounds, turns, shared, on: (k) => put(k)[0], warmups, drops, last }
}

/** A card of `n` exercises starting at `first`, moved up or down as one: the exercise above goes under it, or the one below over it. */
export function moveCard<T extends { superset?: string }>(list: T[], first: number, n: number, d: -1 | 1): T[] {
  const last = first + n - 1
  if (first < 0 || (d < 0 ? first === 0 : last >= list.length - 1)) return list
  const out = [...list]
  if (d < 0) out.splice(last, 0, ...out.splice(first - 1, 1))
  else out.splice(first, 0, ...out.splice(last + 1, 1))
  return tidySupersets(out)
}

/** A card of `n` exercises starting at `first`, apart again: a card each, no longer done in turns with each other. */
export function splitCard<T extends { superset?: string }>(list: T[], first: number, n: number, newKey: () => string): T[] {
  let out = list
  // from the last link back, so each split leaves the ones above it joined until their turn
  for (let i = first + n - 2; i >= first && first >= 0; i--) if (out[i].superset && out[i].superset === out[i + 1]?.superset) out = toggleSuperset(out, i, newKey)
  return out
}
