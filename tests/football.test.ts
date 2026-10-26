import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Activity, Format, Match, PitchTrace, Stream } from '../src/data/types'
import {
  analyseFootball,
  baselineFor,
  formatOf,
  gamesToRate,
  headline,
  playerCard,
  rateMatch,
  recurringPoints,
  seasonPitch,
  suggestPoints,
  usualFormatAt,
  withPoints,
  type Physical,
} from '../src/lib/football'
import { rng } from '../src/lib/rng'

const match = (id: string, date: string, format: Format, over: Partial<Match> = {}): Match => ({
  id,
  date,
  format,
  team: 'Us',
  opponent: 'Them',
  scoreFor: 2,
  scoreAgainst: 1,
  goals: 0,
  assists: 0,
  points: [],
  position: 'MID',
  feel: 6,
  rating: 7,
  breakdown: [],
  headline: '',
  createdAt: date,
  ...over,
})

// Sundays at 10:30 are 11s, alternate Tuesdays at 20:30 are 7s
const history = [
  match('a', '2026-10-18T10:30:00', 11),
  match('b', '2026-10-13T20:30:00', 7),
  match('c', '2026-10-11T10:35:00', 11),
  match('d', '2026-10-04T10:25:00', 11),
  match('e', '2026-09-29T20:40:00', 7),
]

test('guesses the format of a game from what you usually play at that time of the week', () => {
  assert.equal(usualFormatAt(new Date('2026-10-25T10:40:00'), history), 11)
  assert.equal(usualFormatAt(new Date('2026-10-27T20:15:00'), history), 7)
  assert.equal(usualFormatAt(new Date('2026-10-28T19:00:00'), history), undefined)

  const byActivity = new Map([['g-1', { ...history[1], activityId: 'g-1' }]])
  // a rated game keeps its format, a sample game says it in its kind, otherwise the time of week decides
  assert.equal(formatOf({ id: 'g-1', start: '2026-10-18T10:30:00', kind: undefined }, history, byActivity, 5), 7)
  assert.equal(formatOf({ id: 'g-2', start: '2026-10-18T10:30:00', kind: '8' }, history, byActivity, 5), 8)
  assert.equal(formatOf({ id: 'g-3', start: '2026-10-25T10:30:00', kind: undefined }, history, byActivity, 5), 11)
  assert.equal(formatOf({ id: 'g-4', start: '2026-10-28T19:00:00', kind: undefined }, history, byActivity, 5), 5)
})

test('a 4–0 is a thrashing in 11s but just a win in 7s', () => {
  const rate = (format: Format) =>
    rateMatch({ format, scoreFor: 4, scoreAgainst: 0, goals: 0, assists: 0, points: [], position: 'MID', feel: 6, baseline: baselineFor(format, []) })
  assert.equal(rate(11).breakdown.find((f) => f.key === 'result')?.label, 'Thrashing')
  assert.equal(rate(7).breakdown.find((f) => f.key === 'result')?.label, 'Win')
})

test('what went well and badly moves the rating, a big point double, and never more than 0.6 in all', () => {
  // before rounding to one decimal
  const total = (points: Match['points']) =>
    6 +
    rateMatch({ format: 11, scoreFor: 1, scoreAgainst: 1, goals: 0, assists: 0, points, position: 'MID', feel: 6, baseline: baselineFor(11, []) }).breakdown.reduce(
      (a, f) => a + f.value,
      0,
    )
  const flat = total([])
  const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} is not ${b}`)
  near(total([{ text: 'Won every header', good: true }]) - flat, 0.15)
  near(total([{ text: 'Lost my man at corners', good: false, big: true }]) - flat, -0.3)
  const many = Array.from({ length: 6 }, (_, i) => ({ text: `Good thing ${i}`, good: true, big: true }))
  near(total(many) - flat, 0.6)
  // every point shows, then the cap takes back what's over
  const capped = rateMatch({ format: 11, scoreFor: 1, scoreAgainst: 1, goals: 0, assists: 0, points: many, position: 'MID', feel: 6, baseline: baselineFor(11, []) })
  assert.equal(capped.breakdown.filter((f) => f.key.startsWith('point-')).length, 6)
  assert.equal(capped.breakdown.find((f) => f.key === 'pointsCap')?.value, -1.2)
})

test('games rated with moments read as points, and old points come back as suggestions', () => {
  const old = { ...match('o', '2026-09-01T10:30:00', 11), points: undefined, moments: ['ownGoal', 'nutmeg'] } as unknown as Match
  const m = withPoints(old)
  assert.deepEqual(m.points, [
    { key: 'ownGoal', text: 'Own goal', good: false, big: true },
    { key: 'nutmeg', text: 'Nutmeg', good: true },
  ])
  assert.ok(!('moments' in m))
  // the headline still knows an own goal
  assert.match(headline(m, 'Alex'), /own goal|wrong end/i)
  const games = [
    match('x', '2026-10-18T10:30:00', 11, { points: [{ text: 'Lost my man at corners', good: false }] }),
    match('y', '2026-10-11T10:30:00', 11, {
      points: [
        { text: 'lost my man at corners ', good: false, big: true },
        { text: 'Pressed well', good: true },
      ],
    }),
  ]
  assert.deepEqual(recurringPoints(games), [{ text: 'Lost my man at corners', good: false, games: 2 }])
  const offer = suggestPoints(games)
  assert.deepEqual(
    offer.slice(0, 2).map((p) => p.text),
    ['Lost my man at corners', 'Pressed well'],
  )
  // then the old moments, as a start
  assert.ok(offer.some((p) => p.key === 'worldie'))
})

test('a big point in your own words can make the headline', () => {
  const m = match('h', '2026-10-18T10:30:00', 11, { scoreFor: 3, scoreAgainst: 1, points: [{ text: 'won every header', good: true, big: true }] })
  assert.equal(headline(m, 'Alex'), '“Won every header”: Alex stars in 3-1 win')
})

test('the player card judges each game against its own format', () => {
  const games = (format: Format, goals: number, mPerMin: number) =>
    [1, 2, 3].map((i) => ({
      match: match(`${format}-${i}`, `2026-10-0${i}T10:00:00`, format, { goals }),
      analysis: { minutes: 60, mPerMin, topSpeedKmh: 27, sprints: 20, distanceM: mPerMin * 60 } satisfies Physical,
    }))
  const sho = (rows: ReturnType<typeof games>) => playerCard(rows, 'MID')!.attrs.find((a) => a.key === 'SHO')!.value
  const sta = (rows: ReturnType<typeof games>) => playerCard(rows, 'MID')!.attrs.find((a) => a.key === 'STA')!.value
  // a goal a game is a lot in 11s and ordinary in 7s
  assert.ok(sho(games(11, 1, 95)) > sho(games(7, 1, 95)) + 15)
  // the same metres per minute is a bigger shift on an 11s pitch
  assert.ok(sta(games(11, 0, 95)) > sta(games(7, 0, 95)))
})

/** A 1 s stream: [minutes, m/s] blocks, with sprints (6.4 m/s for 4 s) at the given minutes. */
function game(blocks: [number, number][], sprintsAt: number[]): Stream {
  const v: number[] = []
  for (const [mins, speed] of blocks) for (let s = 0; s < mins * 60; s++) v.push(speed)
  for (const m of sprintsAt) for (let s = 0; s < 4; s++) v[m * 60 + s] = 6.4
  return {
    activityId: 'g-1',
    dt: 1,
    v,
    hr: v.map((x) => (x > 1 ? 160 : 100)),
    lat: v.map((_, s) => 51.5 + Math.sin(s / 60) * 0.0002),
    lon: v.map((_, s) => -0.12 + Math.cos(s / 45) * 0.0003),
  }
}

test('halves split at the real half-time break, not the middle of the recording', () => {
  // 30 minutes standing about before kick-off, two 40-minute halves around a 15-minute break:
  // the middle of the recording (62.5') falls inside the first half
  const an = analyseFootball(
    game(
      [
        [30, 0.3],
        [40, 2.2],
        [15, 0.1],
        [40, 1.6],
      ],
      [35, 45, 55, 65, 95, 115],
    ),
  )
  assert.deepEqual(an.halfTime, { from: 70, to: 85 })
  assert.deepEqual(an.sprintsByHalf, [4, 2])
  // the heatmap leaves out the standing before kick-off and at half time: a point every 2 s of each half
  assert.equal(an.heat.length, 2 * 40 * 30)
  assert.equal(an.half, 40 * 30)
  // a slower second half fades from the restart, never across the break
  assert.equal(an.fadeMinute, 85)
})

test('a game played straight through splits in the middle and keeps every minute on the heatmap', () => {
  const an = analyseFootball(game([[50, 2.2]], [10, 20, 30, 40]))
  assert.equal(an.halfTime, undefined)
  assert.deepEqual(an.sprintsByHalf, [2, 2])
  assert.equal(an.heat.length, 50 * 30)
  assert.equal(an.fadeMinute, undefined)
})

test('only recent games you haven’t rated or skipped are asked about', () => {
  const now = new Date('2026-10-25T12:00:00Z')
  const game = (id: string, daysAgo: number) => ({ id, sport: 'football', start: new Date(now.getTime() - daysAgo * 86_400_000).toISOString() }) as Activity
  const asked = gamesToRate([game('fresh', 2), game('rated', 3), game('skipped', 4), game('june', 120)], (id) => id === 'rated', ['skipped'], now)
  assert.deepEqual(
    asked.map((a) => a.id),
    ['fresh'],
  )
})

test('a season of games lines up on one pitch, each half facing the end you attacked', () => {
  // a 100 × 64 m pitch running east to west; a right-sided midfielder, a little into their own half
  const traces: PitchTrace[] = Array.from({ length: 8 }, (_, g) => {
    const r = rng(`game-${g}`)
    // the toss picks the first-half end, and the ends change at half time
    const first = r() < 0.5 ? 1 : -1
    const xy: number[] = []
    for (let i = 0; i < 360; i++) {
      const end = i < 180 ? first : -first
      // kick-off in your own half at the start of each half, then about your spot, now and then anywhere
      const kick = i === 0 || i === 180
      const wide = r() < 0.3
      const depth = kick ? -8 : wide ? r.range(-50, 50) : -10 + r.normal(0, 12)
      const across = kick ? -12 : wide ? r.range(-32, 32) : -13 + r.normal(0, 8)
      // attacking east, your right is south
      xy.push(Math.round(end * depth), Math.round(end * across))
    }
    return { at: [51.5, -0.12], xy, half: 180, break: true }
  })
  const p = seasonPitch(traces)!
  assert.equal(p.games, 8)
  assert.ok(p.sure)
  const mean = (k: 0 | 1) => p.points.reduce((a, x) => a + x[k], 0) / p.points.length
  // own half is the left, and your right is the bottom edge when you attack to the right
  assert.ok(mean(0) < 0.47, `along ${mean(0)}`)
  assert.ok(mean(1) > 0.55, `across ${mean(1)}`)
})
