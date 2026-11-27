import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BUILTIN_EXERCISES } from '../src/data/exercises'
import type { Exercise, Programme, Routine, SetEntry, Workout } from '../src/data/types'
import {
  barsOf,
  baseId,
  beltMates,
  bestSets,
  bestText,
  byEquipment,
  countAt,
  currentProgramme,
  doneThisWeek,
  doneWith,
  dropFor,
  dropsBySet,
  focusOf,
  gainText,
  historyFor,
  liftSummary,
  musclesOf,
  nextRoutine,
  openRun,
  planFor,
  pyramidStep,
  sessionsByWeek,
  progressOf,
  recordsIn,
  sessionBars,
  setsLine,
  setsOf,
  setupsOf,
  stepped,
  supersetTags,
  targetFor,
  targetText,
  toggleSuperset,
  type Target,
  type TargetOptions,
  weekOfRun,
  withEquipment,
} from '../src/lib/lift'

const byId = new Map(BUILTIN_EXERCISES.map((e) => [e.id, e]))
const bench = byId.get('bench-press')! // 6–10 reps, 2.5 kg steps
const rdl = byId.get('romanian-deadlift')! // 6–10 reps, 2.5 kg steps
const squat = byId.get('back-squat')! // 5–8 reps, 2.5 kg steps
const legCurl: Exercise = { ...byId.get('leg-curl')!, repRange: [8, 12] } // 5 kg steps, on the range Alex uses
const dbPress = byId.get('incline-db-press')! // 8–12 reps, 2 kg steps
const pullUp = byId.get('pull-up')! // bodyweight plus added kg, 5–10 reps
const dips = byId.get('dips')! // bodyweight plus added kg, 6–12 reps
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
/** a target set by set, as [kg, reps]; no kg is bodyweight alone */
const ladder = (t: Target) => t.perSet.map((x) => [x.kg, x.count])
/** a finished session of two exercises done in turns */
const both = (daysAgo: number, a: [Exercise, SetEntry[]], b: [Exercise, SetEntry[]]): Workout => ({
  ...session(a[0], daysAgo, a[1]),
  exercises: [a, b].map(([ex, sets]) => ({ id: `we${n++}`, exerciseId: ex.id, sets, superset: 'x' })),
})
const inTurns = (...lifts: Exercise[]) => ({
  lifts: new Map(lifts.map((e) => [e.id, e])),
  items: lifts.map((e) => ({ exerciseId: e.id, sets: 3, superset: 'x' })),
})

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

test('the top of the range on every set earns more weight, at the reps that weight should leave you', () => {
  // 60 × 10 says about 8 at 62.5, so that's where the reps start again, not the bottom of the range
  const t = next(bench, session(bench, 3, three(60, 10)))
  assert.deepEqual([t.move, t.kg, t.count, t.note, counts(t)], ['up', 62.5, 8, '+2.5 kg', [8, 8, 8]])
  // a step that's a small part of the load hardly costs a rep: 8s with 15 kg added at 78 kg is 7 with 17.5
  const chin: Exercise = { ...pullUp, repRange: [4, 8] }
  const small = nextWith(chin, { bodyKg: 78 }, session(chin, 3, three(15, 8)))
  assert.deepEqual([small.move, small.kg, small.count], ['up', 17.5, 7])
  // over the top by so much that a step would leave you there: as many steps as bring the reps back inside the range
  const two = next(bench, session(bench, 3, three(60, 12)))
  assert.deepEqual([two.move, two.kg, two.count, two.note], ['up', 65, 8, '+5 kg'])
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
  assert.deepEqual([up.move, up.kg, up.count, up.note], ['up', 82.5, 8, '+2.5 kg'])
  assert.deepEqual(up.perSet, [
    { kg: 40, count: 10 },
    { kg: 60, count: 10 },
    { kg: 82.5, count: 8 },
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
  // five weeks at 13 and no further: the step goes ahead anyway
  const stuck = next(dbPress, ...[3, 10, 17, 24, 31].map((d) => session(dbPress, d, three(10, 13))))
  assert.deepEqual([stuck.move, stuck.kg, stuck.count], ['up', 12, 8])
  // three weeks isn't long enough to say they've stopped coming
  assert.deepEqual(counts(next(dbPress, ...[3, 10, 17].map((d) => session(dbPress, d, three(10, 13))))), [14, 14, 14])
})

test('far over the range the weight goes up as far as it takes; far under it, every set, sets it again aiming mid-range', () => {
  // 40 × 15 says 10 at 45 and about 8 at 47.5: three steps at once, a quarter of the load at most
  const light = next(bench, session(bench, 3, three(40, 15)))
  assert.deepEqual([light.move, light.kg, light.count, light.note], ['up', 47.5, 7, '+7.5 kg'])
  assert.equal(next(bench, session(bench, 3, three(40, 25))).kg, 50)
  // and it doesn't wait for a set the workout has and the session didn't
  assert.deepEqual([nextWith(bench, { sets: 3 }, session(bench, 3, [set(40, 15), set(40, 15)])).kg], [47.5])
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
  assert.deepEqual([short.move, short.kg, short.count, short.note], ['up', 62.5, 8, '+2.5 kg'])
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

test('stuck is five weeks at a weight with nothing gained: the next step if it’s in reach, a tenth off if it isn’t', () => {
  // five weeks, newest first, each a week before the last
  const weeks = (ex: Exercise, ...reps: number[][]) =>
    reps.map((r, i) =>
      session(
        ex,
        2 + 7 * i,
        r.map((n) => set(60, n)),
      ),
    )
  // 8, 8, 7 every week: 7 says under 6 at 62.5, so the step is out of reach and a tenth comes off
  const low = next(bench, ...weeks(bench, [8, 8, 7], [8, 7, 7], [8, 8, 7], [8, 8, 7], [8, 8, 7]))
  assert.deepEqual([low.move, low.kg, low.count, low.note], ['back', 55, 8, '−5 kg'])
  // 9, 9, 8 every week: 8 says 6 at 62.5, so it goes up rather than round again
  const high = next(bench, ...weeks(bench, [9, 9, 8], [9, 9, 8], [9, 9, 8], [9, 9, 8], [9, 9, 8]))
  assert.deepEqual([high.move, high.kg, high.count, high.note], ['up', 62.5, 6, '+2.5 kg'])
  // three flat weeks isn't stuck: it used to take a tenth off after two
  const early = next(bench, ...weeks(bench, [8, 8, 7], [8, 7, 7], [8, 8, 7]))
  assert.deepEqual([early.move, early.kg, counts(early)], ['more', 60, [8, 8, 8]])
  // nor is one good day five weeks ago: the last two are no worse than the week after it
  const lucky = next(bench, ...weeks(bench, [9, 9, 8], [9, 8, 8], [9, 8, 7], [9, 8, 7], [10, 9, 8]))
  assert.equal(lucky.move, 'more')
  // a rep gained on any set in that time is still moving
  assert.equal(next(bench, ...weeks(bench, [9, 8, 7], [8, 8, 7], [8, 8, 7], [8, 8, 7], [8, 8, 7])).move, 'more')
  // and a week at another weight in between starts the count again
  const broken = weeks(bench, [8, 8, 7], [8, 8, 7], [8, 8, 7], [8, 8, 7], [8, 8, 7])
  broken[2] = session(bench, 16, three(57.5, 9))
  assert.equal(next(bench, ...broken).move, 'more')
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

test('progress is each session’s estimated max over the weeks asked for, and what the best set has gained', () => {
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
  assert.deepEqual([p.ex.id, p.now, gainText(p.ex, p.gain), p.sessions], ['bench-press', '62.5 kg × 7', '+5 kg', 3])
  // the line still starts from the session before the window: each set's weight and a thirtieth of it a rep
  assert.deepEqual(
    p.points.map((x) => Math.round(x.v * 10) / 10),
    [69.7, 72.8, 76, 77.1],
  )
  // a lift that's held its weight and gained reps has still moved: the line goes up, and it's said in reps
  const [held] = progressOf([session(bench, 30, [set(70, 7), set(70, 7), set(70, 6)]), session(bench, 2, [set(70, 10), set(70, 9), set(70, 9)])], byId, now)
  assert.deepEqual([held.now, gainText(held.ex, held.gain), held.points[1].v > held.points[0].v], ['70 kg × 10', '+3 reps', true])
  // more weight for fewer reps is a gain in weight that the estimated max doesn't back yet: said, and known to be so
  const [early] = progressOf([session(bench, 30, [set(60, 10)]), session(bench, 2, [set(62.5, 6)])], byId, now)
  assert.deepEqual([gainText(early.ex, early.gain), early.moved < 0, held.moved > 0], ['+2.5 kg', true, true])
  // nothing gained says nothing
  const [flat] = progressOf([session(bench, 30, [set(70, 8)]), session(bench, 2, [set(70, 8)])], byId, now)
  assert.equal(gainText(flat.ex, flat.gain), '')
  // weight added to you counts with your body weight, and is said as what's added; with nothing to load it's the reps
  const belt = [session(dips, 30, [set(10, 8), set(undefined, 12)]), session(dips, 2, [set(15, 8), set(5, 10)])]
  const [d] = progressOf(belt, byId, now, 8, 78)
  assert.deepEqual([d.now, gainText(d.ex, d.gain), Math.round(d.points[1].v)], ['+15 kg × 8', '+5 kg', 118])
  assert.equal(bestText(dips, historyFor(dips.id, [session(dips, 1, [set(undefined, 12)])])[0], 78), 'BW × 12')
  const [u] = progressOf([session(pushUp, 30, [set(undefined, 14)]), session(pushUp, 2, [set(undefined, 16)])], byId, now)
  assert.deepEqual([u.now, gainText(u.ex, u.gain), u.points.map((x) => x.v)], ['16 reps', '+2 reps', [14, 16]])
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

test('a reverse pyramid: the top set moves by the usual rules and the sets after it follow it down', () => {
  const rpt: Exercise = { ...bench, pyramid: true } // top set 6–10, then 8–12, then 10–14
  // each a step down the pyramid already: every set keeps its weight and aims for one more rep
  const t = next(rpt, session(rpt, 3, [set(80, 6), set(72.5, 8), set(65, 9)]))
  assert.deepEqual([t.move, t.kg, t.count, t.note], ['more', 80, 7, '+1 rep'])
  assert.deepEqual(t.perSet, [
    { kg: 80, count: 7 },
    { kg: 72.5, count: 9 },
    { kg: 65, count: 10 },
  ])
  assert.equal(targetText(rpt, t), '80 kg × 7')
  // the top set at the top of its range goes up to what it says you'd lift for a rep over the bottom of it (80 × 10
  // says about 86 for 7), and the sets under it go up with it, at the reps their own last go says they'd get there
  const up = next(rpt, session(rpt, 3, [set(80, 10), set(72.5, 10), set(65, 12)]))
  assert.deepEqual(
    [up.move, up.note, ladder(up)],
    [
      'up',
      '+5 kg',
      [
        [85, 7],
        [75, 9],
        [67.5, 10],
      ],
    ],
  )
  // a set at the top of its own range earns a step of its own, while there's room under the set above
  const own = next(rpt, session(rpt, 3, [set(80, 7), set(72.5, 12), set(65, 10)]))
  assert.deepEqual(ladder(own), [
    [80, 8],
    [75, 11],
    [65, 11],
  ])
  // a set the workout has but the last session didn't: a tenth lighter than the one above, two reps over it
  const more = nextWith(rpt, { sets: 3 }, session(rpt, 3, [set(80, 7), set(72.5, 9)]))
  assert.deepEqual(more.perSet[2], { kg: 65, count: 12 })
})

test('a reverse pyramid comes down in even steps, whatever shape the last session had', () => {
  // Alex's RDL, made a pyramid of 5–8 after ramping 40 × 10 and 60 × 10 to 80 × 9: the ramp isn't the pyramid's sets,
  // and 80 × 9 says about 87 kg for 6, a rep over the bottom of the range; the two after it a tenth lighter each
  const rdlRpt: Exercise = { ...rdl, repRange: [5, 8], pyramid: true }
  const t = nextWith(rdlRpt, { sets: 3 }, session(rdlRpt, 3, [set(40, 10), set(60, 10), set(80, 9)]))
  assert.deepEqual([t.move, t.kg, t.count, t.note], ['up', 85, 6, '+5 kg'])
  assert.deepEqual(ladder(t), [
    [85, 6],
    [77.5, 8],
    [70, 10],
  ])
  // warm-ups left unmarked before a pyramid aren't its sets either
  const warmed = nextWith(rdlRpt, { sets: 3 }, session(rdlRpt, 3, [set(40, 10), set(60, 5), set(87.5, 6), set(80, 8), set(72.5, 10)]))
  assert.deepEqual(ladder(warmed), [
    [87.5, 7],
    [80, 9],
    [72.5, 11],
  ])
  // three sets at one weight with the reps falling away: each goes a tenth under the one above, at what it says you'd
  // get there, the top of its range at most (80 × 5 says 13 at 65, and 12 is asked) rather than a smaller step down
  const flat = nextWith(rdlRpt, { sets: 3 }, session(rdlRpt, 3, [set(80, 7), set(80, 6), set(80, 5)]))
  assert.deepEqual(ladder(flat), [
    [80, 8],
    [72.5, 10],
    [65, 12],
  ])
  // and never as heavy as the set above, or heavier
  for (const t of [flat, warmed]) for (let k = 1; k < t.perSet.length; k++) assert.ok(t.perSet[k].kg! < t.perSet[k - 1].kg!)
})

test('a top set that backs off takes the pyramid with it', () => {
  const rpt: Exercise = { ...bench, pyramid: true }
  const now = new Date('2026-11-01T20:00:00Z')
  const sets = () => [set(80, 8), set(72.5, 10), set(65, 12)]
  // weekly, then 30 days off: a tenth off the top set, and each set under it a tenth lighter and two reps higher
  const away = nextWith(rpt, { now }, session(rpt, 30, sets()), session(rpt, 37, sets()), session(rpt, 44, sets()))
  assert.deepEqual(
    [away.move, away.note, ladder(away)],
    [
      'back',
      '−7.5 kg',
      [
        [72.5, 8],
        [65, 10],
        [57.5, 12],
      ],
    ],
  )
})

test('the steps down a pyramid count your body weight in what’s added to you', () => {
  // a tenth of 78 kg plus 25 is about 10 kg off, and a tenth of 78 plus 5 is back to bodyweight
  assert.deepEqual([pyramidStep(dips, 25, 78), pyramidStep(dips, 15, 78), pyramidStep(dips, 5, 78)], [15, 5, undefined])
  // with no weigh-in there's only what's added to go by: at least a step down
  assert.deepEqual([pyramidStep(dips, 25), pyramidStep(dips, 12.5)], [22.5, 10])
  assert.equal(pyramidStep(bench, 100), 90)
  // a tenth of a small dumbbell is under a step, so it's a step
  assert.equal(pyramidStep({ kind: 'weight', increment: 1 }, 5), 4)
  // the reps a planned set comes to at another weight, by its estimated max
  assert.equal(countAt(dips, { kg: 25, count: 4 }, 15, 78), 8)
  assert.equal(countAt(bench, { kg: 60, count: 10 }, 62.5), 8)
  // and nothing to say without the whole load
  assert.equal(countAt(dips, { kg: 25, count: 4 }, 15), 4)
})

test('chin-ups and dips done in turns go round on one belt, at the weaker one’s weight', () => {
  // Alex's 21 November: both 4–8 reverse pyramids in a superset, done at one weight each with the reps falling away
  // and a drop set at bodyweight. He was given +15 × 8, +15 × 7, +2.5 × 10 and +25 × 4, +12.5 × 8, bodyweight × 10:
  // "why is there such a big difference", "such a huge drop for the second one", and one belt for both.
  const chin: Exercise = { ...byId.get('chin-up')!, repRange: [4, 8], pyramid: true }
  const dip: Exercise = { ...dips, repRange: [4, 8], pyramid: true }
  const { lifts, items } = inTurns(chin, dip)
  const o = { bodyKg: 78 }
  const first = both(5, [chin, [set(15, 7), set(15, 6), set(15, 5)]], [dip, [set(12.5, 9), set(12.5, 7), set(12.5, 5), set(undefined, 7, 'drop')]])
  // on its own, dips' 9 beat the top of its range, so its top set goes up, and the sets under it come down evenly
  const own = targetFor(dip, historyFor(dip.id, [first]), { sets: 3, ...o })
  assert.deepEqual(
    [own.move, own.note, ladder(own)],
    [
      'up',
      '+10 kg',
      [
        [22.5, 5],
        [12.5, 8],
        [2.5, 9],
      ],
    ],
  )
  // in turns, chin-ups are the weaker (7 at +15 says less than 9 at +12.5) and haven't earned more weight: they set
  // the belt, and dips go up to it and do the reps that leaves them
  const [c, d] = planFor(items, lifts, [first], o) as Target[]
  assert.deepEqual(
    [c.move, c.note, ladder(c)],
    [
      'more',
      '+1 rep',
      [
        [15, 8],
        [5, 10],
        [undefined, 12],
      ],
    ],
  )
  assert.deepEqual(
    [d.move, d.note, targetText(dip, d), ladder(d)],
    [
      'up',
      '+2.5 kg',
      '+15 kg × 8',
      [
        [15, 8],
        [5, 10],
        [undefined, 11],
      ],
    ],
  )
  // apart, each is its own; and with no weigh-in there's no load to share by
  const apart = planFor(
    items.map((it) => ({ ...it, superset: undefined })),
    lifts,
    [first],
    o,
  )
  assert.deepEqual(apart[1], own)
  assert.deepEqual(planFor(items, lifts, [first])[1], targetFor(dip, historyFor(dip.id, [first]), { sets: 3 }))

  // the week after, both made it: the top sets go up together, and so does everything under them
  const made = both(-2, [chin, [set(15, 8), set(5, 10), set(undefined, 12)]], [dip, [set(15, 8), set(5, 10), set(undefined, 11)]])
  const [c2, d2] = planFor(items, lifts, [made, first], o) as Target[]
  assert.deepEqual(
    [c2.note, ladder(c2)],
    [
      '+7.5 kg',
      [
        [22.5, 5],
        [12.5, 7],
        [2.5, 11],
      ],
    ],
  )
  assert.deepEqual(
    ladder(d2).map((x) => x[0]),
    [22.5, 12.5, 2.5],
  )
  // or dips did and chin-ups didn't: dips wait at that weight, a rep more than last time, rather than go on alone
  const short = both(-2, [chin, [set(15, 7), set(5, 10), set(undefined, 12)]], [dip, [set(15, 8), set(5, 10), set(undefined, 11)]])
  const [c3, d3] = planFor(items, lifts, [short, first], o) as Target[]
  assert.deepEqual(ladder(c3), [
    [15, 8],
    [7.5, 9],
    [2.5, 11],
  ])
  assert.deepEqual(
    [d3.move, d3.note, ladder(d3)],
    [
      'more',
      '+1 rep',
      [
        [15, 9],
        [7.5, 9],
        [2.5, 10],
      ],
    ],
  )
})

test('a belt is only shared by lifts close enough to share it', () => {
  const o = { bodyKg: 78 }
  const { lifts, items } = inTurns(pullUp, dips) // 5–10 and 6–12, both at one weight
  const plan = (pull: number[], dip: [number, number[]]) => {
    const w = both(5, [pullUp, pull.map((r) => set(10, r))], [dips, dip[1].map((r) => set(dip[0], r))])
    return { shared: planFor(items, lifts, [w], o)[1]!, own: targetFor(dips, historyFor(dips.id, [w]), { sets: 3, ...o }) }
  }
  // +10 against +20: dips are never taken under what they lifted last time, so each goes on as it was
  const far = plan([7, 6, 6], [20, [8, 8, 7]])
  assert.deepEqual(far.shared, far.own)
  assert.equal(far.shared.kg, 20)
  // at the same weight and stronger there, dips have earned more but wait for the pull-ups, a rep more on every set
  const held = plan([7, 6, 6], [10, [13, 12, 12]])
  assert.deepEqual([held.own.kg, held.shared.move, held.shared.kg, held.shared.note, counts(held.shared)], [12.5, 'more', 10, '+1 rep', [14, 13, 13]])
  // until that's three over their range: then they go their own way
  const gone = plan([7, 6, 6], [10, [14, 13, 12]])
  assert.deepEqual(gone.shared, gone.own)
  assert.equal(gone.shared.kg, 12.5)
  // one a pyramid and the other not have different weights each round anyway
  assert.deepEqual(beltMates(items, lifts), [[1], [0]])
  assert.deepEqual(beltMates(items, new Map([...lifts, [dips.id, { ...dips, pyramid: true }]])), [[], []])
  // and only lifts that add weight to you wear the belt
  assert.deepEqual(beltMates([...items, { exerciseId: bench.id, sets: 3, superset: 'x' }], new Map([...lifts, [bench.id, bench]])), [[1], [0], []])
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
  // weight added to you counts with your body weight: a fifth off 78 kg plus 25 leaves 2.5 on the belt, and a drop to
  // bodyweight last time is one again
  assert.deepEqual(dropFor(dips, { kg: 25, count: 4 }, undefined, 78), { kg: 2.5, count: 4 })
  assert.deepEqual(dropFor(dips, { kg: 5, count: 8 }, { from: 12.5, kg: undefined, reps: 7 }, 78), { kg: undefined, count: 7 })
  assert.deepEqual(dropFor(dips, { kg: 25, count: 4 }), { kg: 20, count: 4 })
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

test('sets are drawn as bars as tall as their weight: a pyramid steps down, a ramp steps up, straight sets are level', () => {
  const bars = (ex: Exercise, kgs: (number | undefined)[], bodyKg?: number) =>
    barsOf(
      ex,
      kgs.map((kg) => ({ kg })),
      bodyKg,
    ).map((b) => [Math.round(b.rise * 100) / 100, b.top])
  // straight sets are level, all at the working weight
  assert.deepEqual(bars(bench, [60, 60, 60]), [
    [1, true],
    [1, true],
    [1, true],
  ])
  // a ramp: 60 on the way to 80 is three quarters of it, which is as short as a bar gets
  assert.deepEqual(bars(squat, [60, 80, 80]), [
    [0, false],
    [1, true],
    [1, true],
  ])
  // a pyramid on the belt: body weight counts, so +15, +5 and nothing at 78 kg are 93, 83 and 78
  assert.deepEqual(bars(dips, [15, 5, undefined], 78), [
    [1, true],
    [0.57, false],
    [0.35, false],
  ])
  // nothing to load, or no weight yet: level
  assert.deepEqual(bars(pushUp, [undefined, undefined]), [
    [1, true],
    [1, true],
  ])
  assert.deepEqual(bars(bench, [undefined]), [[1, true]])
  // a workout's sets as the target plans them: each one's own, and the headline past the end of them
  const t = next(squat, session(squat, 3, [set(60, 9), set(80, 5), set(80, 5)]))
  assert.deepEqual(
    setsOf(t, 4).map((x) => [x.kg, x.count]),
    [
      [60, 9],
      [80, 6],
      [80, 6],
      [80, 6],
    ],
  )
  // sets at more than one weight are stepped; level ones, and ones with nothing to load, aren't
  assert.equal(stepped(squat, setsOf(t, 3)), true)
  assert.equal(stepped(bench, [{ kg: 60 }, { kg: 60 }]), false)
  assert.equal(stepped(pushUp, [{}, {}]), false)
})

test('a best is marked set by set, as it’s ticked: the same record the session ends up with', () => {
  const before = session(bench, 10, [set(60, 8), set(60, 8), set(60, 7)])
  const was = before.exercises[0].sets
  const ids = (ex: Exercise, sets: SetEntry[], past: SetEntry[], top?: number) => [...bestSets(ex, sets, past, top)]
  // the first set with more reps than ever at that weight is the best, and one that only matches it isn't another
  const reps = [set(60, 9), set(60, 9), set(60, 8)]
  assert.deepEqual(ids(bench, reps, was), [reps[0].id])
  // heavier than anything before: the first set there, and a later one only with more reps again
  const up = [set(62.5, 6), set(62.5, 6), set(62.5, 7)]
  assert.deepEqual(ids(bench, up, was), [up[0].id, up[2].id])
  // only at the session's heaviest weight: the ramp up to it isn't in the running, nor a set down a pyramid
  const ramp = [set(40, 12), set(60, 9), set(50, 14)]
  assert.deepEqual(ids(bench, ramp, was), [ramp[1].id])
  // the logger says what the heaviest will be, so a ramp set ticked first isn't one while the top is still to come
  assert.deepEqual(ids(bench, [set(40, 12)], was, 60), [])
  // never a warm-up or a drop set, a set not ticked, or anything the first time a lift is logged
  assert.deepEqual(ids(bench, [set(70, 5, 'warmup'), set(60, 20, 'drop'), { ...set(60, 12), done: false }], was), [])
  assert.deepEqual(ids(bench, reps, []), [])
  // nothing to load: more reps than ever
  const ups = [set(undefined, 14), set(undefined, 16), set(undefined, 16)]
  assert.deepEqual(ids(pushUp, ups, [set(undefined, 15)]), [ups[1].id])
  // weight added to you: bodyweight alone is the lightest there is, so only when it's all the session has
  const belt = [set(15, 8), set(5, 10), set(undefined, 12)]
  assert.deepEqual(ids(dips, belt, [set(12.5, 9), set(12.5, 7)]), [belt[0].id])
  const alone = [set(undefined, 10)]
  assert.deepEqual(ids(dips, alone, [set(undefined, 9), set(undefined, 8)]), [alone[0].id])
  // and a session has a record in a lift exactly when one of its sets is marked
  for (const sets of [reps, up, ramp, [set(60, 8), set(60, 8)], [set(57.5, 12)], [set(60, 7), set(60, 9)]]) {
    const today = session(bench, 0, sets)
    assert.equal(recordsIn(today, [before, today], byId).length > 0, bestSets(bench, sets, was).size > 0)
  }
})

test('a programme’s week by muscle: a set for the main one, half for each that helps', () => {
  const r = (id: string, ...items: [string, number][]): Routine => ({ id, name: id, focus: '', items: items.map(([exerciseId, sets]) => ({ exerciseId, sets })) })
  // bench also works triceps and shoulders, chin-ups biceps, squats glutes
  const routines = [r('a', ['bench-press', 3], ['chin-up', 3]), r('b', ['back-squat', 4], ['barbell-curl', 2]), r('empty')]
  const p: Programme = { id: 'p', name: 'P', routineIds: ['a', 'b', 'empty', 'gone'], perWeek: 2, weeks: 10, runs: [] }
  const week = musclesOf(p, routines, byId)
  // two workouts with something in them, twice a week: each once
  assert.equal(week.total, 12)
  assert.deepEqual(
    week.list.map((m) => [m.muscle, m.sets]),
    [
      ['quads', 4],
      ['biceps', 3.5],
      ['chest', 3],
      ['back', 3],
      ['glutes', 2],
      ['triceps', 1.5],
      ['shoulders', 1.5],
    ],
  )
  // four times a week they each come round twice
  assert.equal(musclesOf({ ...p, perWeek: 4 }, routines, byId).total, 24)
  assert.equal(musclesOf({ ...p, perWeek: 3 }, routines, byId).list[0].sets, 6)
  assert.deepEqual(musclesOf({ ...p, routineIds: ['empty'] }, routines, byId), { list: [], total: 0 })
})

test('a lift done with something else keeps a history for each: dumbbells then a cable aren’t one lift going backwards', () => {
  const raise: Exercise = { ...byId.get('lateral-raise')!, repRange: [6, 10] }
  // the lift is on a cable now: three sessions with 9 kg dumbbells, then two at 5 kg on the stack
  const cable: Exercise = { ...raise, equipment: 'cable' }
  const lifts = new Map(byId).set(cable.id, cable)
  const on = (w: Workout, equipment?: Exercise['equipment']): Workout => ({ ...w, exercises: w.exercises.map((we) => ({ ...we, equipment })) })
  const sessions = [
    on(session(raise, 2, three(5, 8)), 'cable'),
    on(session(raise, 9, three(5, 7)), 'cable'),
    on(session(raise, 16, three(9, 12)), 'dumbbell'),
    on(session(raise, 23, three(9, 11)), 'dumbbell'),
    on(session(raise, 30, three(9, 10)), 'dumbbell'),
  ]
  // as one history it's a lift that lost nearly half its weight
  assert.equal(historyFor(raise.id, sessions).length, 5)
  const split = byEquipment(sessions, lifts)
  // split, the lift only has its cable sessions, and goes on from them
  const mine = historyFor(cable.id, split.workouts)
  assert.deepEqual(
    mine.map((h) => h.sets[0].kg),
    [5, 5],
  )
  const t = targetFor(cable, mine)
  assert.deepEqual([t.move, t.kg, t.count], ['more', 5, 9])
  // the dumbbell sessions are the same lift beside it, named for what it was done with
  const other = split.exercises.get('lateral-raise~dumbbell')!
  assert.deepEqual([other.name, other.equipment, other.variantOf, baseId(other.id)], ['Lateral Raise · Dumbbell', 'dumbbell', 'lateral-raise', 'lateral-raise'])
  assert.equal(historyFor(other.id, split.workouts).length, 3)
  assert.deepEqual(
    setupsOf(cable, split.workouts, split.exercises).map((e) => e.equipment),
    ['cable', 'dumbbell'],
  )
  assert.deepEqual(
    setupsOf(other, split.workouts, split.exercises).map((e) => e.id),
    ['lateral-raise', 'lateral-raise~dumbbell'],
  )
  // bests and progress go by the lift, so they're per equipment too: 5 × 8 on the cable is a best there
  assert.deepEqual(recordsIn(split.workouts[0], split.workouts, split.exercises), [{ exerciseId: 'lateral-raise', value: '5 × 8', text: 'Most reps at 5 kg' }])
  // put the lift back on dumbbells and it picks that history up again, the cable's set aside
  const back = byEquipment(sessions, new Map(byId).set(raise.id, raise))
  assert.deepEqual(
    historyFor(raise.id, back.workouts).map((h) => h.sets[0].kg),
    [9, 9, 9],
  )
  assert.equal(back.exercises.get('lateral-raise~cable')?.name, 'Lateral Raise · Cable')
  // a session that doesn't say what it was done with goes with what the lift is on now, and nothing is split
  const unsaid = [session(raise, 2, three(5, 8))]
  assert.equal(byEquipment(unsaid, lifts).workouts[0], unsaid[0])
  assert.equal(byEquipment(unsaid, lifts).exercises.size, lifts.size)
})

test('sessions take what the exercise is on when they don’t say, and a change of equipment is said from one session back', () => {
  const raise: Exercise = { ...byId.get('lateral-raise')!, equipment: 'cable' }
  const lifts = new Map(byId).set(raise.id, raise)
  const sessions = [1, 8, 15, 22].map((d) => session(raise, d, three(5, 8)))
  const said = withEquipment(sessions, lifts)
  assert.deepEqual(
    said.map((w) => w.exercises[0].equipment),
    ['cable', 'cable', 'cable', 'cable'],
  )
  // one that already says is left alone, and so is the list when they all do
  assert.equal(withEquipment(said, new Map(byId))[0], said[0])
  // the third newest was the last on dumbbells: it and the one before it move, the two since stay on the cable
  const moved = doneWith(said, raise.id, said[2].id, 'dumbbell')
  assert.deepEqual(
    moved.map((w) => w.exercises[0].equipment),
    ['cable', 'cable', 'dumbbell', 'dumbbell'],
  )
  assert.equal(moved[0], said[0])
  // moving one of those back only takes the ones on the same thing as it: here the oldest alone
  assert.deepEqual(
    doneWith(moved, raise.id, moved[3].id, 'band').map((w) => w.exercises[0].equipment),
    ['cable', 'cable', 'dumbbell', 'band'],
  )
  // other lifts in the same sessions don't move, nor anything for a session that isn't there
  const mixed = said.map((w) => ({ ...w, exercises: [...w.exercises, { id: `${w.id}-b`, exerciseId: bench.id, equipment: 'barbell' as const, sets: [] }] }))
  assert.deepEqual(
    doneWith(mixed, raise.id, mixed[0].id, 'dumbbell').map((w) => w.exercises[1].equipment),
    ['barbell', 'barbell', 'barbell', 'barbell'],
  )
  assert.equal(doneWith(said, raise.id, 'nope', 'dumbbell'), said)
})

test('a session is drawn as its sets: a group of bars a lift, the ones that were new bests marked', () => {
  const first = both(10, [bench, [set(60, 8), set(60, 8)]], [squat, [set(60, 9), set(80, 5)]])
  const then = both(3, [bench, [set(60, 9), set(60, 8), set(45, 12, 'drop')]], [squat, [set(60, 9), set(80, 5), set(80, 6)]])
  const drawn = (w: Workout) => sessionBars(w, [then, first], byId).map((l) => [l.exerciseId, l.bars.map((b) => `${b.rise}${b.top ? ' top' : ''}${b.best ? ' best' : ''}`)])
  assert.deepEqual(drawn(then), [
    // nine where eight was the most; the drop set isn't one of the sets that count, so it isn't drawn
    ['bench-press', ['1 top best', '1 top']],
    // the ramp set is as short as a bar gets, and of the two at 80 the six is the best
    ['back-squat', ['0', '1 top', '1 top best']],
  ])
  // the first session of a lift has nothing before it to beat
  assert.deepEqual(
    drawn(first).map(([, bars]) => (bars as string[]).some((b) => b.includes('best'))),
    [false, false],
  )
  // each group goes by the logged exercise, so a lift done twice in a session is two groups
  assert.equal(new Set(sessionBars(then, [then, first], byId).map((l) => l.id)).size, 2)
})
