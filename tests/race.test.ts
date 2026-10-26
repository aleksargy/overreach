import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Activity } from '../src/data/types'
import { goalPaceS, parseGoal, taperShare, typeGoal, weeklyKm } from '../src/lib/race'
import { hrAtPace, type RunModel } from '../src/lib/running'

const MARATHON = 42_195

test('reads a goal time the way you’d write it', () => {
  assert.equal(parseGoal('3:30', MARATHON), 12_600)
  assert.equal(parseGoal('3:29:59', MARATHON), 12_599)
  assert.equal(parseGoal('1:40', 21_097.5), 6000)
  // below a half, two parts are minutes and seconds
  assert.equal(parseGoal('19:30', 5000), 1170)
  assert.equal(parseGoal('soon', MARATHON), undefined)
  assert.equal(parseGoal('3:75', MARATHON), undefined)
})

test('a goal typed on a number pad gets its colons', () => {
  const steps = (digits: string, m: number) => [...digits].map((_, i) => typeGoal(digits.slice(0, i + 1), m))
  assert.deepEqual(steps('33000', MARATHON), ['3', '3:3', '3:30', '3:30:0', '3:30:00'])
  assert.deepEqual(steps('1930', 5000), ['1', '19', '19:3', '19:30'])
  assert.equal(typeGoal('10500', 10_000), '1:05:00')
  // pasted or typed with colons, and too many digits
  assert.equal(typeGoal('3:29:59', MARATHON), '3:29:59')
  assert.equal(typeGoal('1234567', MARATHON), '12:34:56')
  assert.equal(parseGoal(typeGoal('330', MARATHON), MARATHON), 12_600)
})

test('goal pace rounds down, so running it still makes the goal', () => {
  // 3:30 is 4:58.6 a km: 4:59 would finish over
  assert.equal(goalPaceS({ date: '2026-11-08', distanceM: MARATHON, goalS: 12_600 }), 298)
  assert.equal(goalPaceS({ date: '2026-11-08', distanceM: MARATHON }), undefined)
})

test('weekly km counts runs in 7-day blocks back from now', () => {
  const now = new Date('2026-10-25T12:00:00Z')
  const run = (daysAgo: number, km: number, sport: Activity['sport'] = 'run') =>
    ({ sport, distanceM: km * 1000, start: new Date(now.getTime() - daysAgo * 86_400_000).toISOString() }) as Activity
  assert.deepEqual(weeklyKm([run(1, 32), run(5, 14), run(9, 30), run(10, 12, 'ride'), run(40, 10)], now, 3), [46, 30, 0])
})

test('a taper narrows towards race day, and only for the weeks it covers', () => {
  assert.deepEqual(taperShare(20, MARATHON), [0.75, 0.85])
  assert.deepEqual(taperShare(14, MARATHON), [0.6, 0.75])
  assert.deepEqual(taperShare(5, MARATHON), [0.4, 0.5])
  assert.equal(taperShare(30, MARATHON), undefined)
  assert.deepEqual(taperShare(10, 21_097.5), [0.75, 0.85])
  assert.equal(taperShare(10, 5000), undefined)
  assert.deepEqual(taperShare(3, 5000), [0.6, 0.8])
  assert.equal(taperShare(-1, MARATHON), undefined)
})

test('heart rate at goal pace comes from your own slopes and drift', () => {
  const m = { refHr: 145, slopes: { v: 22.4, up: 1, dn: 0, t: 0.0427 }, engineNow: { v: 3.012 } } as unknown as RunModel
  // 3:30 pace is 3.349 m/s: 0.337 faster than the engine, 7.5 bpm more, then drift for 190 more minutes
  assert.deepEqual(hrAtPace(m, MARATHON / 12_600, 210), { settled: 153, end: 161 })
  assert.equal(hrAtPace({ ...m, engineNow: undefined }, 3.3, 210), undefined)
})
