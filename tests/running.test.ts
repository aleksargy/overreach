import assert from 'node:assert/strict'
import { test } from 'node:test'
import { weatherFor } from '../netlify/lib/weather'
import { buildSample, SAMPLE_PROFILE } from '../src/data/sample'
import type { Activity } from '../src/data/types'
import { BEST_M, BEST_S, bestsOf, distanceBests, runModel, summariseRun } from '../src/lib/running'
import { fakeGarmin } from './fake-garmin'

test('boils a run down to minutes of pace, heart rate and grade, plus best efforts and an outline', () => {
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
  // 30 minutes at 3 to 4 m/s is 5.7 km: a best 1 km and 5 km, nothing longer
  assert.deepEqual(
    s.bestD!.map((x) => x > 0),
    [true, true, false, false, false],
  )
  assert.equal(s.bestD![0], 250)
})

test('keeps a run’s fastest time over each distance, by the clock, and a race at its finish time', () => {
  // 6.8 km on a watch that logs every 4 s: 2.4 km at 3 m/s, a 90 s stop, 3.2 km at 4 m/s, then 1.2 km at 3 m/s
  const dt = 4
  const d: number[] = [0]
  const leg = (m: number, v: number) => {
    for (const end = d[d.length - 1] + m; d[d.length - 1] < end;) d.push(d[d.length - 1] + v * dt)
  }
  leg(2400, 3)
  for (let i = 0; i < 90 / dt; i++) d.push(d[d.length - 1])
  leg(3200, 4)
  leg(1200, 3)
  const best = distanceBests({ activityId: 'x', dt, d })
  // the quickest kilometre is inside the fast stretch
  assert.ok(Math.abs(best[BEST_M.indexOf(1000)] - 250) <= 1, `1 km ${best[0]}`)
  // the quickest 5 km takes the fast 3.2 km (800 s) and the 1.2 km after it (400 s), so it has to reach back
  // 600 m (200 s) across the stop, and the stop counts (88 s of standing still between samples)
  assert.ok(Math.abs(best[BEST_M.indexOf(5000)] - (800 + 400 + 200 + 88)) <= 4, `5 km ${best[1]}`)
  assert.equal(best[BEST_M.indexOf(10_000)], 0)

  const run = (id: string, start: string, distanceM: number, durationS: number, bestD: number[]) =>
    ({ id, sport: 'run', start, distanceM, durationS, run: { spd: [], hr: [], grade: [], best: [], bestD } }) as unknown as Activity
  const tempo = run('tempo', '2026-09-01T07:00:00', 8000, 2400, [230, 1210, 0, 0, 0])
  // the watch made the parkrun 5.06 km and would hand it 19:28 for 5 km; it counts at the finish time
  const parkrun = run('parkrun', '2026-10-24T09:00:00', 5060, 1180, [225, 1168, 0, 0, 0])
  const bests = bestsOf([tempo, parkrun], [parkrun])
  assert.deepEqual(
    bests.map((b) => [b.k, b.s, b.id]),
    [
      [0, 225, 'parkrun'],
      [1, 1180, 'parkrun'],
    ],
  )
  // not marked as a race, the same run is taken at the watch's word
  assert.equal(bestsOf([tempo, parkrun])[1].s, 1168)
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
