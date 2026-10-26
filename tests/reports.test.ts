import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Activity, Stream } from '../src/data/types'
import { align, bestStretch, courseOf, gapTo, ghostsOf, pathOf } from '../src/lib/ghost'
import { blockOf, weeklyMix } from '../src/lib/mix'
import { raceReport, racesIn } from '../src/lib/race'
import { summariseRun } from '../src/lib/running'

const DAY = 86_400_000

/**
 * A 1 s stream along a circle, at the given speed for each stretch [metres, m/s]: the circle is the whole
 * distance unless given, and can be run the other way round, moved east, measured long by the watch, or
 * broken by a spur out and back [how far round, how far out].
 */
function loopRun(
  id: string,
  stretches: [number, number][],
  opts: { circumference?: number; east?: number; hr?: (m: number) => number; measure?: number; reverse?: boolean; spur?: [number, number] } = {},
): Stream {
  const spur = opts.spur ?? [0, 0]
  const C = opts.circumference ?? stretches.reduce((a, [m]) => a + m, 0) - 2 * spur[1]
  const R = C / (2 * Math.PI)
  const s: Stream = { activityId: id, dt: 1, v: [], d: [], hr: [], lat: [], lon: [] }
  let d = 0
  for (const [len, v] of stretches) {
    for (const end = d + len; d < end; d += v) {
      // how far round the circle, and how far out along the spur
      const into = d - spur[0]
      const round = into <= 0 ? d : into < 2 * spur[1] ? spur[0] : d - 2 * spur[1]
      const out = into > 0 && into < 2 * spur[1] ? spur[1] - Math.abs(into - spur[1]) : 0
      const a = (round / C) * 2 * Math.PI * (opts.reverse ? -1 : 1)
      s.v!.push(v)
      s.d!.push(Math.round(d * (opts.measure ?? 1)))
      s.hr!.push(opts.hr ? opts.hr(d) : 150)
      s.lat!.push(51.5 + ((R + out) * Math.sin(a)) / 110_540)
      s.lon!.push(-0.12 + ((opts.east ?? 0) + R - (R + out) * Math.cos(a)) / (111_320 * Math.cos((51.5 * Math.PI) / 180)))
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

test('ghosts are your earlier runs on the same route the same way round, matched by place from the summaries', () => {
  const on = (day: number) => `2026-10-${day}T09:00:00`
  const streams = {
    you: loopRun('you', [[5000, 3.6]]),
    slower: loopRun('slower', [[5000, 3.4]]),
    long: loopRun('long', [[5000, 3.5]], { measure: 1.03 }),
    back: loopRun('back', [[5000, 3.6]], { reverse: true }),
    off: loopRun('off', [[5000, 3.6]], { east: 300 }),
    spur: loopRun('spur', [[5240, 3.6]], { spur: [2500, 120] }),
    later: loopRun('later', [[5000, 3.6]]),
    short: loopRun('short', [[3000, 3.6]]),
  }
  const summed = (id: keyof typeof streams, day: number) => run(id, streams[id], on(day), { run: summariseRun(streams[id]) })
  const you = summed('you', 24)
  const runs = [
    you,
    summed('slower', 17),
    // a watch that measures 3% long is still the same route
    summed('long', 15),
    // the same loop the other way round, a loop 300 m east, and the same loop with a detour halfway: no ghosts
    summed('back', 14),
    summed('off', 13),
    summed('spur', 12),
    // nor is a run after this one, a shorter run, or one without an outline (summarised before ghosts, or over a year ago)
    summed('later', 25),
    summed('short', 11),
    run('old', streams.you, on(10)),
  ]
  assert.deepEqual(
    ghostsOf(you, runs).map((x) => x.id),
    ['slower', 'long'],
  )
  // the detour is most of the way on the route, but the ghost would gain 240 m on it
  const detour = align(you.run!, runs[5].run!)!
  assert.ok(Math.min(...detour.shared) >= 0.9 && detour.detour > 150, `shared ${detour.shared}, detour ${detour.detour}`)

  const p = pathOf(streams.you)!
  const q = pathOf(streams.slower)!
  const gap = gapTo(p, q, courseOf(p, q, you.run!, runs[1].run!)!)
  // 5000/3.4 − 5000/3.6 = 81.7 s ahead at the line, gained evenly
  assert.ok(Math.abs(gap[gap.length - 1].s - 81.7) < 2, `gap ${gap[gap.length - 1].s}`)
  assert.ok(Math.abs(bestStretch(gap)!.s - 16.3) < 1)
  // by place, the watch that measured long is just slower: 5000/3.5 − 5000/3.6 = 39.7 s at the line, half that halfway
  const l = pathOf(streams.long)!
  const vsLong = gapTo(p, l, courseOf(p, l, you.run!, runs[2].run!)!)
  assert.ok(Math.abs(vsLong[vsLong.length - 1].s - 39.7) < 2, `gap ${vsLong[vsLong.length - 1].s}`)
  assert.ok(Math.abs(vsLong[25].s - 19.8) < 2, `halfway ${vsLong[25].s}`)
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
