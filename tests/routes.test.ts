import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Activity } from '../src/data/types'
import { KY, kxAt } from '../src/lib/ghost'
import { runMapOf } from '../src/lib/routes'

let n = 0
/** a run measured from `at`, its outline starting `from` (metres east and north of `at`) and heading east */
const run = (at: [number, number], from: [number, number], km = 5): Activity =>
  ({
    id: `r${n++}`,
    sport: 'run',
    start: '2026-11-20T08:00:00Z',
    distanceM: km * 1000,
    run: { at, route: Array.from({ length: km * 10 + 1 }, (_, i) => [from[0] + i * 100, from[1] + (i % 3) * 20]).flat() },
  }) as unknown as Activity

const HOME: [number, number] = [51.5, -0.1]

test('every run around home goes on one map, measured from one place', () => {
  const runs = [
    run(HOME, [10, 20]),
    run(HOME, [-40, 0], 10),
    run(HOME, [60, -50], 8),
    // a run that started near home but in the next square north: its outline is moved into home's frame
    run([51.6, -0.1], [0, -Math.round(0.1 * KY) + 30]),
    // a parkrun 3 km away
    run(HOME, [3000, 400]),
  ]
  const map = runMapOf(runs)!
  assert.deepEqual([map.runs, map.km], [5, 33])
  // home is where most of them start, worked out from the starts within 300 m of each other
  assert.ok(Math.abs(map.home![0] - 15) < 40 && Math.abs(map.home![1] + 10) < 40)
  // the run from the next square north starts within a few metres of the others
  assert.ok(Math.abs(map.routes[3][0]) < 50 && Math.abs(map.routes[3][1]) < 60)
  // the box takes in every route: the 10 km one goes furthest east
  assert.deepEqual([map.box[0], map.box[2]], [-40, -40 + 10_000])
})

test('runs from somewhere else are left off the map, and a few runs don’t make one', () => {
  const home = [run(HOME, [0, 0]), run(HOME, [100, 0]), run(HOME, [-100, 50])]
  // a holiday run, a long way off
  const away = run([43.7, 7.2], [0, 0])
  // a run from the next square east that started 20 km from home
  const far = run([51.5, 0.0], [20_000 - Math.round(0.1 * kxAt(51.5)), 0])
  const map = runMapOf([...home, away, far])!
  assert.equal(map.runs, 3)
  // the place most runs are measured from decides, even when the first run listed is somewhere else
  assert.equal(runMapOf([away, ...home])!.runs, 3)
  // with fewer than three there's nothing drawn
  assert.equal(runMapOf(home.slice(0, 2)), undefined)
  // and starts too scattered to call one place home leave the dot off
  const scattered = [run(HOME, [0, 0]), run(HOME, [2000, 0]), run(HOME, [0, 2000])]
  assert.equal(runMapOf(scattered)!.home, undefined)
  // runs with no outline (older than a year) aren't drawn
  assert.equal(runMapOf([...scattered.slice(0, 2), { ...scattered[2], run: { at: HOME } } as Activity]), undefined)
})
