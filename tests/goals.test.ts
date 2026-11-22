import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BUILTIN_EXERCISES } from '../src/data/exercises'
import type { Exercise, Programme, Routine, SetEntry, Workout } from '../src/data/types'
import { goalDay, goalProgress, isStretch, liftsOf, mainLiftsOf, nudge, rateOf, suggestGoal, weeklyBests } from '../src/lib/goals'
import { historyFor } from '../src/lib/lift'

const byId = new Map(BUILTIN_EXERCISES.map((e) => [e.id, e]))
const squat = byId.get('back-squat')! // 5–8 reps, 2.5 kg steps
const pullUp = byId.get('pull-up')! // weight added to you

let n = 0
const set = (kg: number, reps: number, kind: SetEntry['kind'] = 'working'): SetEntry => ({ id: `s${n++}`, kind, kg, reps, done: true })
/** a session of one lift on a day (yyyy-MM-dd, Mondays mostly) */
const on = (ex: Exercise, day: string, sets: SetEntry[]): Workout => ({
  id: `w${n++}`,
  name: 'Lower',
  start: `${day}T18:00:00Z`,
  end: `${day}T19:00:00Z`,
  exercises: [{ id: `we${n++}`, exerciseId: ex.id, sets }],
  source: 'manual',
})
const historyOf = (ex: Exercise, ...ws: Workout[]) => historyFor(ex.id, ws)
const mondays = (from: string, count: number) => Array.from({ length: count }, (_, i) => new Date(Date.parse(`${from}T12:00:00Z`) + i * 7 * 86_400_000).toISOString().slice(0, 10))
const now = new Date(2026, 10, 22, 12) // Sunday 22 November
const by = '2027-01-31' // ten weeks on

test('with little to go on, a goal is half a percent a week on from the best set, at its reps, on weights you can load', () => {
  const history = historyOf(squat, on(squat, '2026-11-16', [set(60, 8, 'warmup'), set(80, 6), set(80, 6), set(80, 5)]))
  const g = suggestGoal(squat, history, { now, by })!
  // 80 × 6 says 96 kg once; ten weeks, the last two counting half, at half a percent: about 100.4, so 82.5 × 6
  assert.deepEqual([g.kg, g.reps, g.from, g.set, g.by], [82.5, 6, { kg: 80, reps: 6 }, '2026-11-22', by])
  assert.equal(isStretch(g, squat, history), false)
  // three steps up needs over a percent a week: a stretch; it never goes down to where it stood
  const pushed = nudge(nudge(nudge(g, squat, 1), squat, 1), squat, 1)
  assert.deepEqual([pushed.kg, isStretch(pushed, squat, history)], [90, true])
  assert.equal(nudge(g, squat, -1).kg, 82.5)
  // nothing to load, or never done: nothing to suggest
  assert.equal(suggestGoal(byId.get('plank')!, [], { now, by }), undefined)
  assert.equal(suggestGoal(squat, [], { now, by }), undefined)
})

test('with weeks of history, a goal goes at the rate the lift has been going, kept to between a quarter and one and a half percent', () => {
  // eight weeks up a percent a week, from 75 × 6
  const steady = mondays('2026-09-28', 8).map((d, i) => on(squat, d, [set(Math.round(75 * 1.01 ** i * 100) / 100, 6)]))
  const history = historyOf(squat, ...steady)
  assert.equal(weeklyBests(squat, history).length, 8)
  assert.ok(Math.abs(rateOf(weeklyBests(squat, history), now)! - 0.01) < 0.0005)
  // from 80.4 × 6 (96.5 once): nine weeks' worth at a percent is about 105.5, so 87.5 × 6
  assert.deepEqual([suggestGoal(squat, history, { now, by })!.kg], [87.5])
  // three percent a week is kept to one and a half; and for someone going that fast, two percent isn't a stretch
  const fast = historyOf(squat, ...mondays('2026-09-28', 8).map((d, i) => on(squat, d, [set(Math.round(60 * 1.03 ** i * 100) / 100, 6)])))
  const g = suggestGoal(squat, fast, { now, by })!
  // from 73.8 × 6 (88.6 once) at one and a half percent: about 101.3, so 82.5 × 6
  assert.equal(g.kg, 82.5)
  assert.equal(isStretch({ ...g, kg: 87.5 }, squat, fast), false)
  // fewer than four weeks of it: back to half a percent
  assert.equal(rateOf(weeklyBests(squat, historyOf(squat, ...steady.slice(-3))), now), undefined)
})

test('weight added to you counts with your body weight', () => {
  const history = historyOf(pullUp, on(pullUp, '2026-11-16', [set(10, 6), set(10, 6)]))
  // 80 kg of you plus 10 × 6 says 108 once; at half a percent, about 113: plus 14 for 6, so 12.5 on 2.5 kg steps
  const g = suggestGoal(pullUp, history, { now, by, bodyKg: 80 })!
  assert.deepEqual([g.kg, g.reps], [12.5, 6])
})

test('how a goal is going: your best set since it was set, done once you lift it, and on pace or behind after three weeks', () => {
  const run = { start: '2026-11-16' }
  const goal = { exerciseId: squat.id, kg: 82.5, reps: 6, from: { kg: 80, reps: 6 }, set: '2026-11-22', by }
  const before = on(squat, '2026-11-16', [set(80, 6), set(80, 6)])
  // not done since it was set: where it stood
  assert.deepEqual(goalProgress(goal, squat, historyOf(squat, before), run, now), { now: { kg: 80, reps: 6 }, share: 0, done: false, pace: undefined })
  // 82.5 × 5 is a little way there; 82.5 × 6 is it
  const closer = goalProgress(goal, squat, historyOf(squat, before, on(squat, '2026-11-23', [set(82.5, 5)])), run, now)
  assert.deepEqual([closer.now, Math.round(closer.share * 100), closer.done], [{ kg: 82.5, reps: 5 }, 8, false])
  assert.equal(goalProgress(goal, squat, historyOf(squat, before, on(squat, '2026-11-30', [set(82.5, 6)])), run, now).done, true)
  // three weeks at 80 × 6: behind; 80 × 7, × 8 heading past it: on pace (and the bar full, though 82.5 isn't lifted yet)
  const three = new Date(2026, 11, 14, 12)
  const flat = ['2026-11-23', '2026-11-30', '2026-12-07'].map((d) => on(squat, d, [set(80, 6)]))
  assert.equal(goalProgress(goal, squat, historyOf(squat, before, ...flat), run, three).pace, 'behind')
  const rising = [6, 7, 8].map((r, i) => on(squat, ['2026-11-23', '2026-11-30', '2026-12-07'][i], [set(80, r)]))
  const going = goalProgress(goal, squat, historyOf(squat, before, ...rising), run, three)
  assert.deepEqual([going.pace, going.share, going.done], ['on', 1, false])
  // and not before three weeks have gone by
  assert.equal(goalProgress(goal, squat, historyOf(squat, before, ...rising), run, new Date(2026, 11, 7, 20)).pace, undefined)
})

test('goals go on a programme’s lifts with weight on them; each workout’s first is suggested; they’re aimed at its last day', () => {
  const r = (id: string, items: string[]): Routine => ({ id, name: id, focus: '', items: items.map((exerciseId) => ({ exerciseId, sets: 3 })) })
  const routines = [r('a', ['plank', 'back-squat', 'leg-curl']), r('b', ['bench-press', 'back-squat', 'pull-up'])]
  const p: Programme = { id: 'p', name: 'Full body', routineIds: ['a', 'b'], perWeek: 3, weeks: 10, runs: [{ start: '2026-11-18' }] }
  assert.deepEqual(
    liftsOf(p, routines, byId).map((e) => e.id),
    ['back-squat', 'leg-curl', 'bench-press', 'pull-up'],
  )
  assert.deepEqual(
    mainLiftsOf(p, routines, byId).map((e) => e.id),
    ['back-squat', 'bench-press'],
  )
  // started on a Wednesday: its tenth week ends on Sunday 24 January; with no end, ten weeks on from today
  assert.equal(goalDay(p, p.runs[0], now), '2027-01-24')
  assert.equal(goalDay({ ...p, weeks: undefined }, p.runs[0], now), by)
})
