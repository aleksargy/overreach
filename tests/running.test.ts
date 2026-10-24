import assert from 'node:assert/strict'
import { test } from 'node:test'
import { weatherFor } from '../netlify/lib/weather'
import { buildSample, SAMPLE_PROFILE } from '../src/data/sample'
import type { Activity } from '../src/data/types'
import { BEST_S, criticalSpeed, runModel, summariseRun } from '../src/lib/running'
import { fakeGarmin } from './fake-garmin'

const DAY = 86_400_000

test('boils a run down to minutes of pace, heart rate and grade, plus best efforts', () => {
  // 30 minutes at 3 m/s sampled every 2 s, climbing 2% from minute 10 to 20 and surging to 4 m/s from 22 to 27, then a 3 minute stop
  const dt = 2
  const v: number[] = []
  const alt: number[] = []
  let a = 10
  for (let i = 0; i < 33 * 30; i++) {
    const min = (i * dt) / 60
    const sp = min >= 30 ? 0 : min >= 22 && min < 27 ? 4 : 3
    if (min >= 10 && min < 20) a += sp * dt * 0.02
    v.push(sp)
    alt.push(a)
  }
  const s = summariseRun({ activityId: 'x', dt, v, hr: v.map((x) => (x ? 140 : 0)), alt, lat: v.map(() => 51.53), lon: v.map(() => -0.11) })!
  // the stop isn't a minute of running
  assert.equal(s.spd.length, 30)
  assert.ok(Math.abs(s.grade[15] - 2) < 0.2, `grade ${s.grade[15]}`)
  assert.equal(s.grade[5], 0)
  assert.equal(s.spd[24], 4)
  assert.equal(s.hr[3], 140)
  assert.equal(s.best[BEST_S.indexOf(300)], 4)
  assert.equal(s.best[BEST_S.indexOf(3600)], 0)
  // only a rough location is kept
  assert.deepEqual(s.at, [51.5, -0.1])
})

test('finds critical speed and D′ from the best efforts of the last 90 days, and predicts races from them', () => {
  const now = Date.parse('2026-10-24T09:00:00Z')
  const run = (id: string, daysAgo: number, f: number) =>
    ({
      id,
      sport: 'run',
      start: new Date(now - daysAgo * DAY).toISOString(),
      run: { spd: [], hr: [], grade: [], best: BEST_S.map((s) => (s <= 1200 ? (4 + 200 / s) * f : 0)) },
    }) as unknown as Activity
  const r = criticalSpeed([run('a', 10, 1), run('b', 20, 0.97), run('old', 200, 1.1)], new Date(now))!
  assert.ok(Math.abs(r.cs - 4) < 0.005, `cs ${r.cs}`)
  assert.ok(Math.abs(r.dPrime - 200) < 1, `D′ ${r.dPrime}`)
  // 5K: D′ spent on top of critical speed, (5000 − 200) / 4
  assert.equal(Math.round(r.predictions[0].s), 1200)
  assert.ok(r.envelope.every((e) => e.id === 'a'))
})

test('reads heat, hills, football and fitness back out of runs made with them', () => {
  const now = new Date('2026-10-24T18:00:00')
  const m = runModel(buildSample(now, SAMPLE_PROFILE).activities, SAMPLE_PROFILE, now)!
  // the sample runner's heart pays 0.7 bpm per °C above 12, and 4 bpm within 36 hours of football
  assert.ok(Math.abs(m.heat!.bpmPerC - 0.7) < 0.25, `heat ${m.heat?.bpmPerC}`)
  assert.ok(Math.abs(m.football!.bpm - 4) < 1.5, `football ${m.football?.bpm}`)
  assert.ok(m.football!.clear)
  // climbing costs them 3.5% per 1% of grade: about 12 s/km at their easy pace
  assert.ok(m.hills!.upS > 8 && m.hills!.upS < 16, `uphill ${m.hills?.upS}`)
  assert.ok(m.hills!.downS > 2 && m.hills!.downS < m.hills!.upS, `downhill ${m.hills?.downS}`)
  // fitness builds through the autumn: faster at the same heart rate
  assert.ok(m.engineNow!.change! < -4, `engine ${m.engineNow?.change}`)
  // the parkruns pin critical speed near their pace
  assert.ok(m.cs!.solid && m.cs!.cs > 3.9 && m.cs!.cs < 4.3, `cs ${m.cs?.cs}`)
  // and heart rate holds for longer on long runs
  const d = m.durability!
  assert.ok(d.first && d.latest.onset! > d.first.onset!, JSON.stringify(d.curves.map((c) => [c.date, c.onset])))
})

test('asks the weather service once per place and service, and reads the hour each run was in', async () => {
  const fake = fakeGarmin()
  const got = await weatherFor(
    [
      { id: 'early', at: [51.5, -0.1], time: '2026-08-01T05:40:00Z' },
      { id: 'late', at: [51.5, -0.1], time: '2026-08-20T14:10:00Z' },
      { id: 'paris', at: [48.9, 2.3], time: '2026-10-23T08:00:00Z' },
    ],
    { fetch: fake.fetch, now: new Date('2026-10-24T09:00:00Z') },
  )
  assert.equal(fake.calls['/v1/archive'], 1)
  assert.equal(fake.calls['/v1/forecast'], 1)
  assert.equal(got.size, 3)
  assert.ok(got.get('late')!.tempC > got.get('early')!.tempC)
  assert.ok(got.get('paris')!.dewC! < got.get('paris')!.tempC)
})
