import assert from 'node:assert/strict'
import { test } from 'node:test'
import { goalPaceS, parseGoal, typeGoal } from '../src/lib/race'

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
