import type { Activity, FootballSummary, Format, Match, MatchPoint, MomentKey, PitchTrace, Position, RatingFactor, Stream } from '../data/types'
import { clamp, mapRange, mean, median, quantile, round } from './math'
import { hashString } from './rng'

/** What a point you note is worth, a big one, and the most your notes can move a rating either way. */
export const POINT = 0.15
export const BIG_POINT = 0.3
export const POINTS_CAP = 0.6

export const pointValue = (p: MatchPoint) => (p.good ? 1 : -1) * (p.big ? BIG_POINT : POINT)

/** The fixed moments games were rated with before notes. They're offered as suggestions now. */
export const MOMENTS: (MatchPoint & { key: MomentKey })[] = [
  { key: 'worldie', text: 'Scored a worldie', good: true, big: true },
  { key: 'nutmeg', text: 'Nutmeg', good: true },
  { key: 'lastDitch', text: 'Last-ditch tackle', good: true },
  { key: 'bigSave', text: 'Big save', good: true },
  { key: 'sitter', text: 'Missed a sitter', good: false },
  { key: 'error', text: 'Error for a goal', good: false, big: true },
  { key: 'ownGoal', text: 'Own goal', good: false, big: true },
  { key: 'lostHead', text: 'Lost my head', good: false },
]

type SavedMatch = Omit<Match, 'points'> & { points?: MatchPoint[]; moments?: MomentKey[] }

/** Games saved before notes have moments instead of points; this reads either, so they keep their rating. */
export function withPoints(m: SavedMatch): Match {
  if (Array.isArray(m.points)) return m as Match
  const { moments, ...rest } = m
  return { ...rest, points: (moments ?? []).flatMap((k) => MOMENTS.filter((x) => x.key === k)).map((x) => ({ ...x })) }
}

const norm = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ')

/** What to offer when you add a point: the ones you've written before, most used first, then the old moments. */
export function suggestPoints(matches: Match[]): MatchPoint[] {
  const used = new Map<string, { p: MatchPoint; n: number }>()
  // newest first, so a point keeps the size you gave it last time
  for (const m of matches) for (const p of m.points) used.set(norm(p.text), { p: used.get(norm(p.text))?.p ?? p, n: (used.get(norm(p.text))?.n ?? 0) + 1 })
  const mine = [...used.values()].sort((a, b) => b.n - a.n).map((x) => ({ text: x.p.text, good: x.p.good, big: x.p.big, key: x.p.key }))
  return [...mine, ...MOMENTS.filter((x) => !used.has(norm(x.text)))]
}

/** Points that keep coming up: the same words in more than one game, most often first. */
export function recurringPoints(matches: Match[], min = 2): { text: string; good: boolean; games: number }[] {
  const by = new Map<string, { text: string; good: boolean; games: number }>()
  for (const m of matches)
    for (const p of new Map(m.points.map((p) => [`${p.good}:${norm(p.text)}`, p])).values()) {
      const k = `${p.good}:${norm(p.text)}`
      const x = by.get(k)
      if (x) x.games++
      else by.set(k, { text: p.text, good: p.good, games: 1 })
    }
  return [...by.values()].filter((x) => x.games >= min).sort((a, b) => b.games - a.games)
}

export const FEEL = ['', 'Ghost', 'Passenger', 'Off the pace', 'Rusty', 'Steady', 'Solid shift', 'Bossed it', 'Ran the show', 'Unplayable', 'Prime Zidane']

export const POSITIONS: { key: Position; label: string }[] = [
  { key: 'GK', label: 'Keeper' },
  { key: 'DEF', label: 'Defence' },
  { key: 'MID', label: 'Midfield' },
  { key: 'FWD', label: 'Attack' },
  { key: 'ANY', label: 'All over' },
]

export const FORMATS: Format[] = [5, 6, 7, 8, 11]

/** Pitch length × width in metres, used to frame the heatmap. */
export const PITCH: Record<Format, [number, number]> = {
  5: [40, 25],
  6: [45, 28],
  7: [55, 35],
  8: [65, 42],
  11: [100, 64],
}

/** Typical goals conceded per game when there is no history yet. */
const DEFAULT_CONCEDED: Record<Format, number> = { 5: 7, 6: 6, 7: 5, 8: 4, 11: 1.6 }

/** A winning margin that counts as a thrashing: 4–0 is a hiding in 11s, routine in 5s. */
const BIG_MARGIN: Record<Format, number> = { 5: 6, 6: 5, 7: 5, 8: 4, 11: 4 }

/** Goals and assists a decent outfield player chips in per game. They shrink as the pitch and the team grow. */
const PAR: Record<Format, { goals: number; assists: number }> = {
  5: { goals: 1.6, assists: 1 },
  6: { goals: 1.3, assists: 0.8 },
  7: { goals: 1, assists: 0.6 },
  8: { goals: 0.8, assists: 0.5 },
  11: { goals: 0.4, assists: 0.25 },
}

/** Metres per minute and sprints per 10 minutes that read as poor and as excellent in each format. Bigger pitches mean longer runs but lower averages. */
const ENGINE_RANGE: Record<Format, { mPerMin: [number, number]; sprintsPer10: [number, number] }> = {
  5: { mPerMin: [80, 130], sprintsPer10: [0.3, 4] },
  6: { mPerMin: [80, 130], sprintsPer10: [0.3, 4.5] },
  7: { mPerMin: [75, 125], sprintsPer10: [0.5, 5] },
  8: { mPerMin: [72, 122], sprintsPer10: [0.5, 5.5] },
  11: { mPerMin: [65, 115], sprintsPer10: [0.6, 6] },
}

/** The format you usually play at this time of the week: the most common among rated games that started on the same weekday within two hours. */
export function usualFormatAt(when: Date, matches: Pick<Match, 'date' | 'format'>[]): Format | undefined {
  const dow = when.getDay()
  const min = when.getHours() * 60 + when.getMinutes()
  const counts = new Map<Format, number>()
  for (const m of matches) {
    const d = new Date(m.date)
    if (d.getDay() !== dow || Math.abs(d.getHours() * 60 + d.getMinutes() - min) > 120) continue
    counts.set(m.format, (counts.get(m.format) ?? 0) + 1)
  }
  let best: Format | undefined
  for (const [f, n] of counts) if (best === undefined || n > counts.get(best)!) best = f
  return best
}

/** A watch game's format: its rated match, the number in its kind (sample data), or what you usually play at that time of the week. */
export function formatOf(a: Pick<Activity, 'id' | 'start' | 'kind'>, matches: Match[], byActivity: Map<string, Match>, fallback: Format): Format {
  const m = byActivity.get(a.id)
  if (m) return m.format
  const k = Number(a.kind) as Format
  if (FORMATS.includes(k)) return k
  return usualFormatAt(new Date(a.start), matches) ?? fallback
}

/** a game older than this isn't asked about any more: you won't remember it well enough to rate */
export const RATE_DAYS = 14

/** Football activities worth asking you to rate: unrated, not skipped, and recent enough to remember. */
export function gamesToRate(activities: Activity[], rated: (activityId: string) => boolean, skipped: readonly string[], now: Date): Activity[] {
  const from = now.getTime() - RATE_DAYS * 86_400_000
  return activities.filter((a) => a.sport === 'football' && !rated(a.id) && !skipped.includes(a.id) && Date.parse(a.start) >= from)
}

export const SPRINT_MPS = 5.0 // 18 km/h
export const HI_MPS = 4.0 // 14.4 km/h
/** a minute covering less than this (m) is standing still: before kick-off, half time, after the whistle */
const STILL_M = 25

/**
 * Half time: the longest run of three or more standing-still minutes whose middle
 * falls in the middle 60% of the recording, as [from, to) minutes. Undefined for a
 * game played straight through.
 */
export function halfTimeOf(perMin: number[]): { from: number; to: number } | undefined {
  const n = perMin.length
  let best: { from: number; to: number } | undefined
  for (let m = 0; m < n; m++) {
    if (perMin[m] >= STILL_M) continue
    let to = m
    while (to < n && perMin[to] < STILL_M) to++
    const mid = (m + to) / 2
    if (to - m >= 3 && mid > n * 0.2 && mid < n * 0.8 && (!best || to - m > best.to - best.from)) best = { from: m, to }
    m = to
  }
  return best
}

export interface Bucket {
  startMin: number
  distM: number
  avgHr?: number
  sprints: number
}

export interface FootballAnalysis {
  minutes: number
  distanceM: number
  mPerMin: number
  topSpeedKmh: number
  sprints: number
  sprintsByHalf: [number, number]
  hiDistM: number
  avgHr?: number
  maxHr?: number
  buckets: Bucket[]
  fadeMinute?: number
  /** points in pitch space, x along the length, both 0–1 */
  heat: [number, number][]
  /** index into heat where the second half starts */
  half: number
  /** the half-time break in minutes from the start, [from, to); undefined if the game ran straight through */
  halfTime?: { from: number; to: number }
  trace?: PitchTrace
}

const KY = 110_540
const kxAt = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180)

/**
 * The pitch as you used it: turned so the long axis of the points (metres) runs
 * left to right, then framed by where they reach, each way 0–1.
 */
function pitchFrame(pts: [number, number][]): (p: [number, number]) => [number, number] {
  const mx = mean(pts.map((p) => p[0]))
  const my = mean(pts.map((p) => p[1]))
  let cxx = 0
  let cyy = 0
  let cxy = 0
  for (const [x, y] of pts) {
    cxx += (x - mx) ** 2
    cyy += (y - my) ** 2
    cxy += (x - mx) * (y - my)
  }
  const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy)
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  const rot = ([x, y]: [number, number]): [number, number] => [(x - mx) * c + (y - my) * s, -(x - mx) * s + (y - my) * c]
  const turned = pts.map(rot)
  const us = turned.map((p) => p[0])
  const vs = turned.map((p) => p[1])
  const [u0, u1, v0, v1] = [quantile(us, 0.01), quantile(us, 0.99), quantile(vs, 0.01), quantile(vs, 0.99)]
  return (p) => {
    const [u, v] = rot(p)
    return [clamp((u - u0) / (u1 - u0 || 1), 0, 1), clamp((v - v0) / (v1 - v0 || 1), 0, 1)]
  }
}

/** Rotate GPS points so the long axis of your movement runs left to right, then frame them. */
export function projectToPitch(lat: number[], lon: number[]): [number, number][] {
  const fixes = lat.map((la, i) => [la, lon[i]]).filter(([la, lo]) => la && lo)
  if (fixes.length < 10) return []
  const lat0 = mean(fixes.map((f) => f[0]))
  const lon0 = mean(fixes.map((f) => f[1]))
  const kx = kxAt(lat0)
  const pts = fixes.map(([la, lo]) => [(lo - lon0) * kx, (la - lat0) * KY] as [number, number])
  return pts.map(pitchFrame(pts))
}

export function analyseFootball(stream: Stream): FootballAnalysis {
  const dt = stream.dt
  const v = stream.v ?? []
  const hr = stream.hr ?? []
  const n = v.length
  const minutes = (n * dt) / 60
  let dist = 0
  let hi = 0
  let top = 0
  let sprints = 0
  let run = 0
  let cool = 99
  const perMin: number[] = []
  const sprintStarts: number[] = []
  for (let i = 0; i < n; i++) {
    const step = v[i] * dt
    dist += step
    if (v[i] > HI_MPS) hi += step
    top = Math.max(top, v[i])
    const m = Math.floor((i * dt) / 60)
    perMin[m] = (perMin[m] ?? 0) + step
    if (v[i] >= SPRINT_MPS) {
      run += dt
      if (run >= 2 && cool >= 3) {
        sprints++
        sprintStarts.push(i * dt)
        cool = 0
        run = -999
      }
    } else {
      run = 0
      cool += dt
    }
  }

  const buckets: Bucket[] = []
  for (let b = 0; b * 5 < minutes; b++) {
    const i0 = Math.floor((b * 300) / dt)
    const i1 = Math.min(n, Math.floor(((b + 1) * 300) / dt))
    let d = 0
    const hs: number[] = []
    for (let i = i0; i < i1; i++) {
      d += v[i] * dt
      if (hr[i]) hs.push(hr[i])
    }
    buckets.push({
      startMin: b * 5,
      distM: d,
      avgHr: hs.length ? Math.round(mean(hs)) : undefined,
      sprints: sprintStarts.filter((t) => t >= b * 300 && t < (b + 1) * 300).length,
    })
  }

  // the second half starts when the break ends; a game played straight through splits in the middle
  const halfTime = halfTimeOf(perMin)
  const secondS = halfTime ? halfTime.to * 60 : (n * dt) / 2
  const sprintsByHalf: [number, number] = [sprintStarts.filter((t) => t < secondS).length, sprintStarts.filter((t) => t >= secondS).length]

  // Fade: the first minute of the second half where your 5-minute rolling output
  // stays under 80% of your minutes 3–20 for five minutes straight. Standing-still
  // minutes are dropped first, and the rolling window never reaches back across
  // half time, so the break itself can't read as a fade.
  let fadeMinute: number | undefined
  const active = perMin.map((d, m) => ({ d, m })).filter((x) => x.d >= STILL_M)
  const second = active.findIndex((x) => x.m * 60 >= secondS)
  if (active.length >= 24 && second >= 8) {
    const ds = active.map((x) => x.d)
    const base = mean(ds.slice(3, Math.min(20, second)))
    const roll = (i: number) => mean(ds.slice(Math.max(second, i - 4), i + 1))
    for (let i = second; i < ds.length - 5; i++) {
      if ([0, 1, 2, 3, 4].every((k) => roll(i + k) < base * 0.8)) {
        fadeMinute = active[Math.max(second, i - 2)].m
        break
      }
    }
  }

  // the watch's own distance when it recorded one, so the report agrees with the activity
  const d = stream.d
  if (d && d.length === n && d[n - 1] > d[0]) dist = d[n - 1] - d[0]

  const hs = hr.filter((x) => x > 0)
  // the heatmap is where you played: a point every 2 s, leaving out the standing before
  // kick-off, at half time and after the whistle
  const first = active[0]?.m ?? 0
  const last = active[active.length - 1]?.m ?? perMin.length
  const inPlay = (m: number) => m >= first && m <= last && !(halfTime && m >= halfTime.from && m < halfTime.to)
  const every = Math.max(1, Math.round(2 / dt))
  const kept: number[] = []
  for (let i = 0; i < (stream.lat ?? []).length; i += every) if (inPlay(Math.floor((i * dt) / 60))) kept.push(i)
  const lat = kept.map((i) => stream.lat![i])
  const lon = kept.map((i) => stream.lon![i])
  // projectToPitch skips points with no fix, so count only those up to the second half
  const half = kept.filter((i, k) => i * dt < secondS && lat[k] && lon[k]).length
  // and a coarser record of the same, small enough to keep for every game
  const every15 = Math.max(1, Math.round(15 / dt))
  const sparse = kept.filter((i) => i % every15 < every && stream.lat![i] && stream.lon![i])

  return {
    minutes: Math.round(minutes),
    distanceM: dist,
    mPerMin: minutes ? dist / minutes : 0,
    topSpeedKmh: round(top * 3.6, 1),
    sprints,
    sprintsByHalf,
    hiDistM: hi,
    avgHr: hs.length ? Math.round(mean(hs)) : undefined,
    maxHr: hs.length ? Math.max(...hs) : undefined,
    buckets,
    fadeMinute,
    heat: projectToPitch(lat, lon),
    half,
    halfTime,
    trace: traceOf(sparse, stream, secondS, !!halfTime),
  }
}

function traceOf(idx: number[], stream: Stream, secondS: number, hadBreak: boolean): PitchTrace | undefined {
  if (idx.length < 20) return undefined
  const at: [number, number] = [round(mean(idx.map((i) => stream.lat![i])), 5), round(mean(idx.map((i) => stream.lon![i])), 5)]
  const kx = kxAt(at[0])
  const xy = idx.flatMap((i) => [Math.round((stream.lon![i] - at[1]) * kx), Math.round((stream.lat![i] - at[0]) * KY)])
  return { at, xy, half: idx.filter((i) => i * stream.dt < secondS).length, break: hadBreak }
}

/** Bump when the per-game summary gains something: sync makes older ones again from the stored stream. */
export const FOOTBALL_SUMMARY = 2

export function summaryOf(a: FootballAnalysis): FootballSummary {
  return {
    v: FOOTBALL_SUMMARY,
    minutes: a.minutes,
    distanceM: Math.round(a.distanceM),
    mPerMin: Math.round(a.mPerMin * 10) / 10,
    topSpeedKmh: a.topSpeedKmh,
    sprints: a.sprints,
    hiDistM: Math.round(a.hiDistM),
    fadeMinute: a.fadeMinute,
    trace: a.trace,
  }
}

/** The per-game numbers kept on the activity, so season stats don't need every stream. */
export function footballSummary(stream: Stream): FootballSummary | undefined {
  return stream.v?.length ? summaryOf(analyseFootball(stream)) : undefined
}

/** Pitches further apart than this (m) are different grounds. */
const GROUND_M = 250

export interface SeasonPitch {
  /** points on the pitch, 0–1 each way: x along the length towards the goal you attack */
  points: [number, number][]
  games: number
  /** whether the end you attacked could be told from where you stood at kick-off */
  sure: boolean
}

/**
 * A season of games laid over each other. Each ground is framed from every
 * game played on it, so a winger stays out wide. Then every half is turned to
 * face the same way: halves are matched to each other, since the toss picks
 * the ends and they change at half time, and the side of halfway you stood on
 * at kick-off says which end was yours.
 */
export function seasonPitch(traces: PitchTrace[]): SeasonPitch | undefined {
  const grounds: PitchTrace[][] = []
  for (const t of traces) {
    const g = grounds.find((x) => Math.hypot((t.at[1] - x[0].at[1]) * kxAt(t.at[0]), (t.at[0] - x[0].at[0]) * KY) < GROUND_M)
    if (g) g.push(t)
    else grounds.push([t])
  }
  // every half a segment, framed on its ground; the second half's kick-off is the surer one, since the first may catch the warm-up
  const segs: { pts: [number, number][]; weight: number }[] = []
  let games = 0
  for (const ground of grounds) {
    const ref = ground[0].at
    const placed = ground.map((t) => {
      const ox = (t.at[1] - ref[1]) * kxAt(ref[0])
      const oy = (t.at[0] - ref[0]) * KY
      const pts: [number, number][] = []
      for (let i = 0; i + 1 < t.xy.length; i += 2) pts.push([t.xy[i] + ox, t.xy[i + 1] + oy])
      return { t, pts }
    })
    const all = placed.flatMap((x) => x.pts)
    if (all.length < 20) continue
    const frame = pitchFrame(all)
    for (const { t, pts } of placed) {
      const uv = pts.map(frame)
      const halves = t.break && t.half > 0 && t.half < uv.length ? [uv.slice(0, t.half), uv.slice(t.half)] : [uv]
      halves.forEach((h, k) => segs.push({ pts: h, weight: k === 1 ? 1 : 0.5 }))
      games++
    }
  }
  if (!segs.length) return undefined

  // a coarse picture of each half, and the same turned round
  const GX = 10
  const GY = 6
  const grids = segs.map(({ pts }) => {
    const g = new Float64Array(GX * GY)
    for (const [u, v] of pts) g[Math.min(GY - 1, Math.floor(v * GY)) * GX + Math.min(GX - 1, Math.floor(u * GX))] += 1 / pts.length
    return g
  })
  const turned = grids.map((g) => g.slice().reverse())
  const turn = segs.map(() => false)
  const sum = new Float64Array(GX * GY)
  const add = (i: number, sign: number) => (turn[i] ? turned[i] : grids[i]).forEach((x, k) => (sum[k] += sign * x))
  const agree = (g: Float64Array) => g.reduce((a, x, k) => a + x * sum[k], 0)
  // the longest half first, then each faces whichever way agrees more with the rest, twice over
  const order = segs.map((_, i) => i).sort((a, b) => segs[b].pts.length - segs[a].pts.length)
  add(order[0], 1)
  for (const i of order.slice(1)) {
    turn[i] = agree(turned[i]) > agree(grids[i])
    add(i, 1)
  }
  for (let pass = 0; pass < 2; pass++)
    for (const i of order) {
      add(i, -1)
      turn[i] = agree(turned[i]) > agree(grids[i])
      add(i, 1)
    }

  // at kick-off you're in your own half: left of halfway means you attacked to the right
  let vote = 0
  let weight = 0
  segs.forEach(({ pts, weight: w }, i) => {
    const u = turn[i] ? 1 - pts[0][0] : pts[0][0]
    vote += w * clamp((0.5 - u) * 8, -1, 1)
    weight += w
  })
  const flipAll = vote < 0
  return {
    // y runs down the screen, so the far side flips: attacking to the right, your right is the bottom edge
    points: segs.flatMap(({ pts }, i) => pts.map(([u, v]) => (turn[i] !== flipAll ? [1 - u, v] : [u, 1 - v]) as [number, number])),
    games,
    sure: Math.abs(vote) / weight >= 0.3,
  }
}

/** The physical numbers we keep per game (a subset of the full analysis). */
export type Physical = Pick<FootballAnalysis, 'minutes' | 'mPerMin' | 'topSpeedKmh' | 'sprints' | 'fadeMinute' | 'distanceM'>

export interface Baseline {
  mPerMin: number
  sprintsPer10: number
  topSpeedKmh: number
  conceded: number
  n: number
}

export function baselineFor(format: Format, history: { match: Match; analysis?: Physical }[]): Baseline {
  const same = history.filter((h) => h.match.format === format)
  const withData = same.filter((h) => h.analysis && h.analysis.minutes > 0)
  return {
    mPerMin: withData.length ? median(withData.map((h) => h.analysis!.mPerMin)) : format <= 6 ? 100 : 90,
    sprintsPer10: withData.length ? median(withData.map((h) => (h.analysis!.sprints / h.analysis!.minutes) * 10)) : 3,
    topSpeedKmh: withData.length ? Math.max(...withData.map((h) => h.analysis!.topSpeedKmh)) : 99,
    conceded: same.length >= 3 ? median(same.map((h) => h.match.scoreAgainst)) : DEFAULT_CONCEDED[format],
    n: same.length,
  }
}

export interface RateInput {
  format: Format
  scoreFor: number
  scoreAgainst: number
  goals: number
  assists: number
  points: MatchPoint[]
  position: Position
  feel: number
  analysis?: Physical
  baseline: Baseline
}

const EXPECTED_SHARE: Record<Position, number> = { GK: 0.15, DEF: 0.6, MID: 1, FWD: 1.5, ANY: 1 }
const DEF_WEIGHT: Record<Position, number> = { GK: 0.6, DEF: 0.5, MID: 0.2, FWD: 0.05, ANY: 0.25 }

/**
 * Match rating on the familiar 0–10 football scale. Everyone starts on 6.0,
 * then the result, your goal involvement, defending, what you noted went well
 * and badly, work rate from the watch and your own verdict move it. Every step
 * is returned so the report can show exactly where the number came from.
 */
export function rateMatch(i: RateInput): { rating: number; breakdown: RatingFactor[] } {
  const f: RatingFactor[] = []
  const diff = i.scoreFor - i.scoreAgainst
  const big = BIG_MARGIN[i.format]

  if (diff > 0) f.push({ key: 'result', label: diff >= big ? 'Thrashing' : 'Win', value: diff >= big ? 0.6 : 0.5 })
  else if (diff === 0) f.push({ key: 'result', label: 'Draw', value: 0.1 })
  else f.push({ key: 'result', label: diff <= -big ? 'Hammered' : 'Defeat', value: diff <= -big ? -0.55 : -0.4 })

  if (i.goals + i.assists > 0 || i.position !== 'GK') {
    const exp = EXPECTED_SHARE[i.position] / i.format
    const share = i.scoreFor > 0 ? Math.min(1.2, (i.goals + 0.7 * i.assists) / i.scoreFor) : 0
    const v = clamp((share - exp) * 2.2, -0.4, 1.6) + Math.min(0.8, 0.12 * i.goals + 0.08 * i.assists)
    const parts = [i.goals && `${i.goals}G`, i.assists && `${i.assists}A`].filter(Boolean).join(' ')
    f.push({
      key: 'involvement',
      label: parts ? `${parts}, ${Math.round(share * 100)}% of team goals` : 'No goal involvement',
      value: v,
    })
  }
  if (i.goals >= 3) f.push({ key: 'hattrick', label: 'Hat-trick', value: 0.3 })

  const w = DEF_WEIGHT[i.position]
  const exp = i.baseline.conceded
  const dv = clamp((exp - i.scoreAgainst) / Math.max(exp, 1), -1, 1) * w + (i.scoreAgainst === 0 ? w * 0.4 : 0)
  if (Math.abs(dv) >= 0.05) f.push({ key: 'defence', label: i.scoreAgainst === 0 ? 'Clean sheet' : `Conceded ${i.scoreAgainst}`, value: dv })

  // each point you noted counts, a big one double, and together they move the rating POINTS_CAP at most
  const noted = i.points.reduce((a, p) => a + pointValue(p), 0)
  i.points.forEach((p, k) => f.push({ key: `point-${k}`, label: p.text, value: pointValue(p) }))
  if (Math.abs(noted) > POINTS_CAP) f.push({ key: 'pointsCap', label: `Notes count ${POINTS_CAP} at most`, value: Math.sign(noted) * POINTS_CAP - noted })

  if (i.analysis && i.analysis.minutes >= 10) {
    const a = i.analysis
    const b = i.baseline
    const distPts = clamp((a.mPerMin / b.mPerMin - 1) * 2.5, -0.4, 0.4)
    const sprintPts = clamp((((a.sprints / a.minutes) * 10) / Math.max(b.sprintsPer10, 0.5) - 1) * 0.8, -0.3, 0.3)
    f.push({
      key: 'workrate',
      label: `Work rate: ${Math.round(a.mPerMin)} m/min, ${a.sprints} sprints`,
      value: distPts + sprintPts,
    })
    if (a.topSpeedKmh > b.topSpeedKmh) f.push({ key: 'topspeed', label: `New top speed, ${a.topSpeedKmh} km/h`, value: 0.1 })
    if (a.fadeMinute !== undefined && a.fadeMinute < a.minutes * 0.8) f.push({ key: 'fade', label: `Faded from ${a.fadeMinute}'`, value: -0.1 })
  }

  f.push({ key: 'feel', label: `Your verdict: ${FEEL[i.feel]}`, value: (i.feel - 6) * 0.12 })

  const total = 6 + f.reduce((a, x) => a + x.value, 0)
  return {
    rating: round(clamp(total, 3, 10), 1),
    breakdown: f.map((x) => ({ ...x, value: round(x.value, 2) })),
  }
}

export function ratingTone(r: number): { cls: string; text: string; word: string } {
  if (r >= 9) return { cls: 'bg-strength', text: 'text-strength', word: 'World class' }
  if (r >= 8) return { cls: 'bg-z1', text: 'text-z1', word: 'Excellent' }
  if (r >= 7) return { cls: 'bg-z2', text: 'text-z2', word: 'Good' }
  if (r >= 6) return { cls: 'bg-z3', text: 'text-z3', word: 'Decent' }
  if (r >= 5) return { cls: 'bg-z4', text: 'text-z4', word: 'Poor' }
  return { cls: 'bg-z5', text: 'text-z5', word: 'Shocker' }
}

export function result(m: Pick<Match, 'scoreFor' | 'scoreAgainst'>): 'W' | 'D' | 'L' {
  return m.scoreFor > m.scoreAgainst ? 'W' : m.scoreFor === m.scoreAgainst ? 'D' : 'L'
}

export interface Rivalry {
  /** as you last typed it */
  opponent: string
  games: number
  w: number
  d: number
  l: number
  scored: number
  conceded: number
  /** your own goals and assists against them */
  goals: number
  assists: number
  avgRating: number
  last: string
}

/** Your record against each side you've played, most played first. A name matches however it was typed. */
export function headToHead(matches: Match[]): Rivalry[] {
  const by = new Map<string, Match[]>()
  for (const m of [...matches].sort((a, b) => b.date.localeCompare(a.date))) {
    const k = norm(m.opponent)
    if (k && k !== 'opposition') by.set(k, [...(by.get(k) ?? []), m])
  }
  return [...by.values()]
    .map((ms) => {
      const res = ms.map(result)
      const sum = (fn: (m: Match) => number) => ms.reduce((a, m) => a + fn(m), 0)
      return {
        opponent: ms[0].opponent.trim(),
        games: ms.length,
        w: res.filter((r) => r === 'W').length,
        d: res.filter((r) => r === 'D').length,
        l: res.filter((r) => r === 'L').length,
        scored: sum((m) => m.scoreFor),
        conceded: sum((m) => m.scoreAgainst),
        goals: sum((m) => m.goals),
        assists: sum((m) => m.assists),
        avgRating: mean(ms.map((m) => m.rating)),
        last: ms[0].date,
      }
    })
    .sort((a, b) => b.games - a.games || b.last.localeCompare(a.last))
}

const ppg = (r: Rivalry) => (3 * r.w + r.d) / r.games

/** The side you've done worst against and the one you've done best against, from two games or more each. */
export function rivals(rs: Rivalry[]): { nemesis?: Rivalry; favourite?: Rivalry } {
  const met = rs.filter((r) => r.games >= 2)
  const by = (a: Rivalry, b: Rivalry) => ppg(a) - ppg(b) || a.scored - a.conceded - (b.scored - b.conceded)
  const worst = [...met].sort(by)[0]
  const best = [...met].sort(by).reverse()[0]
  return { nemesis: worst && ppg(worst) < 1 ? worst : undefined, favourite: best && ppg(best) >= 2 ? best : undefined }
}

/** "won 2, lost 1" */
export function recordWords(r: Pick<Rivalry, 'w' | 'd' | 'l'>): string {
  return [r.w && `won ${r.w}`, r.d && `drew ${r.d}`, r.l && `lost ${r.l}`].filter(Boolean).join(', ')
}

export const sameOpponent = (a: string, b: string) => norm(a) === norm(b)

/** Tabloid back-page headline, picked from the most newsworthy thing that happened. */
export function headline(
  m: Pick<Match, 'id' | 'scoreFor' | 'scoreAgainst' | 'goals' | 'assists' | 'points' | 'team' | 'opponent' | 'rating'>,
  name: string,
  a?: Physical,
  base?: Pick<Baseline, 'mPerMin'>,
): string {
  const N = name
  const T = m.team
  const O = m.opponent
  const s = `${m.scoreFor}-${m.scoreAgainst}`
  const r = result(m)
  const word = r === 'W' ? 'win' : r === 'D' ? 'draw' : 'defeat'
  const had = (k: MomentKey) => m.points.some((p) => p.key === k)
  // a big point in your own words makes the back page, quoted, if it's short enough to fit
  const quote = (good: boolean) => {
    const p = m.points.find((x) => x.big && !x.key && x.good === good && x.text.trim().length <= 32)
    return p && `“${p.text.trim().charAt(0).toUpperCase()}${p.text.trim().slice(1)}”`
  }
  const praise = quote(true)
  const blame = quote(false)
  // tiers from most to least newsworthy; the first tier with a story wins
  const tiers: string[][] = [
    [
      ...(had('ownGoal') ? [`Own goal agony for ${N}`, `${N} scores at the wrong end`] : []),
      ...(m.goals >= 3 ? [`${N} hat-trick hero as ${T} sink ${O}`, `Treble trouble: ${N} bags ${m.goals === 3 ? 'three' : m.goals}`] : []),
      ...(m.rating >= 9 && m.goals < 3 ? [`${N} unplayable in ${s} ${word}`] : []),
    ],
    [
      ...(m.goals === 2 && r === 'W' ? [`${N}’s brace sinks ${O}`, `Double top: ${N} fires ${T} to ${s} win`] : []),
      ...(m.goals === 2 && r !== 'W' ? [`${N} brace not enough in ${s} ${word}`] : []),
      ...(m.assists >= 3 ? [`${N} pulls the strings in ${s} ${word}`, `Provider: ${N} sets up ${m.assists}`] : []),
      ...(had('worldie') ? [`What a hit! ${N} stuns ${O}`] : []),
      ...(had('sitter') && m.goals === 0 ? [`Sitter shame for ${N}`, `${N} misses a sitter as ${T} ${r === 'W' ? 'hang on' : 'pay the price'}`] : []),
      ...(had('error') ? [`Howler: ${N} gifts ${O} a goal`] : []),
      ...(praise ? [`${praise}: ${N} stars in ${s} ${word}`] : []),
      ...(blame ? [`${blame}: ${N}’s ${r === 'W' ? 'blushes spared' : 'day to forget'}`] : []),
    ],
    [
      ...(r === 'L' && m.rating >= 7 ? [`${N} the only positive in ${s} defeat`] : []),
      ...(r === 'L' && m.rating < 6 ? [`${T} crumble: ${N} posted missing`, `Nightmare for ${N} as ${O} run riot`] : []),
      ...(r === 'D' ? [`Honours even in ${s} thriller`, `Stalemate: ${T} and ${O} can’t be separated`] : []),
      ...(m.scoreAgainst === 0 ? [`${N} shuts up shop`] : []),
      ...(m.goals === 1 && r === 'W' ? [`${N} on target as ${T} beat ${O}`] : []),
    ],
    [...(a && base && a.mPerMin > base.mPerMin * 1.12 ? [`${N} runs the legs off ${O}`] : []), ...(a && a.fadeMinute !== undefined ? [`${N} fades after bright start`] : [])],
    r === 'W' ? [`${T} edge ${O} in ${s} scrap`, `Job done: ${T} see off ${O}`] : [`${T} fall ${s} to ${O}`],
  ]
  const pool = tiers.find((t) => t.length) ?? tiers[tiers.length - 1]
  return pool[hashString(m.id) % pool.length]
}

/** Headlines used to be written in capitals; show an old one the way new ones read, names included. */
export function tidyHeadline(h: string, names: string[]): string {
  if (/[a-z]/.test(h)) return h
  let out = h.toLowerCase().replace(/(^|[:!] )(\S)/g, (_, pre: string, c: string) => pre + c.toUpperCase())
  for (const n of names.filter(Boolean)) out = out.replace(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), n)
  return out
}

export function ordinal(n: number): string {
  const v = n % 100
  const suf = v >= 11 && v <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
  return `${n}${suf}`
}

export function standfirst(m: Match, a?: Physical): string {
  const what = [m.goals ? `${m.goals === 1 ? 'A goal' : `${m.goals} goals`}` : '', m.assists ? `${m.assists === 1 ? 'an assist' : `${m.assists} assists`}` : ''].filter(Boolean)
  const joined = what.join(' and ')
  const contrib = joined ? joined.charAt(0).toUpperCase() + joined.slice(1) : 'No goal involvement'
  const r = result(m)
  const outcome = r === 'W' ? `${m.scoreFor}–${m.scoreAgainst} win` : r === 'D' ? `${m.scoreFor}–${m.scoreAgainst} draw` : `${m.scoreFor}–${m.scoreAgainst} defeat`
  let s = `${contrib} in a ${outcome} against ${m.opponent}.`
  if (a && a.minutes > 10) {
    s += ` ${(a.distanceM / 1000).toFixed(1)} km covered, ${a.sprints} sprints, top speed ${a.topSpeedKmh} km/h.`
    if (a.fadeMinute !== undefined) s += ` The legs went around the ${ordinal(a.fadeMinute)} minute.`
  }
  return s
}

export interface CardAttr {
  key: string
  label: string
  value: number
  hint: string
}

export type Tier = 'bronze' | 'silver' | 'gold' | 'elite'

export interface PlayerCard {
  overall: number
  tier: Tier
  position: Position
  attrs: CardAttr[]
}

/**
 * One card across every format you play. Each game is judged against what's
 * normal in its own format first (a goal in 11s counts for more than one in
 * 7s, and a big pitch means lower metres per minute), then the scores are
 * averaged. Top speed and rating already mean the same thing in any format.
 */
export function playerCard(rows: { match: Match; analysis?: Physical }[], position: Position): PlayerCard | null {
  if (rows.length < 3) return null
  const withData = rows.filter((r) => r.analysis && r.analysis.minutes > 0)
  const an = withData.map((r) => r.analysis!)
  const ms = rows.map((r) => r.match)
  const gpg = mean(ms.map((m) => m.goals / PAR[m.format].goals))
  const apg = mean(ms.map((m) => m.assists / PAR[m.format].assists))
  const recent = [...ms].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
  const fadeShare = an.length ? an.filter((a) => a.fadeMinute !== undefined).length / an.length : 0
  const sta = withData.map(({ match, analysis: a }) => mapRange(a!.mPerMin, ...ENGINE_RANGE[match.format].mPerMin, 45, 95))
  const wrk = withData.map(({ match, analysis: a }) => mapRange((a!.sprints / a!.minutes) * 10, ...ENGINE_RANGE[match.format].sprintsPer10, 45, 95))
  const attrs: CardAttr[] = [
    {
      key: 'PAC',
      label: 'Pace',
      value: an.length
        ? mapRange(
            quantile(
              an.map((a) => a.topSpeedKmh),
              0.9,
            ),
            20,
            31,
            45,
            96,
          )
        : 50,
      hint: 'Your top speeds, in any format',
    },
    { key: 'STA', label: 'Stamina', value: sta.length ? mean(sta) - fadeShare * 8 : 50, hint: 'Metres per minute for the format, minus late fades' },
    { key: 'WRK', label: 'Work rate', value: wrk.length ? mean(wrk) : 50, hint: 'Sprints per 10 minutes for the format' },
    { key: 'SHO', label: 'Shooting', value: mapRange(gpg, 0, 1.6, 40, 96), hint: 'Goals per game against what’s normal in the format' },
    { key: 'PAS', label: 'Passing', value: mapRange(apg, 0, 1.6, 40, 95), hint: 'Assists per game against what’s normal in the format' },
    { key: 'FRM', label: 'Form', value: mapRange(mean(recent.map((m) => m.rating)), 5, 9, 40, 99), hint: 'Average rating, last 5 in any format' },
  ].map((a) => ({ ...a, value: Math.round(clamp(a.value, 1, 99)) }))
  const overall = Math.round(mean(attrs.map((a) => a.value)) + 6)
  const tier: Tier = overall >= 85 ? 'elite' : overall >= 75 ? 'gold' : overall >= 65 ? 'silver' : 'bronze'
  return { overall: Math.min(99, overall), tier, position, attrs }
}
