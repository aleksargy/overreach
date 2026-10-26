import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Activity, Stream } from '../src/data/types'
import { biggestGain, coursesOf, gapTo, pathOf, sharedStretch } from '../src/lib/ghost'
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

/** A 1 s stream along straight legs [east, north] in metres, from a start [east, north], at a steady speed. */
function lineRun(id: string, legs: [number, number][], v: number, from: [number, number] = [0, 0]): Stream {
  const pts = [from]
  for (const [dx, dy] of legs) pts.push([pts[pts.length - 1][0] + dx, pts[pts.length - 1][1] + dy])
  const s: Stream = { activityId: id, dt: 1, v: [], d: [], hr: [], lat: [], lon: [] }
  let d = 0
  for (let k = 0; k < legs.length; k++) {
    const len = Math.hypot(...legs[k])
    for (let into = 0; into < len; into += v, d += v) {
      const [x, y] = [pts[k][0] + (legs[k][0] * into) / len, pts[k][1] + (legs[k][1] * into) / len]
      s.v!.push(v)
      s.d!.push(Math.round(d))
      s.hr!.push(150)
      s.lat!.push(51.5 + y / 110_540)
      s.lon!.push(-0.12 + x / (111_320 * Math.cos((51.5 * Math.PI) / 180)))
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
  const courses = coursesOf(you, runs)
  assert.equal(courses.length, 1)
  const [whole] = courses
  assert.deepEqual(
    whole.ghosts.map((g) => g.a.id),
    ['slower', 'long'],
  )
  assert.ok(whole.from === 0 && whole.to > 4900, `${whole.from}–${whole.to}`)
  // the detour cuts what the loops share in two, and neither half is long enough to race
  const spur = sharedStretch(you.run!, runs[5].run!)!
  assert.ok(spur.mine[spur.mine.length - 1] - spur.mine[0] < 3000)

  const p = pathOf(streams.you)!
  const [slower, long] = whole.ghosts
  const gap = gapTo(p, pathOf(streams.slower)!, slower, whole)
  // 5000/3.4 − 5000/3.6 = 81.7 s ahead at the line, gained evenly
  assert.ok(Math.abs(gap[gap.length - 1].s - 81.7) < 2, `gap ${gap[gap.length - 1].s}`)
  assert.ok(Math.abs(biggestGain(gap)!.s - 16.3) < 1)
  // by place, the watch that measured long is just slower: 5000/3.5 − 5000/3.6 = 39.7 s at the line, half that halfway
  const vsLong = gapTo(p, pathOf(streams.long)!, long, whole)
  assert.ok(Math.abs(vsLong[vsLong.length - 1].s - 39.7) < 2, `gap ${vsLong[vsLong.length - 1].s}`)
  assert.ok(Math.abs(vsLong[25].s - 19.8) < 2, `halfway ${vsLong[25].s}`)
})

test('ghosts race you over the stretches you both ran, when they are long enough', () => {
  const on = (day: number) => `2026-10-${day}T09:00:00`
  const streams = {
    // you: 4 km east, then 2 km north
    you: lineRun(
      'you',
      [
        [4000, 0],
        [0, 2000],
      ],
      3.6,
    ),
    // the same way out, then south: 4 km shared
    south: lineRun(
      'south',
      [
        [4000, 0],
        [0, -2000],
      ],
      3.5,
    ),
    // joined 1 km in, then the same way: 5 km shared
    joined: lineRun(
      'joined',
      [
        [3000, 0],
        [0, 2000],
      ],
      3.4,
      [1000, 0],
    ),
    // 2 km shared: too short to race
    short: lineRun(
      'short',
      [
        [2000, 0],
        [0, -4000],
      ],
      3.5,
    ),
    // all of it
    same: lineRun(
      'same',
      [
        [4000, 0],
        [0, 2000],
      ],
      3.5,
    ),
    // the same roads the other way
    back: lineRun(
      'back',
      [
        [0, -2000],
        [-4000, 0],
      ],
      3.6,
      [4000, 2000],
    ),
  }
  const summed = (id: keyof typeof streams, day: number) => run(id, streams[id], on(day), { run: summariseRun(streams[id]) })
  const you = summed('you', 24)
  const runs = [you, summed('south', 20), summed('joined', 19), summed('short', 18), summed('same', 17), summed('back', 16)]
  const courses = coursesOf(you, runs)
  // the whole run with the one that ran all of it; from 1 km with the one that joined there too; the first 4 km with the one that turned south
  assert.deepEqual(
    courses.map((c) => [Math.round(c.from / 100) / 10, Math.round(c.to / 100) / 10, c.ghosts.map((g) => g.a.id)]),
    [
      [0, 6, ['same']],
      [1, 6, ['joined', 'same']],
      [0, 4, ['south', 'same']],
    ],
  )
  // over the stretch from 1 km, both clocks start where it does: 5000/3.4 − 5000/3.6 = 81.7 s at the end
  const joined = courses[1]
  const gap = gapTo(pathOf(streams.you)!, pathOf(streams.joined)!, joined.ghosts[0], joined)
  assert.ok(Math.abs(gap[0].s) < 1 && Math.abs(gap[gap.length - 1].s - 81.7) < 2, `gap ${gap[0].s} to ${gap[gap.length - 1].s}`)
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
