import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BUILTIN_EXERCISES } from '../src/data/exercises'
import type { Activity, Daily, SetEntry, Workout } from '../src/data/types'
import { liftSeries, recoverySeries, runSeries } from '../src/lib/series'
import { headline, standout, standoutOf, stretch, type Series } from '../src/lib/standout'

const DAY = 86_400_000
const NOW = Date.parse('2026-11-10T09:00:00Z')
/** a reading a day up to today, oldest first */
const daily = (values: number[]) => values.map((v, i) => ({ t: NOW - (values.length - 1 - i) * DAY, v }))
const hrv = (values: number[], over: Partial<Series> = {}): Series => ({
  key: 'hrv',
  what: 'HRV',
  points: daily(values),
  top: 'Highest',
  bottom: 'Lowest',
  good: 'top',
  format: (v) => `${v} ms`,
  ...over,
})

test('a stretch of time is said the way you’d say it', () => {
  assert.deepEqual([stretch(9), stretch(23), stretch(75), stretch(400), stretch(800)], ['9 days', '3 weeks', '2 months', 'a year', '2 years'])
})

test('a reading is news when it’s the lowest or highest in a long while, and it says how long', () => {
  // 48 three weeks and a day ago, then nothing under 55 until today's 50
  const s = standoutOf(hrv([58, 48, ...Array.from({ length: 21 }, (_, i) => 55 + (i % 7)), 50]), NOW)!
  assert.equal(s.text, 'Lowest HRV in 3 weeks')
  assert.equal(s.value, '50 ms')
  // a low HRV is the wrong kind of record
  assert.equal(s.tone, 'bad')
  assert.equal(s.beaten, 21)
})

test('an ordinary day says nothing', () => {
  assert.equal(standoutOf(hrv([...Array.from({ length: 30 }, (_, i) => 55 + (i % 7)), 58]), NOW), undefined)
  // lowest in a week isn't long enough to mention
  assert.equal(standoutOf(hrv([...Array.from({ length: 20 }, () => 50), ...Array.from({ length: 8 }, () => 60), 55]), NOW), undefined)
})

test('a reading that’s gone stale isn’t today’s news', () => {
  const s = hrv([...Array.from({ length: 30 }, (_, i) => 55 + (i % 7)), 40])
  assert.ok(standoutOf(s, NOW))
  assert.equal(standoutOf(s, NOW + 3 * DAY), undefined)
})

test('"yet" needs a fair run of history behind it', () => {
  const rising = Array.from({ length: 20 }, (_, i) => 50 + i)
  // twenty days of readings: the best of them all, but not long enough to call it the best yet
  assert.equal(standoutOf(hrv(rising), NOW)!.text, 'Highest HRV in 3 weeks')
  const long = Array.from({ length: 200 }, (_, i) => 50 + i * 0.1)
  assert.equal(standoutOf(hrv(long), NOW)!.text, 'Highest HRV yet')
  // a series counted in sessions says so, and needs twice the minimum before "yet"
  const lift = (n: number): Series => ({
    key: 'lift',
    what: 'bench press',
    points: daily(Array.from({ length: n }, (_, i) => 50 + i)),
    top: 'Heaviest',
    good: 'top',
    format: (v) => `${v} kg`,
    min: 3,
    count: 'sessions',
  })
  assert.equal(standoutOf(lift(5), NOW)!.text, 'Heaviest bench press in 5 sessions')
  assert.equal(standoutOf(lift(8), NOW)!.text, 'Heaviest bench press yet')
})

test('of several things worth saying, the rarest is the one that’s said', () => {
  const sleep: Series = { key: 'sleep', what: 'night’s sleep', points: daily([...Array.from({ length: 16 }, () => 7.5), 9]), top: 'Longest', good: 'top', format: (v) => `${v} h` }
  const low = hrv([...Array.from({ length: 60 }, (_, i) => 55 + (i % 7)), 40])
  assert.equal(standout([sleep, low], NOW)!.key, 'hrv')
  assert.equal(standout([sleep], NOW)!.key, 'sleep')
  assert.equal(standout([], NOW), undefined)
})

test('Today only takes what’s twice as rare as a tab asks for, and still fresh', () => {
  const low = (days: number) => standoutOf(hrv([...Array.from({ length: 80 - days }, () => 45), ...Array.from({ length: days }, (_, i) => 55 + (i % 7)), 50]), NOW)!
  // lowest in three weeks is worth a line on its own tab, but not the front page; lowest in seven weeks is
  assert.equal(headline([low(21)], NOW), undefined)
  assert.equal(headline([low(49)], NOW)?.text, 'Lowest HRV in 7 weeks')
  // two mornings on it's old news
  assert.equal(headline([low(49)], NOW + 2 * DAY), undefined)
  assert.equal(headline([undefined, low(21), low(49)], NOW)?.beaten, 49)
})

test('your own numbers feed it: mornings, runs and lifts', () => {
  const day = (i: number) => new Date(NOW - i * DAY).toISOString().slice(0, 10)
  const dailies = Array.from({ length: 40 }, (_, i): Daily => ({ date: day(39 - i), hrv: 60 + (i % 5), rhr: 48, sleepS: (7 + (i % 3) * 0.2) * 3600 }))
  dailies[39] = { ...dailies[39], sleepS: 5.2 * 3600 }
  const morning = standout(recoverySeries(dailies), NOW)!
  assert.equal(morning.text, 'Shortest night’s sleep in 6 weeks')
  assert.equal(morning.value, '5h12')

  const run = (daysAgo: number, km: number): Activity => ({ id: `r${daysAgo}`, sport: 'run', start: new Date(NOW - daysAgo * DAY).toISOString(), distanceM: km * 1000 }) as Activity
  const runs = [run(1, 24), ...Array.from({ length: 16 }, (_, i) => run(3 + i * 3, i === 12 ? 26 : 10 + (i % 4)))]
  // 26 km thirty-nine days ago, and nothing as far as yesterday's 24 in the twelve runs since
  assert.equal(standout(runSeries(runs, new Date(NOW)), NOW)!.text, 'Longest run in 5 weeks')

  const byId = new Map(BUILTIN_EXERCISES.map((e) => [e.id, e]))
  const lifted = (daysAgo: number, kg: number): Workout => {
    const start = new Date(NOW - daysAgo * DAY)
    const sets: SetEntry[] = [{ id: `s${daysAgo}`, kind: 'working', kg, reps: 8, done: true }]
    return {
      id: `w${daysAgo}`,
      name: 'Push',
      start: start.toISOString(),
      end: start.toISOString(),
      exercises: [{ id: `e${daysAgo}`, exerciseId: 'bench-press', sets }],
      source: 'manual',
    }
  }
  const sessions = [lifted(1, 65), lifted(8, 62.5), lifted(15, 62.5), lifted(22, 60), lifted(29, 60), lifted(36, 57.5)]
  const best = standout(liftSeries(sessions, byId), NOW)!
  assert.deepEqual([best.text, best.value, best.tone], ['Heaviest bench press yet', '65 kg', 'good'])
})
