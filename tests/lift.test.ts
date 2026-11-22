import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BUILTIN_EXERCISES } from '../src/data/exercises'
import type { Exercise, Programme, Routine, SetEntry, Workout } from '../src/data/types'
import {
  currentProgramme,
  doneThisWeek,
  dropFor,
  dropsBySet,
  focusOf,
  historyFor,
  liftSummary,
  nextRoutine,
  openRun,
  sessionsByWeek,
  progressOf,
  recordsIn,
  setsLine,
  supersetTags,
  targetFor,
  targetText,
  toggleSuperset,
  type Target,
  type TargetOptions,
  weekOfRun,
} from '../src/lib/lift'

const byId = new Map(BUILTIN_EXERCISES.map((e) => [e.id, e]))
const bench = byId.get('bench-press')! // 6–10 reps, 2.5 kg steps
const rdl = byId.get('romanian-deadlift')! // 6–10 reps, 2.5 kg steps
const squat = byId.get('back-squat')! // 5–8 reps, 2.5 kg steps
const legCurl: Exercise = { ...byId.get('leg-curl')!, repRange: [8, 12] } // 5 kg steps, on the range Alex uses
const dbPress = byId.get('incline-db-press')! // 8–12 reps, 2 kg steps
const pullUp = byId.get('pull-up')! // bodyweight plus added kg, 5–10 reps
const pushUp = byId.get('push-up')! // 10–25 reps
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
const nextWith = (ex: Exercise, o: TargetOptions, ...sessions: Workout[]) => targetFor(ex, historyFor(ex.id, sessions), o)
const three = (kg: number | undefined, reps: number) => [set(kg, reps), set(kg, reps), set(kg, reps)]
const counts = (t: Target) => t.perSet.map((x) => x.count)

test('the first time there’s only the rep range to go for', () => {
  const t = next(bench)
  assert.equal(t.move, 'first')
  assert.equal(targetText(bench, t), '6–10 reps')
})

test('short of the top of the range, the weight stays and the weakest set aims for one more rep', () => {
  const t = next(bench, session(bench, 3, [set(60, 9), set(60, 8), set(60, 8)]))
  assert.deepEqual([t.move, t.kg, t.count, t.note], ['more', 60, 9, '+1 rep'])
  assert.equal(targetText(bench, t), '60 kg × 9')
  // warm-ups don't count towards it
  const warmed = next(bench, session(bench, 3, [set(30, 5, 'warmup'), set(60, 8), set(60, 8)]))
  assert.deepEqual([warmed.kg, warmed.count], [60, 9])
  // each set aims for at least that, and no fewer than it did last time
  const fading = next(bench, session(bench, 3, [set(60, 10), set(60, 9), set(60, 7)]))
  assert.deepEqual([fading.count, counts(fading)], [8, [10, 9, 8]])
})

test('the top of the range on every set earns more weight, back at the bottom of the range', () => {
  const t = next(bench, session(bench, 3, three(60, 10)))
  assert.deepEqual([t.move, t.kg, t.count, t.note], ['up', 62.5, 6, '+2.5 kg'])
  // one set short isn't every set
  assert.equal(next(bench, session(bench, 3, [set(60, 10), set(60, 10), set(60, 9)])).move, 'more')
  // nor is a set done lighter: it aims for the working weight, at what it says you'd get there plus one
  const dropped = next(bench, session(bench, 3, [set(60, 10), set(60, 10), set(55, 10)]))
  assert.deepEqual([dropped.move, dropped.kg, dropped.count, counts(dropped)], ['more', 60, 7, [10, 10, 7]])
})

test('the sets you ramp up through keep their weight and reps, and the rules run on the sets at the working weight', () => {
  // 40 × 10 and 60 × 10 on the way to 80 × 9 aren't sets failed at 80
  const t = next(rdl, session(rdl, 3, [set(40, 10), set(60, 10), set(80, 9)]))
  assert.deepEqual([t.move, t.kg, t.count, t.note], ['more', 80, 10, '+1 rep'])
  assert.deepEqual(t.perSet, [
    { kg: 40, count: 10 },
    { kg: 60, count: 10 },
    { kg: 80, count: 10 },
  ])
  const sq = next(squat, session(squat, 3, [set(60, 9), set(80, 5), set(80, 5)]))
  assert.deepEqual([sq.move, sq.kg, sq.count, counts(sq)], ['more', 80, 6, [9, 6, 6]])
  // the top of the range at the working weight goes up, the ramp counting among the workout's sets
  const up = nextWith(rdl, { sets: 3 }, session(rdl, 3, [set(40, 10), set(60, 10), set(80, 10)]))
  assert.deepEqual([up.move, up.kg, up.count, up.note], ['up', 82.5, 6, '+2.5 kg'])
  assert.deepEqual(up.perSet, [
    { kg: 40, count: 10 },
    { kg: 60, count: 10 },
    { kg: 82.5, count: 6 },
  ])
  // a ramp set the working weight comes down to comes down with it
  const back = next(bench, session(bench, 3, [set(65, 3), set(70, 5), set(70, 4)]), session(bench, 10, [set(65, 3), set(70, 5), set(70, 5)]))
  assert.deepEqual([back.move, back.kg, back.perSet[0]], ['back', 62.5, { kg: 57.5, count: 3 }])
})

test('the weight waits until the workout’s sets are all done at the top', () => {
  const two = session(bench, 3, [set(60, 10), set(60, 10)])
  const t = nextWith(bench, { sets: 3 }, two)
  assert.deepEqual([t.move, t.kg, t.count, t.note], ['more', 60, 10, '+1 set'])
  assert.equal(nextWith(bench, { sets: 2 }, two).move, 'up')
})

test('a step too big for the bottom of the range waits for more reps, until it’s in reach or the reps stop coming', () => {
  // 10 kg dumbbells × 12 says about 5 reps at 12 kg, short of 8
  const t = next(dbPress, session(dbPress, 3, three(10, 12)))
  assert.deepEqual([t.move, t.kg, t.count, t.note], ['more', 10, 13, '+1 rep'])
  assert.equal(next(dbPress, session(dbPress, 3, three(10, 15))).count, 16)
  // × 16 says 8 at 12 kg
  const up = next(dbPress, session(dbPress, 3, three(10, 16)))
  assert.deepEqual([up.move, up.kg, up.count, up.note], ['up', 12, 8, '+2 kg'])
  // three sessions at 13 and no further: the step goes ahead anyway
  const stuck = next(dbPress, session(dbPress, 3, three(10, 13)), session(dbPress, 10, three(10, 13)), session(dbPress, 17, three(10, 13)))
  assert.deepEqual([stuck.move, stuck.kg], ['up', 12])
})

test('every set at the working weight far over or under the range sets it again from the weakest, aiming mid-range', () => {
  // 40 × 15 says about 47 kg for 8 reps: 45 on 2.5 kg steps, not one step at a time
  const light = next(bench, session(bench, 3, three(40, 15)))
  assert.deepEqual([light.move, light.kg, light.count, light.note], ['up', 45, 8, '+5 kg'])
  // 60 × 3 says about 52 kg for 8
  const heavy = next(bench, session(bench, 3, [set(60, 3), set(60, 3)]))
  assert.deepEqual([heavy.move, heavy.kg, heavy.count, heavy.note], ['back', 50, 8, '−10 kg'])
  // one set falling away is the day, not the weight: another go at it, for the bottom of the range
  const fell = next(legCurl, session(legCurl, 3, [set(50, 11), set(55, 8), set(55, 5)]))
  assert.deepEqual([fell.move, fell.kg, fell.count, counts(fell)], ['more', 55, 8, [11, 8, 8]])
  // and a set done lighter is no set failed at the working weight
  const lighter = next(bench, session(bench, 3, [set(60, 10), set(60, 10), set(50, 10)]))
  assert.deepEqual([lighter.move, lighter.kg], ['more', 60])
})

test('a lift done twice in a week moves on from the better session, and backing off counts weeks', () => {
  // 1 November is a Sunday: 6 days before is that week's Monday, 3 its Thursday, 10 the Thursday before
  const monday = (sets: SetEntry[]) => session(bench, 6, sets)
  const thursday = (sets: SetEntry[]) => session(bench, 3, sets)
  // a tired Thursday doesn't pull the target down: it goes on from Monday
  const tired = next(bench, thursday([set(60, 8), set(60, 7), set(60, 7)]), monday([set(60, 9), set(60, 9), set(60, 8)]))
  assert.deepEqual([tired.move, tired.kg, tired.count, counts(tired)], ['more', 60, 9, [9, 9, 9]])
  // under the range on Monday and Thursday is one week under, not two: another go before a tenth comes off
  const once = next(bench, thursday([set(70, 5), set(70, 4)]), monday([set(70, 5), set(70, 5)]))
  assert.deepEqual([once.move, once.kg, once.count], ['more', 70, 6])
  // a heavier go that made the range is the one to build on
  const moved = next(bench, thursday([set(62.5, 7), set(62.5, 6), set(62.5, 6)]), monday(three(60, 10)))
  assert.deepEqual([moved.move, moved.kg, moved.count], ['more', 62.5, 7])
  // one that fell short of it isn't: Monday's earned the step, so it's still there to take
  const short = next(bench, thursday([set(62.5, 4), set(62.5, 4), set(62.5, 3)]), monday(three(60, 10)))
  assert.deepEqual([short.move, short.kg, short.count, short.note], ['up', 62.5, 6, '+2.5 kg'])
})

test('a programme: Next up only from its workouts, its weeks Monday to Sunday, and its sessions this week', () => {
  const r = (id: string, name: string): Routine => ({ id, name, focus: '', items: [{ exerciseId: bench.id, sets: 3 }] })
  const routines = [r('a', 'Upper A'), r('b', 'Lower'), r('fa', 'Full body A'), r('fb', 'Full body B')]
  const split: Programme = { id: 'p0', name: 'Upper/lower', routineIds: ['a', 'b'], perWeek: 4, runs: [{ start: '2026-08-03', end: '2026-10-19' }] }
  // started Monday 19 October, so Sunday 1 November ends its second week
  const full: Programme = { id: 'p1', name: 'Full body', routineIds: ['fa', 'fb'], perWeek: 3, weeks: 10, runs: [{ start: '2026-10-19' }] }
  assert.equal(currentProgramme([split, full])?.id, 'p1')
  assert.equal(openRun(split), undefined)
  const sunday = new Date(2026, 10, 1, 12)
  assert.deepEqual([weekOfRun(full.runs[0], sunday), weekOfRun(full.runs[0], new Date(2026, 9, 25, 12)), weekOfRun(full.runs[0], new Date(2026, 9, 26, 12))], [2, 1, 2])
  const done = [session(bench, 3, three(60, 8), 'Full body A', 'fa'), session(bench, 10, three(60, 8), 'Full body B', 'fb')]
  // the one that's waited longest, from the programme only; with none, from all your workouts
  assert.equal(nextRoutine(routines, done, full)?.id, 'fb')
  assert.equal(nextRoutine(routines, done)?.id, 'a')
  // this week is Thursday's Full body A; the week before doesn't count
  assert.equal(doneThisWeek(full, routines, done, sunday), 1)
  // week by week through the run: one each, and the Upper A done before it started isn't in it
  assert.deepEqual(sessionsByWeek(full, full.runs[0], routines, [...done, session(bench, 17, three(60, 8), 'Upper A', 'a')], sunday), [1, 1])
  // a programme whose workouts are all empty leaves Next up to the rest
  assert.equal(nextRoutine([...routines.slice(0, 2), { ...routines[2], items: [] }, { ...routines[3], items: [] }], done, full)?.id, 'a')
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

test('no reps gained in two sessions at the same weight takes a tenth off', () => {
  const flat = [session(bench, 2, [set(60, 8), set(60, 8), set(60, 7)]), session(bench, 9, [set(60, 8), set(60, 7), set(60, 7)])]
  const t = next(bench, ...flat, session(bench, 16, [set(60, 8), set(60, 8), set(60, 7)]))
  assert.deepEqual([t.move, t.kg, t.count, t.note], ['back', 55, 8, '−5 kg'])
  // a rep gained in that time is still moving
  assert.equal(next(bench, ...flat, session(bench, 16, [set(60, 8), set(60, 7), set(60, 6)])).move, 'more')
  // so are reps gained on the other sets while the weakest one holds
  const holding = [
    session(bench, 2, [set(72.5, 7), set(72.5, 7), set(72.5, 7), set(72.5, 6)]),
    session(
      bench,
      9,
      Array.from({ length: 4 }, () => set(72.5, 6)),
    ),
  ]
  const moving = next(
    bench,
    ...holding,
    session(
      bench,
      16,
      Array.from({ length: 4 }, () => set(72.5, 6)),
    ),
  )
  assert.deepEqual([moving.move, moving.count, counts(moving)], ['more', 7, [7, 7, 7, 7]])
  // and one bad day after a good one isn't stuck
  const dip = [session(bench, 2, [set(60, 8), set(60, 7)]), session(bench, 9, [set(60, 8), set(60, 8)]), session(bench, 16, [set(60, 8), set(60, 7)])]
  assert.deepEqual([next(bench, ...dip).move, next(bench, ...dip).count], ['more', 8])
})

test('a long break takes a tenth off: four weeks, or three times the usual gap', () => {
  const now = new Date('2026-11-01T20:00:00Z')
  const climbing = (days: number[]) => [session(bench, days[0], three(60, 9)), session(bench, days[1], three(60, 8)), session(bench, days[2], three(60, 7))]
  // weekly, then 30 days off
  const weekly = nextWith(bench, { now }, ...climbing([30, 37, 44]))
  assert.deepEqual([weekly.move, weekly.kg, weekly.count], ['back', 55, 8])
  // every fortnight, 30 days is only twice the usual gap
  const fortnightly = nextWith(bench, { now }, ...climbing([30, 44, 58]))
  assert.deepEqual([fortnightly.move, fortnightly.kg, fortnightly.count], ['more', 60, 10])
})

test('weight added to you counts with your body weight', () => {
  const under = [session(pullUp, 3, [set(20, 4), set(20, 4)]), session(pullUp, 10, [set(20, 4), set(20, 4)])]
  // a tenth of 80 kg plus 20 is 10 kg off
  const t = nextWith(pullUp, { bodyKg: 80 }, ...under)
  assert.deepEqual([t.move, targetText(pullUp, t), t.note], ['back', '+10 kg × 8', '−10 kg'])
  // without a weigh-in it can only go by what's added
  assert.equal(targetText(pullUp, next(pullUp, ...under)), '+17.5 kg × 8')
})

test('bodyweight work adds reps, holds add seconds, and added weight is written as added', () => {
  const up = next(pullUp, session(pullUp, 2, three(5, 10)))
  assert.equal(targetText(pullUp, up), '+7.5 kg × 5')
  // no weight added yet: the first step is to add some
  const first = next(pullUp, session(pullUp, 2, [set(undefined, 10), set(undefined, 10)]))
  assert.equal(targetText(pullUp, first), '+2.5 kg × 5')
  const reps = next(pushUp, session(pushUp, 2, [set(undefined, 15), set(undefined, 12), set(undefined, 10)]))
  assert.deepEqual([reps.count, counts(reps), reps.note], [11, [15, 12, 11], '+1 rep'])
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

test('a weighted lift logged without a weight still gets one to go for', () => {
  const t = next(bench, session(bench, 3, three(undefined, 10)))
  assert.deepEqual([t.move, t.kg], ['up', 2.5])
})

test('a reverse pyramid moves set by set, each two reps higher than the one before', () => {
  const rpt: Exercise = { ...bench, pyramid: true } // top set 6–10, then 8–12, then 10–14
  const t = next(rpt, session(rpt, 3, [set(80, 6), set(72.5, 8), set(65, 9)]))
  assert.deepEqual([t.move, t.kg, t.count, t.note], ['more', 80, 7, '+1 rep'])
  assert.deepEqual(t.perSet, [
    { kg: 80, count: 7 },
    { kg: 72.5, count: 9 },
    { kg: 65, count: 10 },
  ])
  assert.equal(targetText(rpt, t), '80 kg × 7')
  // the top set at the top of its range goes up on its own; the others carry on
  const up = next(rpt, session(rpt, 3, [set(80, 10), set(72.5, 10), set(65, 12)]))
  assert.deepEqual(up.perSet, [
    { kg: 82.5, count: 6 },
    { kg: 72.5, count: 11 },
    { kg: 65, count: 13 },
  ])
  assert.equal(up.note, '+2.5 kg')
  // a set the workout has but the last session didn't starts a tenth lighter than the one above
  const more = nextWith(rpt, { sets: 3 }, session(rpt, 3, [set(80, 7), set(72.5, 9)]))
  assert.deepEqual(more.perSet[2], { kg: 65, count: 10 })
})

test('a drop set is logged and counted as work, but never moves a target or sets a best', () => {
  const drop = (kg: number, reps: number) => set(kg, reps, 'drop')
  const squats = session(bench, 3, [...three(60, 10), drop(45, 12)])
  assert.deepEqual([next(bench, squats).move, next(bench, squats).kg], ['up', 62.5])
  assert.equal(setsLine(bench, squats.exercises[0].sets), '60 × 10, 10, 10 + 45 × 12')
  assert.deepEqual(liftSummary(squats), { exercises: 1, sets: 3, volumeKg: 2340 })
  const before = session(bench, 10, [set(60, 8)])
  const now = session(bench, 0, [set(60, 8), drop(45, 20)])
  assert.deepEqual(recordsIn(now, [before, now], byId), [])
  // where each drop came: after the first main set, and twice after the second
  const order = [set(30, 8, 'warmup'), set(60, 8), drop(45, 8), set(60, 7), drop(45, 6), drop(30, 6)]
  assert.deepEqual(
    [...dropsBySet(order)].map(([k, d]) => [k, d.map((x) => x.kg)]),
    [
      [0, [45]],
      [1, [45, 30]],
    ],
  )
  // a drop starts a fifth down, or as far down as last time's
  assert.deepEqual(dropFor(bench, { kg: 100, count: 6 }), { kg: 80, count: 6 })
  assert.deepEqual(dropFor(bench, { kg: 105, count: 6 }, { from: 100, kg: 70, reps: 8 }), { kg: 72.5, count: 8 })
})

test('supersets: exercises linked next to each other are done in turns, A1 and A2', () => {
  const k = (superset?: string) => ({ superset })
  assert.deepEqual(supersetTags([k('a'), k('a'), k(), k('b'), k('b'), k('b'), k('c')]), ['A1', 'A2', undefined, 'B1', 'B2', 'B3', undefined])
  let n = 0
  const key = () => `s${n++}`
  const three = [k(), k(), k()]
  const pair = toggleSuperset(three, 0, key)
  assert.deepEqual(supersetTags(pair), ['A1', 'A2', undefined])
  const giant = toggleSuperset(pair, 1, key)
  assert.deepEqual(supersetTags(giant), ['A1', 'A2', 'A3'])
  // splitting at the top leaves the first on its own and the other two together
  const split = toggleSuperset(giant, 0, key)
  assert.deepEqual(supersetTags(split), [undefined, 'A1', 'A2'])
  assert.equal(split[0].superset, undefined)
})
