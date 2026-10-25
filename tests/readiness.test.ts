import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Activity, Daily } from '../src/data/types'
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
  assert.match(r.verdict, /^Yesterday’s 32 km run \(training effect 4\.4\) needs another day or two\. Rest today/)
  assert.doesNotMatch(r.verdict, /hard session|go hard/i)
})

test('with nothing left to absorb and a good night, it’s a green light, and no plan is guessed', () => {
  const r = readiness(nights(), usual, 1.0, NOW)!
  assert.equal(r.strain, undefined)
  assert.equal(r.tone, 'good')
  assert.match(r.verdict, /A good day for a hard session\.$/)
  assert.doesNotMatch(r.verdict, /tonight|your run/)
})

test('a solid session yesterday only keeps it off a green light', () => {
  const tempo = run('tempo', 20, { load: 120, garmin: { load: 120, aerobicTE: 3.4 } })
  const r = readiness(nights(), [...usual, tempo], 1.0, NOW)!
  assert.equal(r.strain?.needH, 24)
  assert.equal(r.tone, 'ok')
})

test('HRV under Garmin’s baseline pulls readiness down and says so', () => {
  const r = readiness(nights({ hrv: 46, hrvStatus: 'UNBALANCED' }), usual, 1.0, NOW)!
  const hrv = r.factors.find((f) => f.key === 'hrv')!
  assert.deepEqual([hrv.lo, hrv.hi], [55, 70])
  assert.ok(hrv.score < 50, `HRV scored ${hrv.score}`)
  assert.equal(hrv.note, 'HRV is down at 46 ms, under your Garmin baseline (Garmin says unbalanced)')
})

test('sleep is judged against the sleep Garmin says you needed', () => {
  const r = readiness(nights({ sleepS: 7 * 3600, sleepNeedS: 8 * 3600 + 600 }), usual, 1.0, NOW)!
  assert.equal(r.factors.find((f) => f.key === 'sleep')!.note, '7h00 of sleep, 70 min short of what Garmin says you needed')
})

test('recovery follows Garmin’s training-effect bands, or the load against your usual session', () => {
  const at = (te: number, load = 80) => recoveryNeedH(run('x', 1, { load, garmin: { load, aerobicTE: te } }), 80)
  assert.deepEqual([at(2.6), at(3.2), at(4.1), at(5)], [0, 24, 48, 72])
  // a very long easy run Garmin rated modestly still counts by its load
  assert.equal(at(2.9, 170), 48)
  assert.equal(at(2.9, 250), 72)
})
