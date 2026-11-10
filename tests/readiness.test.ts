import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Activity, Daily } from '../src/data/types'
import { heartRatesFrom } from '../src/lib/load'
import { readiness, recoveryNeedH } from '../src/lib/readiness'

const HOUR = 3_600_000
const NOW = new Date('2026-10-29T08:00:00Z')
const day = (i: number) => new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10)

/** 29 ordinary nights ending this morning, with Garmin's baseline and sleep need, then whatever today changes. */
function nights(today: Partial<Daily> = {}): Daily[] {
  const out: Daily[] = Array.from({ length: 29 }, (_, i) => ({
    date: day(i),
    hrv: 60 + (i % 5),
    rhr: 48 + (i % 3),
    sleepS: 7.6 * 3600 + (i % 4) * 600,
    sleepScore: 80,
    bbHigh: 75 + (i % 6),
    hrvLow: 55,
    hrvHigh: 70,
    sleepNeedS: 8 * 3600,
  }))
  out[28] = { ...out[28], hrv: 66, rhr: 46, sleepS: 8.1 * 3600, sleepScore: 86, bbHigh: 88, ...today }
  return out
}

const run = (id: string, startedHoursAgo: number, over: Partial<Activity> = {}): Activity => ({
  id,
  source: 'garmin',
  sport: 'run',
  name: 'Run',
  start: new Date(NOW.getTime() - startedHoursAgo * HOUR).toISOString(),
  durationS: 3000,
  distanceM: 10_000,
  zoneS: [0, 0, 0, 0, 0],
  load: 80,
  hasStream: true,
  garmin: { load: 80, aerobicTE: 2.7 },
  ...over,
})

/** a run every other day for six weeks, finishing four days ago: your usual session */
const usual = Array.from({ length: 20 }, (_, i) => run(`u${i}`, (4 + i * 2) * 24))

test('a big session yesterday holds readiness down, however good the night was', () => {
  const long = run('long', 22, { distanceM: 32_000, durationS: 9900, load: 260, garmin: { load: 260, aerobicTE: 4.4, anaerobicTE: 0.5 } })
  const r = readiness(nights(), [...usual, long], 1.05, NOW)!
  assert.equal(r.tone, 'bad')
  assert.ok(r.score <= 40, `score ${r.score}`)
  assert.equal(r.strain?.name, 'yesterday’s 32 km run')
  assert.equal(r.strain?.needH, 72)
  // the sentence is there to name the session, and that's all it does
  assert.equal(r.verdict, 'Yesterday’s 32 km run needs another day or two.')
})

test('with nothing left to absorb and a good night, it’s a green light, and the label is all it says', () => {
  const r = readiness(nights(), usual, 1.0, NOW)!
  assert.equal(r.strain, undefined)
  assert.equal(r.tone, 'good')
  assert.equal(r.label, 'Green light')
  // no stock sentence about the best number of the night
  assert.equal(r.verdict, undefined)
})

test('a solid session yesterday only keeps it off a green light', () => {
  const tempo = run('tempo', 20, { load: 120, garmin: { load: 120, aerobicTE: 3.4 } })
  const r = readiness(nights(), [...usual, tempo], 1.0, NOW)!
  assert.equal(r.strain?.needH, 24)
  assert.equal(r.tone, 'ok')
})

test('HRV under Garmin’s baseline pulls readiness down', () => {
  const r = readiness(nights({ hrv: 46, hrvStatus: 'UNBALANCED' }), usual, 1.0, NOW)!
  const hrv = r.factors.find((f) => f.key === 'hrv')!
  assert.deepEqual([hrv.lo, hrv.hi], [55, 70])
  assert.ok(hrv.score < 50, `HRV scored ${hrv.score}`)
})

test('sleep is judged against the sleep Garmin says you needed', () => {
  const short = readiness(nights({ sleepS: 7 * 3600, sleepNeedS: 8 * 3600 + 600 }), usual, 1.0, NOW)!
  const enough = readiness(nights({ sleepS: 7 * 3600, sleepNeedS: 7 * 3600 }), usual, 1.0, NOW)!
  const sleep = (r: typeof short) => r.factors.find((f) => f.key === 'sleep')!
  // the same seven hours scores lower when Garmin says you needed 70 minutes more
  assert.ok(sleep(short).score < sleep(enough).score - 10, `${sleep(short).score} against ${sleep(enough).score}`)
  assert.equal(sleep(short).display, '7h00')
})

test('recovery follows Garmin’s training-effect bands, or the load against your usual session', () => {
  const at = (te: number, load = 80) => recoveryNeedH(run('x', 1, { load, garmin: { load, aerobicTE: te } }), 80)
  assert.deepEqual([at(2.6), at(3.2), at(4.1), at(5)], [0, 24, 48, 72])
  // a very long easy run Garmin rated modestly still counts by its load
  assert.equal(at(2.9, 170), 48)
  assert.equal(at(2.9, 250), 72)
})

test('max and resting heart rate come from what the watch measured when Garmin’s settings don’t say', () => {
  // resting: the middle of the last 28 mornings; September's are too old to count
  const mornings: Pick<Daily, 'date' | 'rhr'>[] = [
    ...Array.from({ length: 20 }, (_, i) => ({ date: new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10), rhr: 60 })),
    ...Array.from({ length: 9 }, (_, i) => ({ date: day(20 + i), rhr: [46, 47, 47, 48, 48, 48, 49, 50, 52][i] })),
  ]
  const run = (daysAgo: number, maxHr?: number) => ({ start: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(), maxHr })
  // max: one spike from a loose strap doesn't count, a year-old reading neither
  const runs = [run(3, 214), run(9, 188), run(20, 186), run(40, 179), run(400, 199), run(2)]
  assert.deepEqual(heartRatesFrom(mornings, runs, NOW), { hrMax: 188, hrRest: 48 })
  // too little to go on says nothing
  assert.deepEqual(heartRatesFrom(mornings.slice(0, 3), runs.slice(0, 2), NOW), {})
})
