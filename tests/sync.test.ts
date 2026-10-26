import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fitFromDownload, footballSummary, streamFromFit } from '../netlify/lib/fit'
import { garmin } from '../netlify/lib/garmin'
import { memoryKV } from '../netlify/lib/kv'
import { FOOTBALL_SUMMARY } from '../src/lib/football'
import { detailOf, foldHrv, foldSleep, gmtToIso, hrProfile, mapActivity, sportOf } from '../netlify/lib/mapping'
import { HISTORY_DAYS, loadAll, RUN_DAYS, runStep, type StepResult } from '../netlify/lib/sync'
import { BEST_S } from '../src/lib/running'
import type { Daily, Stream } from '../src/data/types'
import { fakeGarmin, footballFit } from './fake-garmin'

async function syncToEnd(kv: ReturnType<typeof memoryKV>, fake: ReturnType<typeof fakeGarmin>, maxSteps = 40) {
  const api = garmin('test-key', kv, { fetch: fake.fetch })
  const steps: StepResult[] = []
  for (let i = 0; i < maxSteps; i++) {
    const r = await runStep({ kv, api, budgetMs: 25_000, now: fake.now, forceRecent: i === 0, fetch: fake.fetch })
    steps.push(r)
    if (r.done || r.paused) break
  }
  return steps
}

test('maps Garmin sports, including football logged as Other', () => {
  assert.equal(sportOf('running'), 'run')
  assert.equal(sportOf('trail_running'), 'run')
  assert.equal(sportOf('road_biking'), 'ride')
  assert.equal(sportOf('indoor_cycling'), 'ride')
  assert.equal(sportOf('lap_swimming'), 'swim')
  assert.equal(sportOf('soccer'), 'football')
  assert.equal(sportOf('american_football'), 'other')
  assert.equal(sportOf('strength_training'), 'strength')
  assert.equal(sportOf('other', 'Tuesday 5-a-side'), 'football')
  assert.equal(sportOf('walking', 'Walk to football'), 'football')
  assert.equal(sportOf('walking', 'Evening walk'), 'other')
})

test('reads Garmin GMT times as UTC', () => {
  assert.equal(gmtToIso('2026-03-02 09:15:23'), '2026-03-02T09:15:23.000Z')
  assert.equal(gmtToIso('2026-03-02T09:15:23.0'), '2026-03-02T09:15:23.000Z')
  assert.equal(gmtToIso('nonsense'), undefined)
})

test('maps an activity summary, keeping Garmin’s zone split when it has one', () => {
  const a = mapActivity({
    activityId: 42,
    activityName: 'Tempo Tuesday',
    activityType: { typeKey: 'running' },
    startTimeGMT: '2026-10-20 18:00:00',
    duration: 2700.4,
    distance: 9012.3,
    averageHR: 158.2,
    hrTimeInZone_1: 10,
    hrTimeInZone_3: 2000,
  })
  assert.ok(a)
  assert.equal(a.id, 'g-42')
  assert.equal(a.kind, 'tempo')
  assert.equal(a.durationS, 2700)
  assert.deepEqual(a.zoneS, [10, 0, 2000, 0, 0])
  assert.equal(mapActivity({ activityName: 'no id' }), null)
})

test('reads Garmin’s own view of a session, the watch RPE, the HRV baseline, sleep need and zones', () => {
  const a = mapActivity({
    activityId: 7,
    activityType: { typeKey: 'running' },
    startTimeGMT: '2026-10-24 08:00:00',
    duration: 9900,
    activityTrainingLoad: 261.4,
    aerobicTrainingEffect: 4.36,
    anaerobicTrainingEffect: 0.5,
    differenceBodyBattery: -31,
  })
  assert.deepEqual(a?.garmin, { load: 261, aerobicTE: 4.4, anaerobicTE: 0.5, bodyBattery: -31 })
  // Garmin keeps the RPE ×10; feel runs 0 (very weak) to 100 (very strong); nothing when you didn't enter them
  assert.deepEqual(detailOf({ summaryDTO: { directWorkoutRpe: 70, directWorkoutFeel: 25 } }), { rpe: 7, feel: 25 })
  assert.deepEqual(detailOf({ summaryDTO: { trainingEffect: 3 } }), {})
  const days: Record<string, Daily> = {}
  foldHrv(days, { hrvSummaries: [{ calendarDate: '2026-10-24', lastNightAvg: 58, baseline: { balancedLow: 55, balancedUpper: 70 }, status: 'balanced' }] })
  foldSleep(days, [{ calendarDate: '2026-10-24', sleepTimeSeconds: 27_000, sleepNeed: { actual: 490 } }])
  assert.deepEqual(days['2026-10-24'], { date: '2026-10-24', hrv: 58, hrvLow: 55, hrvHigh: 70, hrvStatus: 'BALANCED', sleepS: 27_000, sleepNeedS: 29_400 })
  const zones = { sport: 'DEFAULT', maxHeartRateUsed: 189, restingHeartRateUsed: 47, zone1Floor: 101, zone2Floor: 128, zone3Floor: 145, zone4Floor: 159, zone5Floor: 171 }
  assert.deepEqual(hrProfile([zones]), { hrMax: 189, hrRest: 47, zones: [101, 128, 145, 159, 171] })
  // floors that don't rise aren't zones
  assert.equal(hrProfile([{ ...zones, zone3Floor: 120 }]).zones, undefined)
})

test('turns a football FIT file into a 1 s stream and counts the sprints', () => {
  const start = new Date('2026-10-20T19:00:00Z')
  const stream = streamFromFit(fitFromDownload(footballFit(start, 3)), 'g-1', 'football')
  assert.equal(stream.dt, 1)
  // 55 minutes of wall clock including the half-time gap
  assert.equal(stream.v!.length, 55 * 60)
  // the gap reads as standing still
  assert.equal(stream.v![25 * 60 + 100], 0)
  assert.ok(stream.lat && stream.lon && stream.hr && stream.d)
  assert.equal(stream.laps?.length, 1)
  const s = footballSummary(stream)!
  assert.equal(s.sprints, 6)
  assert.ok(s.topSpeedKmh > 22 && s.topSpeedKmh < 24, `top speed ${s.topSpeedKmh}`)
  assert.equal(s.minutes, 55)
})

test('a first sync walks the full history, then reports up to date', async () => {
  const fake = fakeGarmin()
  const kv = memoryKV()
  const steps = await syncToEnd(kv, fake)
  const last = steps[steps.length - 1]
  assert.equal(last.done, true, `stopped at "${last.message}" after ${steps.length} steps`)
  const { state, data } = await loadAll(kv)

  // activities: everything inside the history window, and a page or so beyond
  const cutoff = Date.parse(fake.now.toISOString().slice(0, 10)) - HISTORY_DAYS * 86_400_000
  const inWindow = fake.activities.filter((a) => Date.parse(`${a.startTimeGMT.replace(' ', 'T')}Z`) >= cutoff)
  const ids = new Set(Object.keys(data.activities))
  for (const a of inWindow) assert.ok(ids.has(`g-${a.activityId}`), `missing ${a.activityId}`)

  // every football game got its numbers from the FIT file, and the stream is cached
  const games = Object.values(data.activities).filter((a) => a.sport === 'football')
  assert.ok(games.length > 50)
  for (const g of games) assert.equal(g.football?.sprints, 6)
  assert.ok(await kv.get<Stream>(`stream/${games[0].id}`))
  assert.equal(state.pending.length, 0)

  // runs from the last year were read for the running analysis, weather and all; older ones weren't
  const runs = Object.values(data.activities).filter((a) => a.sport === 'run')
  const yearAgo = fake.now.getTime() - RUN_DAYS * 86_400_000
  const recentRuns = runs.filter((a) => Date.parse(a.start) >= yearAgo)
  assert.ok(recentRuns.length > 60, `${recentRuns.length} recent runs`)
  for (const a of recentRuns) {
    assert.ok(a.run, `no summary for ${a.id}`)
    assert.ok(Math.abs(a.run.spd.length - a.durationS / 60) <= 1, `${a.run.spd.length} minutes in ${a.durationS} s`)
    assert.equal(a.run.best.length, BEST_S.length)
    assert.equal(typeof a.run.tempC, 'number')
  }
  assert.ok(runs.some((a) => Date.parse(a.start) < yearAgo))
  assert.ok(runs.filter((a) => Date.parse(a.start) < yearAgo).every((a) => !a.run))
  assert.equal(state.weather, undefined)

  // health: two years of days from the nested v2 summaries; sleep only for recent months, which the summaries don't carry
  const days = Object.values(data.dailies)
  assert.ok(days.length >= HISTORY_DAYS - 1, `${days.length} days`)
  const recent = data.dailies[fake.now.toISOString().slice(0, 10)]
  assert.equal(recent.hrv !== undefined && recent.deepS !== undefined && recent.sleepScore === 82, true)
  assert.deepEqual([typeof recent.rhr, recent.steps, recent.bbHigh, recent.bbLow], ['number', 9000, 80, 20])
  const old = days.find((d) => d.date < '2025-01-01')!
  assert.equal(typeof old.rhr, 'number')
  assert.equal(old.sleepS, undefined)
  // "-1" stress means no data and must not be stored
  assert.ok(days.filter((d) => d.date.endsWith('5')).every((d) => d.stress === undefined))

  // weight in kg, not grams
  const weights = Object.values(data.body)
  assert.ok(weights.length > 90)
  assert.equal(weights[0].weightKg, 78.4)

  assert.deepEqual({ hrMax: state.profile?.hrMax, hrRest: state.profile?.hrRest }, { hrMax: 189, hrRest: 47 })

  // Garmin's own view on every activity; the watch RPE read for the last 30 days of runs only
  const detailFrom = fake.now.getTime() - 30 * 86_400_000
  assert.ok(Object.values(data.activities).every((a) => a.garmin?.load && a.garmin.aerobicTE))
  const lastMonth = runs.filter((a) => Date.parse(a.start) >= detailFrom)
  assert.ok(lastMonth.length > 3 && lastMonth.every((a) => a.garmin?.rpe === 6 && a.garmin.feel === 75))
  assert.ok(runs.filter((a) => Date.parse(a.start) < detailFrom).every((a) => a.garmin?.rpe === undefined))
  assert.equal(state.details?.length ?? 0, 0)
  // and the health data Garmin judges you by: the HRV baseline, sleep need and zones
  assert.deepEqual([recent.hrvLow, recent.hrvHigh, recent.hrvStatus, recent.sleepNeedS], [55, 70, 'BALANCED', 490 * 60])
  assert.deepEqual(state.profile?.zones, [101, 128, 145, 159, 171])
  assert.equal(last.message, 'Up to date')
  // no endpoint was asked for more than it allows
  assert.equal(state.warnings, undefined)
})

test('after the first sync, a new game is picked up and analysed in one step', async () => {
  const fake = fakeGarmin({ years: 0.3 })
  const kv = memoryKV()
  await syncToEnd(kv, fake)
  fake.addActivity({ activityName: 'Thursday 7-a-side', typeKey: 'other', daysAgo: 0.2 })
  const api = garmin('test-key', kv, { fetch: fake.fetch })
  const r = await runStep({ kv, api, budgetMs: 25_000, now: fake.now, forceRecent: true })
  assert.equal(r.added, 1)
  assert.equal(r.done, true)
  const { data } = await loadAll(kv)
  const game = data.activities[`g-${fake.activities[0].activityId}`]
  assert.equal(game.sport, 'football')
  assert.equal(game.football?.sprints, 6)
})

test('a slow download can’t keep a step past its deadline, and the game stays in line for the next one', async () => {
  const fake = fakeGarmin({ years: 0.1 })
  const kv = memoryKV()
  await syncToEnd(kv, fake)
  fake.addActivity({ activityName: 'Thursday 7-a-side', typeKey: 'other', daysAgo: 0.2 })
  fake.slowPath('/download-service/', 60_000)
  const api = garmin('test-key', kv, { fetch: fake.fetch })
  const t0 = Date.now()
  const r = await runStep({ kv, api, budgetMs: 4_000, deadlineMs: 5_000, now: fake.now, forceRecent: true })
  assert.ok(Date.now() - t0 < 6_500, `took ${Date.now() - t0} ms`)
  assert.equal(r.done, false)
  const id = `g-${fake.activities[0].activityId}`
  const mid = await loadAll(kv)
  assert.deepEqual(mid.state.pending, [id])
  assert.equal(mid.state.error, undefined)
  assert.equal(mid.state.warnings, undefined)
  // the new game itself was saved, just not read yet
  assert.ok(mid.data.activities[id])
  assert.equal(await kv.get('lock'), null)
  fake.slowPath('/download-service/', 0)
  const next = await runStep({ kv, api, budgetMs: 25_000, now: fake.now })
  assert.equal(next.done, true)
  assert.equal((await loadAll(kv)).data.activities[id].football?.sprints, 6)
})

test('a second step while one is running is told to wait', async () => {
  const fake = fakeGarmin({ years: 0.2 })
  const kv = memoryKV()
  const api = garmin('test-key', kv, { fetch: fake.fetch })
  const [a, b] = await Promise.all([runStep({ kv, api, budgetMs: 25_000, now: fake.now }), runStep({ kv, api, budgetMs: 25_000, now: fake.now })])
  assert.equal([a, b].filter((r) => r.busy).length, 1)
  assert.equal(await kv.get('lock'), null)
})

test('a rate limit pauses the sync without losing what was fetched', async () => {
  const fake = fakeGarmin({ years: 1 })
  const kv = memoryKV()
  const api = garmin('test-key', kv, { fetch: fake.fetch })
  await runStep({ kv, api, budgetMs: 25_000, now: fake.now })
  const before = Object.keys((await loadAll(kv)).data.activities).length
  fake.failNext(429)
  const r = await runStep({ kv, api, budgetMs: 25_000, now: fake.now })
  assert.equal(r.paused, true)
  const { state, data } = await loadAll(kv)
  assert.ok(Object.keys(data.activities).length >= before)
  assert.match(state.error?.message ?? '', /slow down/)
  // and it carries on afterwards
  const steps = await syncToEnd(kv, fake)
  assert.equal(steps[steps.length - 1].done, true)
})

test('an expired token is exchanged again once, transparently', async () => {
  const fake = fakeGarmin({ years: 0.1 })
  const kv = memoryKV()
  const api = garmin('test-key', kv, { fetch: fake.fetch })
  await runStep({ kv, api, budgetMs: 25_000, now: fake.now })
  const exchanges = fake.calls['/personalapitoken-service/personal-api/personal-api-key/token']
  assert.equal(exchanges, 1)
  fake.failNext(401)
  await runStep({ kv, api, budgetMs: 25_000, now: fake.now, forceRecent: true })
  assert.equal(fake.calls['/personalapitoken-service/personal-api/personal-api-key/token'], 2)
})

test('an endpoint Garmin refuses is named in warnings and skipped, not fatal', async () => {
  const fake = fakeGarmin({ years: 0.3 })
  fake.breakPath('/hrv-service/')
  const kv = memoryKV()
  const steps = await syncToEnd(kv, fake)
  assert.equal(steps[steps.length - 1].done, true)
  const { state, data } = await loadAll(kv)
  assert.match(state.warnings?.hrv ?? '', /404/)
  assert.equal(Object.keys(state.warnings ?? {}).length, 1)
  // everything else still arrived
  const today = data.dailies[fake.now.toISOString().slice(0, 10)]
  assert.equal(today.hrv, undefined)
  assert.ok(today.rhr && today.sleepS)
})

test('a one-off server error on a page is retried by the history pass', async () => {
  const fake = fakeGarmin({ years: 0.3 })
  const kv = memoryKV()
  fake.failNext(500, 1)
  const steps = await syncToEnd(kv, fake)
  assert.equal(steps[steps.length - 1].done, true)
  const { state, data } = await loadAll(kv)
  assert.equal(Object.keys(data.activities).length, fake.activities.length)
  assert.equal(state.warnings, undefined)
})

const DAY = 86_400_000
const callsTo = (fake: ReturnType<typeof fakeGarmin>) => Object.values(fake.calls).reduce((a, b) => a + b, 0)

test('opening the app again within 10 minutes costs no Garmin calls', async () => {
  const fake = fakeGarmin({ years: 0.2 })
  const kv = memoryKV()
  await syncToEnd(kv, fake)
  const { state } = await loadAll(kv)
  const api = garmin('test-key', kv, { fetch: fake.fetch })
  const before = callsTo(fake)
  const r = await runStep({ kv, api, budgetMs: 25_000, now: new Date(fake.now.getTime() + 5 * 60_000) })
  assert.equal(callsTo(fake), before)
  assert.equal(r.done, true)
  // nothing changed, so the phone has nothing to download
  assert.equal(r.dataAt, state.dataAt)
  // Sync now still asks Garmin
  const forced = await runStep({ kv, api, budgetMs: 25_000, now: new Date(fake.now.getTime() + 6 * 60_000), forceRecent: true })
  assert.ok(callsTo(fake) > before)
  assert.notEqual(forced.dataAt, state.dataAt)
})

test('after weeks without opening the app, the next pass fills in every day since', async () => {
  const fake = fakeGarmin({ years: 0.2 })
  const kv = memoryKV()
  await syncToEnd(kv, fake)
  const later = new Date(fake.now.getTime() + 40 * DAY)
  const api = garmin('test-key', kv, { fetch: fake.fetch })
  const r = await runStep({ kv, api, budgetMs: 25_000, now: later })
  assert.equal(r.done, true)
  const { data } = await loadAll(kv)
  for (let t = fake.now.getTime(); t <= later.getTime(); t += DAY) {
    const day = new Date(t).toISOString().slice(0, 10)
    assert.ok(data.dailies[day]?.rhr && data.dailies[day].deepS, `missing ${day}`)
  }
})

test('after a fix to the health mapping, the health history is read again', async () => {
  const fake = fakeGarmin({ years: 0.2 })
  const kv = memoryKV()
  await syncToEnd(kv, fake)
  // as the days were before the v2 fix: read by a mapping that missed resting heart rate
  const { state, data } = await loadAll(kv)
  for (const d of Object.values(data.dailies)) delete d.rhr
  await kv.set('dailies', data.dailies)
  await kv.set('state', { ...state, healthMapping: undefined })
  const downloads = () => fake.calls['/download-service/files/activity/:x'] ?? 0
  const before = downloads()
  const api = garmin('test-key', kv, { fetch: fake.fetch })
  let r: StepResult | undefined
  for (let i = 0; i < 5 && !r?.done; i++) r = await runStep({ kv, api, budgetMs: 25_000, now: fake.now })
  assert.equal(r?.done, true)
  const after = await loadAll(kv)
  assert.ok(
    Object.values(after.data.dailies).every((d) => d.rhr),
    'every day has its resting heart rate back',
  )
  // the health history only: no FIT file is read again
  assert.equal(downloads(), before)
})

test('after a fix to the activity mapping, the list is read again without any FIT file', async () => {
  const fake = fakeGarmin({ years: 0.2 })
  const kv = memoryKV()
  await syncToEnd(kv, fake)
  // as the activities were before Garmin's view was read: only the RPE from the detail survives
  const { state, data } = await loadAll(kv)
  for (const a of Object.values(data.activities)) a.garmin = a.garmin?.rpe ? { rpe: a.garmin.rpe, feel: a.garmin.feel } : undefined
  await kv.set('activities', data.activities)
  await kv.set('state', { ...state, activityMapping: undefined })
  const downloads = () => fake.calls['/download-service/files/activity/:x'] ?? 0
  const before = downloads()
  const api = garmin('test-key', kv, { fetch: fake.fetch })
  let r: StepResult | undefined
  for (let i = 0; i < 5 && !r?.done; i++) r = await runStep({ kv, api, budgetMs: 25_000, now: fake.now })
  assert.equal(r?.done, true)
  const after = Object.values((await loadAll(kv)).data.activities)
  assert.ok(
    after.every((a) => a.garmin?.load),
    'Garmin’s view is back on every activity',
  )
  assert.ok(after.some((a) => a.garmin?.rpe === 6 && a.garmin.aerobicTE))
  assert.equal(downloads(), before)
})

test('games summarised before the season heatmap get a trace from the stored stream, without a download', async () => {
  const fake = fakeGarmin({ years: 0.1 })
  const kv = memoryKV()
  await syncToEnd(kv, fake)
  const { data } = await loadAll(kv)
  const games = Object.values(data.activities).filter((a) => a.sport === 'football')
  assert.ok(games.length && games.every((a) => a.football?.trace?.xy.length), 'a fresh sync keeps a trace of every game')
  // as they were before the trace
  for (const a of games) a.football = { ...a.football!, trace: undefined, v: undefined }
  await kv.set('activities', data.activities)
  const downloads = () => fake.calls['/download-service/files/activity/:x'] ?? 0
  const before = downloads()
  await runStep({ kv, api: garmin('test-key', kv, { fetch: fake.fetch }), budgetMs: 25_000, now: fake.now })
  const after = Object.values((await loadAll(kv)).data.activities).filter((a) => a.sport === 'football')
  assert.ok(after.every((a) => a.football?.trace?.xy.length && a.football.v === FOOTBALL_SUMMARY))
  assert.equal(downloads(), before)
})

test('after more than six months away, the health history is walked again', async () => {
  const fake = fakeGarmin({ years: 0.2 })
  const kv = memoryKV()
  await syncToEnd(kv, fake)
  const later = new Date(fake.now.getTime() + 200 * DAY)
  const api = garmin('test-key', kv, { fetch: fake.fetch })
  let r: StepResult | undefined
  for (let i = 0; i < 20 && !r?.done; i++) r = await runStep({ kv, api, budgetMs: 25_000, now: later })
  assert.equal(r?.done, true)
  const { data } = await loadAll(kv)
  for (let t = fake.now.getTime(); t <= later.getTime(); t += DAY) {
    const day = new Date(t).toISOString().slice(0, 10)
    assert.ok(data.dailies[day]?.rhr, `missing ${day}`)
  }
})
