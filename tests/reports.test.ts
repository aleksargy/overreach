import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Activity, Stream } from '../src/data/types'
import { bestStretch, gapTo, ghostCandidates, pathOf, sameRoute } from '../src/lib/ghost'
import { blockOf, weeklyMix } from '../src/lib/mix'
import { raceReport, racesIn } from '../src/lib/race'

const DAY = 86_400_000

/** A 1 s stream along a circle of the given circumference, at the given speed for each stretch [metres, m/s]. */
function loopRun(id: string, stretches: [number, number][], opts: { circumference?: number; east?: number; hr?: (m: number) => number; measure?: number } = {}): Stream {
  const C = opts.circumference ?? stretches.reduce((a, [m]) => a + m, 0)
  const R = C / (2 * Math.PI)
  const s: Stream = { activityId: id, dt: 1, v: [], d: [], hr: [], lat: [], lon: [] }
  let d = 0
  for (const [len, v] of stretches) {
    for (const end = d + len; d < end; d += v) {
      const a = (d / C) * 2 * Math.PI
      s.v!.push(v)
      s.d!.push(Math.round(d * (opts.measure ?? 1)))
      s.hr!.push(opts.hr ? opts.hr(d) : 150)
      s.lat!.push(51.5 + (R * Math.sin(a)) / 110_540)
      s.lon!.push(-0.12 + ((opts.east ?? 0) + R * (1 - Math.cos(a))) / (111_320 * Math.cos((51.5 * Math.PI) / 180)))
    }
  }
  return s
}

const run = (id: string, s: Stream, start: string, extra: Partial<Activity> = {}) =>
  ({ id, sport: 'run', start, durationS: s.v!.length, distanceM: s.d![s.d!.length - 1], hasStream: true, zoneS: [0, 0, 0, 0, 0], ...extra }) as Activity

test('a race report splits the race, finds where the pace went and says how it went against the goal', () => {
  // 5 km at 4 m/s, then 5 km at 3.6 m/s, on a watch that measures 1% long
  const s = loopRun(
    'r',
    [
      [5000, 4],
      [5000, 3.6],
    ],
    { measure: 1.01 },
  )
  const a = run('r', s, '2026-11-01T09:00:00')
  const r = raceReport(a, s, { race: { date: '2026-11-01', distanceM: 10_000, goalS: 45 * 60 }, earlier: [], name: 'Alex' })!
  assert.equal(r.splits.length, 10)
  assert.ok(Math.abs(r.halves[0] - 1250) <= 2 && Math.abs(r.halves[1] - 1389) <= 2, `halves ${r.halves}`)
  // the slow second half starts right at halfway
  assert.equal(r.fadeM, 5000)
  // the gap at the line is the time inside the goal
  assert.ok(Math.abs(r.gap[r.gap.length - 1].s - (2700 - a.durationS)) < 1)
  assert.equal(r.headline, `Sub-45:00! Alex beats the clock by 1:01`)
})

test('races are runs marked as a race, and the run on the day of the race you set', () => {
  const s = loopRun('x', [[10_000, 3.5]])
  const marked = run('parkrun', s, '2026-10-24T09:00:00', { kind: 'race' })
  const onTheDay = run('marathon', s, '2026-11-08T09:00:00', { distanceM: 42_600 })
  const shakeout = run('shakeout', s, '2026-11-08T07:00:00', { distanceM: 3000 })
  const other = run('long', s, '2026-11-01T09:00:00', { distanceM: 42_600 })
  assert.deepEqual(
    racesIn([marked, onTheDay, shakeout, other], { date: '2026-11-08', distanceM: 42_195 }).map((a) => a.id),
    ['parkrun', 'marathon'],
  )
})

test('ghosts on the same loop race you; a different loop is no ghost', () => {
  const you = loopRun('you', [[5000, 3.6]])
  const slower = loopRun('then', [[5000, 3.4]])
  const elsewhere = loopRun('there', [[5000, 3.6]], { east: 600 })
  const [p, q, z] = [pathOf(you)!, pathOf(slower)!, pathOf(elsewhere)!]
  assert.ok(sameRoute(p, q))
  assert.ok(!sameRoute(p, z))
  const gap = gapTo(p, q)
  // 5000/3.4 − 5000/3.6 = 81.7 s ahead at the line, gained evenly
  assert.ok(Math.abs(gap[gap.length - 1].s - 81.7) < 2, `gap ${gap[gap.length - 1].s}`)
  assert.ok(Math.abs(bestStretch(gap)!.s - 16.3) < 1)
  // candidates come from distance and where the runs started, before any stream is loaded
  const a = run('you', you, '2026-10-24T09:00:00', { run: { spd: [], hr: [], grade: [], best: [], at: [51.5, -0.1] } })
  const near = run('then', slower, '2026-10-17T09:00:00', { run: { spd: [], hr: [], grade: [], best: [], at: [51.5, -0.1] } })
  const far = run('far', slower, '2026-10-10T09:00:00', { run: { spd: [], hr: [], grade: [], best: [], at: [53.4, -2.2] } })
  const short = run('short', loopRun('short', [[3000, 3.6]]), '2026-10-03T09:00:00')
  assert.deepEqual(
    ghostCandidates(a, [a, near, far, short]).map((x) => x.id),
    ['then'],
  )
})

test('easy is zones 1 to 3, and a block is measured against the weeks it covers', () => {
  const now = new Date('2026-10-26T12:00:00')
  const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * DAY).toISOString()
  const r = (daysAgo: number, zoneS: Activity['zoneS'], durationS = 3600, distanceM = 10_000) =>
    ({ id: `${daysAgo}`, sport: 'run', start: at(daysAgo), zoneS, durationS, distanceM }) as Activity
  const runs = [r(1, [600, 1200, 1200, 600, 0]), r(3, [0, 0, 3000, 0, 600], 6000, 20_000), r(20, [0, 3600, 0, 0, 0]), r(80, [0, 3600, 0, 0, 0])]
  const weeks = weeklyMix(runs, now, 4)
  // Monday 26 Oct starts this week, so the runs from the last few days fall in the week before
  assert.deepEqual([weeks[3].easyS, weeks[3].tempoS, weeks[3].hardS], [0, 0, 0])
  assert.deepEqual([weeks[2].easyS, weeks[2].tempoS, weeks[2].hardS], [6000, 600, 600])
  assert.deepEqual([weeks[0].easyS, weeks[0].tempoS, weeks[0].hardS], [3600, 0, 0])
  const b = blockOf(runs, new Date(now.getTime() - 56 * DAY), now)
  assert.equal(b.runs, 3)
  assert.equal(b.longRuns, 1)
  assert.equal(Math.round(b.easy * 100), 89)
  assert.equal(Math.round(b.kmPerWeek * 10) / 10, 5)
})
