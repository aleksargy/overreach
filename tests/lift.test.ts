import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BUILTIN_EXERCISES } from '../src/data/exercises'
import type { Exercise, Routine, SetEntry, Workout } from '../src/data/types'
import { focusOf, historyFor, nextRoutine, progressOf, recordsIn, setsLine, targetFor, targetText } from '../src/lib/lift'

const byId = new Map(BUILTIN_EXERCISES.map((e) => [e.id, e]))
const bench = byId.get('bench-press')! // 6–10 reps, 2.5 kg steps
const pullUp = byId.get('pull-up')! // bodyweight plus added kg, 5–10 reps
const plank = byId.get('plank')! // 45–90 s

let n = 0
const set = (kg: number | undefined, count: number, kind: SetEntry['kind'] = 'working', timed = false): SetEntry => ({
  id: `s${n++}`,
  kind,
  kg,
  ...(timed ? { secs: count } : { reps: count }),
  done: true,
})
/** a finished session of one exercise, `daysAgo` days before 1 November */
const session = (ex: Exercise, daysAgo: number, sets: SetEntry[], name = 'Push', routineId?: string): Workout => {
  const start = new Date(Date.parse('2026-11-01T18:00:00Z') - daysAgo * 86_400_000)
  return {
    id: `w${n++}`,
    name,
    routineId,
    start: start.toISOString(),
    end: new Date(start.getTime() + 3_600_000).toISOString(),
    exercises: [{ id: `we${n++}`, exerciseId: ex.id, sets }],
    source: 'manual',
  }
}
const next = (ex: Exercise, ...sessions: Workout[]) => targetFor(ex, historyFor(ex.id, sessions))

test('the first time there’s only the rep range to go for', () => {
  const t = next(bench)
  assert.equal(t.move, 'first')
  assert.equal(targetText(bench, t), '6–10 reps')
})

test('short of the top of the range, the weight stays and the target is one more rep', () => {
  const t = next(bench, session(bench, 3, [set(60, 9), set(60, 8), set(60, 8)]))
  assert.deepEqual([t.move, t.kg, t.count, t.note], ['more', 60, 9, '+1 rep'])
  assert.equal(targetText(bench, t), '60 kg × 9')
  // warm-ups don't count towards it
  const warmed = next(bench, session(bench, 3, [set(30, 5, 'warmup'), set(60, 8), set(60, 8)]))
  assert.deepEqual([warmed.kg, warmed.count], [60, 9])
})

test('the top of the range on every set earns more weight, back at the bottom of the range', () => {
  const t = next(bench, session(bench, 3, [set(60, 10), set(60, 10), set(60, 10)]))
  assert.deepEqual([t.move, t.kg, t.count, t.note], ['up', 62.5, 6, '+2.5 kg'])
  // one set short isn't every set
  assert.equal(next(bench, session(bench, 3, [set(60, 10), set(60, 10), set(60, 9)])).move, 'more')
})

test('under the range twice running at the same weight takes a tenth off', () => {
  const stuck = [session(bench, 3, [set(70, 5), set(70, 4)]), session(bench, 10, [set(70, 5), set(70, 5)])]
  const t = next(bench, ...stuck)
  // 63 rounds to the nearest 2.5; the target is the middle of the range
  assert.deepEqual([t.move, t.kg, t.count, t.note], ['back', 62.5, 8, '−7.5 kg'])
  // once isn't twice: the first miss at a new weight just aims for the bottom of the range
  const once = next(bench, stuck[0], session(bench, 10, [set(67.5, 10), set(67.5, 10)]))
  assert.deepEqual([once.move, once.kg, once.count, once.note], ['more', 70, 6, '+2 reps'])
})

test('bodyweight work adds reps, holds add seconds, and added weight is written as added', () => {
  const up = next(pullUp, session(pullUp, 2, [set(5, 10), set(5, 10), set(5, 10)]))
  assert.equal(targetText(pullUp, up), '+7.5 kg × 5')
  // no weight added yet: the first step is to add some
  const first = next(pullUp, session(pullUp, 2, [set(undefined, 10), set(undefined, 10)]))
  assert.equal(targetText(pullUp, first), '+2.5 kg × 5')
  const hold = next(plank, session(plank, 2, [set(undefined, 60, 'working', true), set(undefined, 50, 'working', true)]))
  assert.deepEqual([hold.move, hold.count, hold.note], ['more', 55, '+5 s'])
  assert.equal(targetText(plank, hold), '55 s')
})

test('a session’s sets read on one line', () => {
  assert.equal(setsLine(bench, [set(30, 5, 'warmup'), set(60, 8), set(60, 8), set(60, 7)]), '60 × 8, 8, 7')
  assert.equal(setsLine(bench, [set(60, 8), set(62.5, 6)]), '60 × 8, 62.5 × 6')
  assert.equal(setsLine(pullUp, [set(7.5, 6), set(7.5, 5)]), '+7.5 × 6, 5')
  assert.equal(setsLine(plank, [set(undefined, 60, 'working', true), set(undefined, 45, 'working', true)]), '60, 45 s')
})

test('a session’s bests: the heaviest yet, or more reps than ever at that weight', () => {
  const before = [session(bench, 14, [set(60, 8), set(60, 8)]), session(bench, 7, [set(62.5, 6), set(62.5, 6)])]
  const heavier = session(bench, 0, [set(65, 6), set(65, 5)])
  assert.deepEqual(recordsIn(heavier, [...before, heavier], byId), [{ exerciseId: 'bench-press', value: '65 kg', text: 'Heaviest yet' }])
  const moreReps = session(bench, 0, [set(62.5, 8), set(62.5, 7)])
  assert.deepEqual(recordsIn(moreReps, [...before, moreReps], byId), [{ exerciseId: 'bench-press', value: '62.5 × 8', text: 'Most reps at 62.5 kg' }])
  // the same again is no best, and nor is the first time you log a lift
  const same = session(bench, 0, [set(62.5, 6)])
  assert.deepEqual(recordsIn(same, [...before, same], byId), [])
  assert.deepEqual(recordsIn(before[0], [before[0]], byId), [])
})

test('progress is the most you moved each session, over the weeks asked for', () => {
  const now = new Date('2026-11-01T20:00:00Z')
  const sessions = [
    session(bench, 70, [set(55, 8)]),
    session(bench, 40, [set(57.5, 8)]),
    session(bench, 20, [set(60, 8)]),
    session(bench, 2, [set(62.5, 7)]),
    session(pullUp, 2, [set(5, 8)]),
  ]
  const [p, ...rest] = progressOf(sessions, byId, now)
  // pull-ups were only done once in the eight weeks, so they don't show yet
  assert.equal(rest.length, 0)
  assert.deepEqual([p.ex.id, p.now, p.change, p.sessions], ['bench-press', 62.5, 5, 3])
  // the line still starts from the session before the window
  assert.deepEqual(
    p.points.map((x) => x.v),
    [55, 57.5, 60, 62.5],
  )
})

test('next up is the workout that has waited longest, and one never done comes first', () => {
  const r = (id: string, name: string): Routine => ({ id, name, focus: '', items: [{ exerciseId: 'bench-press', sets: 3 }] })
  const routines = [r('a', 'Push'), r('b', 'Pull'), r('c', 'Legs')]
  // newest first, the way the app keeps them
  const done = [session(bench, 1, [set(60, 8)], 'Pull', 'b'), session(bench, 3, [set(60, 8)], 'Push', 'a')]
  assert.equal(nextRoutine(routines, done)?.id, 'c')
  // a session started again from history has no workout id to go by: the name does
  assert.equal(nextRoutine(routines, [session(bench, 2, [set(60, 8)], 'legs'), ...done])?.id, 'a')
  // an empty workout can't be next
  assert.equal(nextRoutine([{ id: 'x', name: 'Blank', focus: '', items: [] }], []), undefined)
})

test('a workout’s focus is its biggest muscle groups', () => {
  const pushDay: Routine = {
    id: 'p',
    name: 'Push',
    focus: '',
    items: [
      { exerciseId: 'bench-press', sets: 4 },
      { exerciseId: 'overhead-press', sets: 3 },
      { exerciseId: 'lateral-raise', sets: 3 },
      { exerciseId: 'triceps-pushdown', sets: 3 },
    ],
  }
  assert.equal(focusOf(pushDay, byId), 'Shoulders, chest, triceps')
})
