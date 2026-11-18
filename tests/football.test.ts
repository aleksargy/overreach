import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Activity, Format, Match, PitchTrace, Stream } from '../src/data/types'
import {
  analyseFootball,
  baselineFor,
  formatOf,
  gamesToRate,
  playerCard,
  rateMatch,
  recurringPoints,
  seasonPitch,
  suggestPoints,
  summaryOf,
  usualFormatAt,
  usualOf,
  withPoints,
  withWatchLines,
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

test('games rated with moments read as points, and only points in your own words come back as suggestions', () => {
  const old = { ...match('o', '2026-09-01T10:30:00', 11), points: undefined, moments: ['ownGoal', 'nutmeg'] } as unknown as Match
  const m = withPoints(old)
  assert.deepEqual(m.points, [
    { key: 'ownGoal', text: 'Own goal', good: false, big: true },
    { key: 'nutmeg', text: 'Nutmeg', good: true },
  ])
  assert.ok(!('moments' in m))
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
  // the old game's moments are read, but nothing ready-made is offered: just what you wrote, most used first
  const offer = suggestPoints([m, ...games])
  assert.deepEqual(
    offer.map((p) => p.text),
    ['Lost my man at corners', 'Pressed well'],
  )
  assert.ok(!offer.some((p) => p.key))
  // a first game has nothing to offer
  assert.deepEqual(suggestPoints([]), [])
})

test('what you usually play comes from your games, with no settings', () => {
  assert.deepEqual(usualOf([]), { format: undefined, position: undefined, team: undefined })
  const games = [
    match('a', '2026-10-04T10:30:00', 11, { team: 'Real Ale Madrid', position: 'MID' }),
    match('b', '2026-10-11T10:30:00', 11, { team: 'Real Ale Madrid', position: 'MID' }),
    match('c', '2026-10-14T19:00:00', 7, { team: 'Ctrl Alt Defeat', position: 'ANY' }),
    match('d', '2026-10-28T19:00:00', 7, { team: 'Ctrl Alt Defeat', position: 'FWD' }),
  ]
  // 11s and 7s twice each: the latest game breaks the tie; midfield is played most; the team is the last one
  assert.deepEqual(usualOf(games), { format: 7, position: 'MID', team: 'Ctrl Alt Defeat' })
  assert.deepEqual(usualOf(games.slice(0, 3)), { format: 11, position: 'MID', team: 'Ctrl Alt Defeat' })
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

type Block = ['play', number, number] | ['stand', number] | ['walk', number] | ['warm', number] | ['pause', number]

const SPEEDS = [0.4, 1.3, 2.6, 4.3, 6.2]
// how play splits between standing, walking, jogging, running and sprinting in a quiet spell and a busy one
const QUIET = [0.3, 0.5, 0.17, 0.02, 0.01]
const BUSY = [0.08, 0.37, 0.38, 0.12, 0.05]

/**
 * A game second by second, as the watch records it: play as bouts of standing, walking, jogging, running and
 * sprinting, mixed to cover the metres asked for ([play, seconds, metres]), standing about, walking, a warm-up,
 * and the watch paused (no speed, no heart rate, the last position held). `before` gives a pause the way streams
 * were decoded before they kept pauses: the last sample held for 10 s, then the fill, and no `pauses`.
 */
function played(blocks: Block[], seed = 'game', before = false): Stream {
  const r = rng(seed)
  const s: Required<Pick<Stream, 'v' | 'hr' | 'lat' | 'lon' | 'd'>> = { v: [], hr: [], lat: [], lon: [], d: [] }
  const pauses: [number, number][] = []
  let x = 40
  let y = 20
  let heading = 0
  let hr = 110
  let dist = 0
  const push = (v: number) => {
    heading += r.normal(0, 0.5)
    x = Math.min(100, Math.max(0, x + Math.cos(heading) * v))
    y = Math.min(64, Math.max(0, y + Math.sin(heading) * v))
    if (x <= 0 || x >= 100 || y <= 0 || y >= 64) heading += Math.PI
    dist += v
    hr += (Math.min(185, 112 + 26 * v) - hr) * 0.04 + r.normal(0, 0.6)
    s.v.push(Math.round(v * 100) / 100)
    s.hr.push(Math.round(hr))
    s.d.push(Math.round(dist * 10) / 10)
    s.lat.push(+(51.5 + y / 110_540).toFixed(7))
    s.lon.push(+(-0.12 + x / 69_000).toFixed(7))
  }
  const hold = (blank: boolean) => {
    for (const k of ['v', 'hr', 'd', 'lat', 'lon'] as const) s[k].push(blank && (k === 'v' || k === 'hr') ? 0 : s[k][s[k].length - 1])
  }
  for (const b of blocks) {
    if (b[0] === 'pause') {
      pauses.push([s.v.length, s.v.length + b[1]])
      for (let i = 0; i < b[1]; i++) hold(!before || i >= 10)
    } else if (b[0] === 'stand' || b[0] === 'walk') {
      for (let i = 0; i < b[1]; i++) push(b[0] === 'stand' ? 0.05 + r() * 0.15 : 1.2 + r() * 0.2)
    } else {
      const secs = b[1]
      const metres = b[0] === 'warm' ? secs * 1.6 : b[2]
      const t = Math.min(1.2, Math.max(-0.4, (metres / secs - 1.36) / (2.33 - 1.36)))
      const mix = QUIET.map((q, i) => Math.max(0.001, q + t * (BUSY[i] - q)))
      const all = mix.reduce((a, m) => a + m, 0)
      const vs: number[] = []
      while (vs.length < secs) {
        let roll = r() * all
        let state = 0
        while (roll > mix[state] && state < 4) roll -= mix[state++]
        const len = state === 4 ? r.int(3, 5) : r.int(3, 10)
        for (let i = 0; i < len && vs.length < secs; i++) vs.push(SPEEDS[state] * r.range(0.9, 1.1))
      }
      // moving at both ends, so a spell of play starts and stops with play
      vs[0] = vs[secs - 1] = 2.6
      const k = metres / vs.reduce((a, v) => a + v, 0)
      for (const v of vs) push(v * k)
    }
  }
  return { activityId: 'g-1', dt: 1, ...s, ...(before ? {} : { pauses }) }
}

const fives = (metres: number[]): Block[] => metres.map((m) => ['play', 300, m])
const near = (a: number, b: number, within: number) => assert.ok(Math.abs(a - b) <= within, `${a} is not within ${within} of ${b}`)

// The 11s game Alex asked about, from its report's metres every five minutes: two minutes standing about after the
// half-time whistle, the watch paused from 47' to 58', and play to 106'. The old rule said he faded from 61'.
const FIRST = fives([676, 663, 599, 668, 523, 391, 430, 536, 480])
const SECOND = fives([483, 434, 549, 501, 518, 628, 489, 592, 616])
const ALEX: Block[] = [...FIRST, ['stand', 120], ['pause', 660], ['play', 120, 125], ...SECOND, ['play', 72, 130]]

test('half time is when you paused the watch, to the second, and the standing about before it', () => {
  // and the same from a stream decoded before pauses were kept
  for (const before of [false, true]) {
    const an = analyseFootball(played(ALEX, 'game', before))
    assert.equal(an.halfTime?.paused, true)
    near(an.halfTime!.from, 45 * 60, 5)
    assert.equal(an.halfTime!.to, 58 * 60)
  }
})

test('a second half that restarts a little slower is no fade when it holds up to the whistle', () => {
  const an = analyseFootball(played(ALEX))
  assert.equal(an.fadeMinute, undefined)
  const [first, second] = an.halves
  near(first.minutes, 45, 0.1)
  near(first.mPerMin, 110, 1)
  near(second.mPerMin, 105, 1)
  // minutes and metres a minute are the minutes played, without half time
  near(an.minutes, first.minutes + second.minutes, 1e-9)
  near(an.mPerMin, (first.distanceM + second.distanceM) / an.minutes, 1e-9)
  assert.equal(an.sprints, first.sprints + second.sprints)
  // and so the rating says nothing about fading
  const rated = rateMatch({ format: 11, scoreFor: 2, scoreAgainst: 1, goals: 0, assists: 0, points: [], position: 'MID', feel: 6, analysis: an, baseline: baselineFor(11, []) })
  assert.ok(!rated.breakdown.some((f) => f.key === 'fade'))
})

test('a fade is where the output dropped and stayed down to the final whistle', () => {
  // 115 m a minute for 15 minutes after the restart at 56', then 80 to the whistle
  const late: Block[] = [...FIRST, ['stand', 60], ['pause', 600], ...fives([575, 575, 575, 400, 400, 400, 400, 400, 400]), ['play', 60, 80]]
  for (const seed of ['game', 'another']) near(analyseFootball(played(late, seed)).fadeMinute!, 71, 3)
  // a whole second half well down fades from the restart
  near(analyseFootball(played([...FIRST, ['pause', 600], ...fives([420, 420, 410, 400, 420, 400, 410, 400, 420])])).fadeMinute!, 55, 1)
  // down to 88% of the first half, or a quiet spell you came back from, isn't a fade
  assert.equal(analyseFootball(played([...FIRST, ['pause', 600], ...fives([560, 550, 560, 490, 480, 490, 485, 480, 490])])).fadeMinute, undefined)
  assert.equal(analyseFootball(played([...FIRST, ['pause', 600], ...fives([560, 550, 380, 370, 390, 560, 570, 560, 580])])).fadeMinute, undefined)
})

test('without a pause, half time is the standing about between the halves, a walk to the bench and back included', () => {
  const an = analyseFootball(played([...FIRST, ['stand', 120], ['walk', 40], ['stand', 560], ['walk', 30], ['stand', 30], ['play', 120, 125], ...SECOND, ['play', 72, 130]]))
  assert.equal(an.halfTime?.paused, false)
  near(an.halfTime!.from, 45 * 60, 5)
  near(an.halfTime!.to, 58 * 60, 5)
  assert.equal(an.fadeMinute, undefined)
})

test('a game played straight through splits in the middle of play, with every 2 s of it on the heatmap', () => {
  const an = analyseFootball(played(fives([600, 580, 590, 610, 560, 600, 570, 590, 600, 580, 560, 590])))
  assert.equal(an.halfTime, undefined)
  near(an.halves[0].to, 30 * 60, 5)
  near(an.halves[0].minutes, an.halves[1].minutes, 0.1)
  near(an.heat.length, 60 * 30, 2)
  near(an.half, 30 * 30, 2)
  assert.equal(an.fadeMinute, undefined)
})

test('a warm-up before kick-off and the walk off after the whistle aren’t part of the game', () => {
  // 6s: 5 minutes standing, 15 warming up, 8 lining up, two halves of 25 around 3 minutes, then walking off
  const an = analyseFootball(
    played([
      ['stand', 300],
      ['warm', 900],
      ['stand', 480],
      ...fives([620, 600, 610, 590, 600]),
      ['stand', 180],
      ...fives([600, 590, 600, 580, 610]),
      ['walk', 300],
      ['stand', 200],
    ]),
  )
  near(an.halves[0].from, 28 * 60, 10)
  near(an.halfTime!.from, 53 * 60, 10)
  near(an.halfTime!.to, 56 * 60, 10)
  near(an.halves[1].to, 81 * 60, 10)
  near(an.minutes, 50, 0.5)
})

test('a stoppage in one half isn’t half time, even one longer than the break', () => {
  // 7s: 25 minutes, 2 standing about at half time, 5 more, 4 for an injury, then 20
  const an = analyseFootball(played([...fives([600, 620, 590, 600, 610]), ['stand', 120], ...fives([590]), ['stand', 240], ...fives([580, 600, 610, 590])]))
  near(an.halfTime!.from, 25 * 60, 10)
  near(an.halfTime!.to, 27 * 60, 10)
})

test('a rating saved with the old fade loses it once the game’s summary is up to date', () => {
  const summary = summaryOf(analyseFootball(played(ALEX)))
  const saved = match('m', '2026-11-15T10:30:00', 11, {
    activityId: 'g-1',
    rating: 6.7,
    breakdown: [
      { key: 'result', label: 'Win', value: 0.5 },
      { key: 'workrate', label: 'Work rate: 95 m/min, 29 sprints', value: 0.12 },
      { key: 'fade', label: "Faded from 61'", value: -0.1 },
      { key: 'feel', label: 'Your verdict: Solid shift', value: 0 },
    ],
  })
  const now = withWatchLines(saved, summary)
  assert.equal(now.rating, 6.8)
  assert.deepEqual(
    now.breakdown.map((f) => f.key),
    ['result', 'workrate', 'feel'],
  )
  // and its work rate says the metres a minute the report shows
  assert.equal(now.breakdown[1].label, `Work rate: ${Math.round(summary.mPerMin)} m/min, ${summary.sprints} sprints`)
  // a fade the summary finds comes in, before your verdict
  const faded = withWatchLines({ ...saved, breakdown: saved.breakdown.filter((f) => f.key !== 'fade') }, { ...summary, fadeMinute: 70 })
  assert.equal(faded.rating, 6.6)
  assert.deepEqual(faded.breakdown.map((f) => f.label).slice(-2), ["Faded from 70'", 'Your verdict: Solid shift'])
  // until the summary is made again, it stays as it was
  assert.equal(withWatchLines(saved, { ...summary, v: 2 }), saved)
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
