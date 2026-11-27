import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BUILTIN_EXERCISES } from '../src/data/exercises'
import type { Exercise, SetEntry, Workout, WorkoutExercise } from '../src/data/types'
import { beltMates, historyFor, planFor, targetFor, type Target } from '../src/lib/lift'
import { beltCard, cardsOf, logRows, moveCard, pastOf, splitCard, tickOf, type BeltLift, type Row } from '../src/lib/logging'

const byId = new Map(BUILTIN_EXERCISES.map((e) => [e.id, e]))
const bench = byId.get('bench-press')! // 6–10 reps, 2.5 kg steps
const squat = byId.get('back-squat')! // 5–8 reps
const plank = byId.get('plank')!
// as Alex has them: reverse pyramids from 4 to 8, on one belt
const chin: Exercise = { ...byId.get('chin-up')!, repRange: [4, 8], pyramid: true }
const dips: Exercise = { ...byId.get('dips')!, repRange: [4, 8], pyramid: true }
const lifts = new Map(byId).set(chin.id, chin).set(dips.id, dips)
const BODY = 78

let n = 0
/** a set done in a session before */
const set = (kg: number | undefined, reps: number, kind: SetEntry['kind'] = 'working'): SetEntry => ({ id: `s${n++}`, kind, kg, reps, done: true })
/** a set of the workout in progress, with whatever's been typed into it */
const todo = (over: Partial<SetEntry> = {}): SetEntry => ({ id: `t${n++}`, kind: 'working', done: false, ...over })
const live = (ex: Exercise, sets: SetEntry[], superset?: string): WorkoutExercise => ({ id: `we${n++}`, exerciseId: ex.id, sets, superset })
const session = (daysAgo: number, ...done: [Exercise, SetEntry[]][]): Workout => {
  const start = new Date(Date.parse('2026-11-27T18:00:00Z') - daysAgo * 86_400_000)
  return {
    id: `w${n++}`,
    name: 'Session',
    start: start.toISOString(),
    end: new Date(start.getTime() + 3_600_000).toISOString(),
    exercises: done.map(([ex, sets]) => ({ id: `we${n++}`, exerciseId: ex.id, sets, superset: done.length > 1 ? 'x' : undefined })),
    source: 'manual',
  }
}
/** the rows for one exercise today, planned from the sessions before */
const rowsFor = (ex: Exercise, sets: SetEntry[], before: Workout[], bodyKg?: number) => {
  const history = historyFor(ex.id, before)
  return logRows(ex, live(ex, sets), targetFor(ex, history, { sets: sets.filter((s) => s.kind === 'working').length, bodyKg }), pastOf(ex, before, bodyKg), bodyKg)
}
/** what a row would log if it's ticked as it stands */
const says = (r: Row) => [r.label, r.s.kg ?? r.phKg, r.s.reps ?? r.phCount]

test('each set is prefilled with its target, beside what it did last time', () => {
  const before = [session(7, [bench, [set(60, 9), set(60, 8), set(60, 8)]])]
  const rows = rowsFor(bench, [todo(), todo(), todo()], before)
  assert.deepEqual(rows.map(says), [
    ['1', 60, 9],
    ['2', 60, 9],
    ['3', 60, 9],
  ])
  assert.deepEqual(
    rows.map((r) => [r.k, r.previous?.reps]),
    [
      [0, 9],
      [1, 8],
      [2, 8],
    ],
  )
  // a set past the ones done last time takes the target, with nothing beside it
  const four = rowsFor(bench, [todo(), todo(), todo(), todo()], before)
  assert.deepEqual([says(four[3]), four[3].previous], [['4', 60, 9], undefined])
  // the first time there's no weight to offer, only the bottom of the range
  assert.deepEqual(rowsFor(bench, [todo()], []).map(says), [['1', undefined, 6]])
})

test('a weight typed on a set carries down the sets planned at it, and the reps follow the weight', () => {
  const before = [session(7, [bench, [set(60, 9), set(60, 8), set(60, 8)]])]
  // 62.5 where 60 × 9 was asked: about 7 there, on that set and the ones under it
  const heavier = rowsFor(bench, [todo({ kg: 62.5 }), todo(), todo()], before)
  assert.deepEqual(heavier.map(says), [
    ['1', 62.5, 7],
    ['2', 62.5, 7],
    ['3', 62.5, 7],
  ])
  // typed reps are yours, whatever the weight says
  assert.deepEqual(says(rowsFor(bench, [todo({ kg: 62.5, reps: 9 })], before)[0]), ['1', 62.5, 9])
  // a weight half typed in (6 on the way to 60) is nothing to go by: the reps stay as planned
  assert.deepEqual(
    rowsFor(bench, [todo({ kg: 6 }), todo()], before).map((r) => r.phCount),
    [9, 9],
  )
  // the ramp up to the working weight keeps its own: 62.5 typed on it doesn't go onto the sets at 80
  const ramp = [session(7, [squat, [set(60, 9), set(80, 5), set(80, 5)]])]
  assert.deepEqual(rowsFor(squat, [todo({ kg: 62.5 }), todo(), todo()], ramp).map(says), [
    ['1', 62.5, 7],
    ['2', 80, 6],
    ['3', 80, 6],
  ])
})

test('warm-ups and drop sets are rows of their own, prefilled from last time’s', () => {
  const before = [session(7, [bench, [set(30, 5, 'warmup'), set(60, 8), set(60, 8), set(45, 10, 'drop')]])]
  const rows = rowsFor(bench, [todo({ kind: 'warmup' }), todo(), todo(), todo({ kind: 'drop' }), todo({ kind: 'drop' })], before)
  assert.deepEqual(rows.map(says), [
    ['W', 30, 5],
    ['1', 60, 9],
    ['2', 60, 9],
    // as far down as last time's, and a second one a fifth under that, on the weight's own steps
    ['D', 45, 10],
    ['D', 35, 10],
  ])
  assert.deepEqual(
    rows.map((r) => r.k),
    [undefined, 0, 1, undefined, undefined],
  )
})

test('down a pyramid, a set loaded heavier than planned has the sets after it placed again under it', () => {
  const before = [session(6, [chin, [set(15, 7), set(15, 6), set(15, 5)]])]
  assert.deepEqual(rowsFor(chin, [todo(), todo(), todo()], before, BODY).map(says), [
    ['1', 15, 8],
    ['2', 5, 10],
    ['3', 0, 12],
  ])
  assert.deepEqual(rowsFor(chin, [todo({ kg: 17.5 }), todo(), todo()], before, BODY).map(says), [
    ['1', 17.5, 7],
    ['2', 7.5, 9],
    ['3', 0, 12],
  ])
})

test('a set that’s a new best is marked once it’s ticked, at the heaviest weight the session has', () => {
  const before = [session(7, [squat, [set(60, 9), set(80, 5), set(80, 5)]])]
  // ten on the ramp set is more than ever at 60, but the session is going on to 80: no best
  const ramp = rowsFor(squat, [todo({ kg: 60, reps: 10, done: true }), todo(), todo()], before)
  assert.deepEqual(
    ramp.map((r) => !!r.best),
    [false, false, false],
  )
  // six at 80 where five was the most is one; six again isn't another
  const top = rowsFor(squat, [todo({ kg: 60, reps: 9, done: true }), todo({ kg: 80, reps: 6, done: true }), todo({ kg: 80, reps: 6, done: true })], before)
  assert.deepEqual(
    top.map((r) => !!r.best),
    [false, true, false],
  )
})

test('a tick writes down what the set was prefilled with, and says what’s missing when there’s nothing to go on', () => {
  const before = [session(7, [bench, [set(60, 9), set(60, 8)]])]
  const [first] = rowsFor(bench, [todo(), todo()], before)
  assert.deepEqual(tickOf(bench, first), { patch: { done: true, kg: 60, reps: 9 } })
  // what you typed stays as typed
  assert.deepEqual(tickOf(bench, rowsFor(bench, [todo({ kg: 62.5, reps: 6 })], before)[0]), { patch: { done: true } })
  // a tick on a set that's done takes it back
  assert.deepEqual(tickOf(bench, { ...first, s: { ...first.s, done: true } }), { patch: { done: false } })
  // the first go at a bar lift has no weight yet, a warm-up with nothing before it no reps, a hold no seconds
  assert.deepEqual(tickOf(bench, rowsFor(bench, [todo()], [])[0]), { missing: 'weight' })
  assert.deepEqual(tickOf(bench, rowsFor(bench, [todo({ kind: 'warmup' })], [])[0]), { missing: 'reps' })
  assert.deepEqual(tickOf(plank, { s: todo(), label: '1' }), { missing: 'seconds' })
  // bodyweight alone isn't a weight to write down
  const chins = rowsFor(chin, [todo(), todo(), todo()], [session(6, [chin, [set(15, 7), set(15, 6), set(15, 5)]])], BODY)
  assert.deepEqual(tickOf(chin, chins[2]), { patch: { done: true, reps: 12 } })
})

test('exercises get a card each, except lifts on one belt next to each other', () => {
  assert.deepEqual(cardsOf(5, [[1], [0], [], [4], [3]]), [[0, 1], [2], [3, 4]])
  // belt lifts with something between them keep their own cards, and three in a row share one
  assert.deepEqual(cardsOf(3, [[2], [], [0]]), [[0], [1], [2]])
  assert.deepEqual(
    cardsOf(3, [
      [1, 2],
      [0, 2],
      [0, 1],
    ]),
    [[0, 1, 2]],
  )
  assert.deepEqual(cardsOf(0, []), [])
})

/** Alex's chin-ups and dips, as his 21 November session left them, on one card */
const pair = (chins: SetEntry[], dipSets: SetEntry[], targets?: [Target, Target]) => {
  const before = [session(6, [chin, [set(15, 7), set(15, 6), set(15, 5)]], [dips, [set(12.5, 9), set(12.5, 7), set(12.5, 5), set(undefined, 7, 'drop')]])]
  const items = [
    { exerciseId: chin.id, sets: chins.filter((s) => s.kind === 'working').length, superset: 'x' },
    { exerciseId: dips.id, sets: dipSets.filter((s) => s.kind === 'working').length, superset: 'x' },
  ]
  assert.deepEqual(beltMates(items, lifts), [[1], [0]])
  const plan = planFor(items, lifts, before, { bodyKg: BODY })
  const on: BeltLift[] = [
    { ex: chin, we: live(chin, chins, 'x'), target: targets?.[0] ?? plan[0]!, past: pastOf(chin, before, BODY) },
    { ex: dips, we: live(dips, dipSets, 'x'), target: targets?.[1] ?? plan[1]!, past: pastOf(dips, before, BODY) },
  ]
  return beltCard(on, BODY)
}
const three = () => [todo(), todo(), todo()]
const round = (c: ReturnType<typeof beltCard>, k: number) => c.turns(k).map((t) => [t.n, ...says(t.r).slice(1)])

test('lifts on one belt are laid out a round at a time, the belt typed once for each', () => {
  const card = pair(three(), three())
  assert.equal(card.rounds, 3)
  assert.deepEqual([0, 1, 2].map(card.shared), [true, true, true])
  assert.deepEqual(
    [0, 1, 2].map((k) => round(card, k)),
    [
      [
        [0, 15, 8],
        [1, 15, 8],
      ],
      [
        [0, 5, 10],
        [1, 5, 10],
      ],
      [
        [0, 0, 12],
        [1, 0, 11],
      ],
    ],
  )
  assert.equal(card.on(0), undefined)
  // 17.5 on the belt for the first round, typed on the chin-ups: the dips take it, and both step down from it
  const heavier = pair([todo({ kg: 17.5 }), todo(), todo()], three())
  assert.deepEqual([heavier.on(0), heavier.shared(0)], [17.5, true])
  assert.deepEqual(
    [0, 1, 2].map((k) => round(heavier, k)),
    [
      [
        [0, 17.5, 7],
        [1, 17.5, 7],
      ],
      [
        [0, 7.5, 9],
        [1, 7.5, 9],
      ],
      [
        [0, 0, 12],
        [1, 0, 11],
      ],
    ],
  )
  // ticked on the dips first, the chin-ups still take what's on the belt
  const dipsFirst = pair(three(), [todo({ kg: 15, reps: 8, done: true }), todo(), todo()])
  assert.deepEqual([dipsFirst.on(0), dipsFirst.shared(0), round(dipsFirst, 0)[0]], [15, true, [0, 15, 8]])
})

test('a round keeps a weight each when the lifts were planned apart, or have been given different weights', () => {
  // given different weights by hand: no one box can say both
  const apart = pair([todo({ kg: 17.5 }), todo(), todo()], [todo({ kg: 15 }), todo(), todo()])
  assert.deepEqual([0, 1, 2].map(apart.shared), [false, true, true])
  assert.deepEqual(round(apart, 0), [
    [0, 17.5, 7],
    [1, 15, 8],
  ])
  // planned at different weights (lifts too far apart to share, each on its own target)
  const own = (kg: number): Target => ({ move: 'more', kg, count: 6, perSet: [{ kg, count: 6 }], note: '+1 rep' })
  const far = pair([todo()], [todo()], [own(10), own(20)])
  assert.deepEqual(
    [far.shared(0), round(far, 0)],
    [
      false,
      [
        [0, 10, 6],
        [1, 20, 6],
      ],
    ],
  )
  // a lift with fewer sets sits the last round out, which is then one lift's own
  const uneven = pair(three(), [todo(), todo(), todo(), todo()])
  assert.deepEqual([uneven.rounds, uneven.turns(3).map((t) => t.n), uneven.shared(3)], [4, [1], false])
})

test('a warm-up sits before the round it leads into and a drop set after the one it follows; − takes the last thing off', () => {
  // the chin-ups' second set made a warm-up, and a drop set on the dips after the last round
  const card = pair([todo(), todo({ kind: 'warmup' }), todo(), todo()], [todo(), todo(), todo(), todo({ kind: 'drop' })])
  assert.equal(card.rounds, 3)
  const where = (list: ReturnType<typeof beltCard>['warmups']) => list.map((at) => at.map((t) => `${t.n}${t.r.label}`))
  assert.deepEqual(where(card.warmups), [[], ['0W'], [], []])
  assert.deepEqual(where(card.drops), [[], [], [], ['1D']])
  // the drop set starts as far down as last time's: to bodyweight alone, for seven
  assert.deepEqual(says(card.drops[3][0].r), ['D', undefined, 7])
  // − takes the drop set first, then the last round from both lifts
  assert.deepEqual(
    card.last.map((x) => x.n),
    [1],
  )
  const plain = pair(three(), three())
  assert.deepEqual(
    plain.last.map((x) => x.n),
    [0, 1],
  )
  assert.equal(plain.last[0].id, plain.rows[0][2].s.id)
  assert.deepEqual(pair([], []).last, [])
})

test('a card moves as one and splits into a card each', () => {
  const k = (id: string, superset?: string) => ({ id, superset })
  const list = [k('chin', 'x'), k('dips', 'x'), k('squat'), k('curl')]
  const ids = (l: { id: string; superset?: string }[]) => l.map((x) => `${x.id}${x.superset ? '*' : ''}`)
  // the pair goes under the squat together, still joined; at the top it has nowhere to go up
  assert.deepEqual(ids(moveCard(list, 0, 2, 1)), ['squat', 'chin*', 'dips*', 'curl'])
  assert.equal(moveCard(list, 0, 2, -1), list)
  assert.equal(moveCard(list, 3, 1, 1), list)
  // a card of one moved in between a pair leaves neither of them in a superset
  assert.deepEqual(ids(moveCard(list, 2, 1, -1)), ['chin', 'squat', 'dips', 'curl'])
  let key = 0
  // split, each of the pair is on its own; a third lift in turns with them stays with the second
  assert.deepEqual(ids(splitCard(list, 0, 2, () => `k${key++}`)), ['chin', 'dips', 'squat', 'curl'])
  const giant = [k('chin', 'x'), k('dips', 'x'), k('curl', 'x')]
  const split = splitCard(giant, 0, 2, () => `k${key++}`)
  assert.deepEqual(ids(split), ['chin', 'dips*', 'curl*'])
  assert.equal(split[1].superset, split[2].superset)
})
