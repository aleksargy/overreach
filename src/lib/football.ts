import type { Activity, FootballSummary, Format, Match, MatchPoint, MomentKey, PitchTrace, Position, RatingFactor, Stream } from '../data/types'
import { clamp, mapRange, mean, median, quantile, round } from './math'

/** What a point you note is worth, a big one, and the most your notes can move a rating either way. */
export const POINT = 0.15
export const BIG_POINT = 0.3
export const POINTS_CAP = 0.6

export const pointValue = (p: MatchPoint) => (p.good ? 1 : -1) * (p.big ? BIG_POINT : POINT)

/** The fixed moments games were rated with before notes. Old games are still read with them; they're no longer offered. */
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

/**
 * What to offer when you add a point: the ones you've written before, most used first. Only your own words:
 * nothing ready-made, so a point that came from the old moments isn't offered either.
 */
export function suggestPoints(matches: Match[]): MatchPoint[] {
  const used = new Map<string, { p: MatchPoint; n: number }>()
  // newest first, so a point keeps the size you gave it last time
  for (const m of matches) for (const p of m.points) if (!p.key) used.set(norm(p.text), { p: used.get(norm(p.text))?.p ?? p, n: (used.get(norm(p.text))?.n ?? 0) + 1 })
  return [...used.values()].sort((a, b) => b.n - a.n).map((x) => ({ text: x.p.text, good: x.p.good, big: x.p.big }))
}

/**
 * What you usually play, from the games you've logged: the format and the position you've had most (the latest
 * breaks a tie) and the team you last played for. There's no setting for any of it; before a first game it's empty.
 */
export function usualOf(matches: Pick<Match, 'date' | 'format' | 'position' | 'team'>[]): { format?: Format; position?: Position; team?: string } {
  const newest = [...matches].sort((a, b) => b.date.localeCompare(a.date))
  const most = <T>(pick: (m: (typeof newest)[number]) => T): T | undefined => {
    const n = new Map<T, number>()
    for (const m of newest) n.set(pick(m), (n.get(pick(m)) ?? 0) + 1)
    // a Map keeps the order things were first seen in, newest first, so the latest wins a tie
    return [...n.entries()].reduce<[T, number] | undefined>((best, x) => (!best || x[1] > best[1] ? x : best), undefined)?.[0]
  }
  return { format: most((m) => m.format), position: most((m) => m.position), team: newest[0]?.team }
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
/** walking is up to this (7 km/h), jogging from here to HI_MPS, running from there to SPRINT_MPS */
export const WALK_MPS = 7 / 3.6

/** Half a minute averaging under this (m/s) is standing about: before kick-off, at half time, after the whistle. */
const STAND_V = 0.6
/** Three seconds at this (m/s) is jogging or faster, which nobody does at half time or walking off. */
const RUN_V = 2.5
/** A minute is play when you jogged in it or covered this much (m); walking off covers less. */
const PLAY_M = 100
/** The shortest half time (s): a minute when you paused the watch, about two standing about. Anything shorter is a stoppage. */
const PAUSE_S = 60
const STAND_S = 100
/** Either side of half time there's at least this much play (s), and neither half is more than HALVES times the other. */
const HALF_S = 300
const HALVES = 1.5

/** A moving average over w samples, centred on each one. */
function smooth(xs: readonly number[], w: number): Float64Array {
  const n = xs.length
  const pre = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + (xs[i] || 0)
  const out = new Float64Array(n)
  const h = Math.floor(w / 2)
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - h)
    const b = Math.min(n, i - h + w)
    out[i] = (pre[b] - pre[a]) / Math.max(1, b - a)
  }
  return out
}

/**
 * When the watch was paused, as [from, to) seconds. Streams carry it (`Stream.pauses`); one decoded before
 * they did shows it in its samples instead: the gap was filled with no speed and no heart rate and the last
 * position held, from 10 s (GAP_S in netlify/lib/fit) after the last sample before it. Nothing recording
 * reads exactly that for 20 s.
 */
export function pausesOf(stream: Stream): [number, number][] {
  if (stream.pauses) return stream.pauses
  const { dt, hr, lat, lon } = stream
  const v = stream.v ?? []
  const out: [number, number][] = []
  for (let i = 0, from = -1; i <= v.length; i++) {
    const filled = i < v.length && v[i] === 0 && (!hr || hr[i] === 0) && (!lat || !lon || (i > 0 && lat[i] === lat[i - 1] && lon[i] === lon[i - 1]))
    if (filled && from < 0) from = i
    else if (!filled && from >= 0) {
      if ((i - from) * dt >= 20) out.push([Math.max(0, from * dt - 10), i * dt])
      from = -1
    }
  }
  return out
}

/** Where a game's parts fall, in seconds from the start of the recording. */
export interface Phases {
  kickOff: number
  /** the final whistle */
  end: number
  /** the half-time break, [from, to): when you paused the watch, or stood about; undefined for a game played straight through */
  halfTime?: { from: number; to: number; paused: boolean }
  /** the second half starts at the end of half time, or halfway through play */
  second: number
}

/**
 * Kick-off, half time and the final whistle. Play is the minutes you jogged in or covered PLAY_M, from the
 * first to the last of them, so standing about before kick-off and the walk off after the whistle are left
 * out. Half time is a pause of the watch if there's one between two halves, otherwise a spell of standing
 * about: whichever is longest, counting for more the more evenly it splits the game, with a half of play
 * either side and neither half more than HALVES times the other. A warm-up makes the first side long, and
 * then the first half starts where the standing about before it ends. Edges are found to the second, and a
 * pause takes in any standing about either side of it.
 */
export function phasesOf(stream: Stream): Phases {
  const dt = stream.dt
  const v = stream.v ?? []
  const n = v.length
  const total = n * dt
  const samples = (s: number) => Math.max(1, Math.round(s / dt))
  const at = (s: number) => Math.min(n, Math.max(0, Math.round(s / dt)))
  const s30 = smooth(v, samples(30))
  const s5 = smooth(v, samples(5))
  const s3 = smooth(v, samples(3))
  const ran = (a: number, b: number) => {
    for (let i = a; i < b; i++) if (s3[i] >= RUN_V) return true
    return false
  }

  const play: boolean[] = []
  for (let m = 0; m * 60 < total; m++) {
    const [a, b] = [at(m * 60), at((m + 1) * 60)]
    let d = 0
    for (let i = a; i < b; i++) d += v[i] * dt
    play.push(d >= PLAY_M || ran(a, b))
  }
  const first = play.indexOf(true)
  if (first < 0) return { kickOff: 0, end: total, second: total / 2 }
  const last = play.lastIndexOf(true)
  // to the second: from when you first moved in the first minute of play, to when you last did in the last
  let k = at(first * 60)
  while (k < at((first + 1) * 60) - 1 && s5[k] < STAND_V) k++
  let e = at((last + 1) * 60)
  while (e > at(last * 60) + 1 && s5[e - 1] < STAND_V) e--

  // a stretch's edges to the second: in from any moving a half-minute average smooths over, then out over standing either side
  const settle = (a: number, b: number, lo: number, hi: number, exact: boolean): [number, number] => {
    if (!exact) {
      while (a < b && s5[a] >= STAND_V) a++
      while (b > a && s5[b - 1] >= STAND_V) b--
    }
    while (a > lo && s5[a - 1] < STAND_V) a--
    while (b < hi && s5[b] < STAND_V) b++
    return [a, b]
  }
  // spells of standing about, joined across a short walk with no jogging in it (to the bench and back)
  const joined: [number, number][] = []
  for (let i = 0, a = -1; i <= n; i++) {
    const still = i < n && s30[i] < STAND_V
    if (still && a < 0) a = i
    else if (!still && a >= 0) {
      const prev = joined[joined.length - 1]
      if (prev && (a - prev[1]) * dt <= 60 && !ran(prev[1], a)) prev[1] = i
      else joined.push([a, i])
      a = -1
    }
  }
  const spells = joined.map(([a, b]) => settle(a, b, 0, n, false)).filter(([a, b]) => b > a)
  // where the first half starts if this is half time, or nothing if it can't be. When play before the break runs
  // much longer than after it, it began with a warm-up: the first half starts where lining up for kick-off ends, the
  // earliest minute or more of standing about that leaves a first half of half to 1.3 times the second
  const firstHalf = ({ a, b }: { a: number; b: number }) => {
    const d2 = e - b
    if (a <= k || d2 * dt < HALF_S) return undefined
    let from = k
    if (a - k > 1.3 * d2) from = spells.find(([x, y]) => (y - x) * dt >= 60 && y >= a - 1.3 * d2 && y <= a - 0.5 * d2)?.[1] ?? k
    const d1 = a - from
    return d1 * dt >= HALF_S && d1 <= HALVES * d2 && d2 <= HALVES * d1 ? { from, even: Math.min(d1, d2) / Math.max(d1, d2) } : undefined
  }
  // the longest break wins, the more so the more evenly it splits the game: a long stoppage in one half loses to a shorter half time
  const best = (cs: { a: number; b: number; paused: boolean }[]) =>
    cs
      .map((c) => ({ ...c, fit: firstHalf(c) }))
      .filter((c) => c.fit)
      .sort((x, y) => (y.b - y.a) * y.fit!.even ** 2 - (x.b - x.a) * x.fit!.even ** 2)[0]
  const ht =
    best(
      pausesOf(stream)
        .filter(([a, b]) => b - a >= PAUSE_S)
        .map(([a, b]) => ({ a: at(a), b: at(b), paused: true })),
    ) ?? best(spells.filter(([a, b]) => (b - a) * dt >= STAND_S).map(([a, b]) => ({ a, b, paused: false })))
  if (!ht) return { kickOff: k * dt, end: e * dt, second: ((k + e) * dt) / 2 }
  const from = ht.fit!.from
  // a pause takes in any standing about either side of it
  const [a, b] = ht.paused ? settle(ht.a, ht.b, Math.max(from, ht.a - samples(300)), Math.min(e, ht.b + samples(300)), true) : [ht.a, ht.b]
  return { kickOff: from * dt, end: e * dt, halfTime: { from: a * dt, to: b * dt, paused: ht.paused }, second: b * dt }
}

export interface Bucket {
  startMin: number
  distM: number
  avgHr?: number
  sprints: number
}

/** One half, from its kick-off to its whistle. */
export interface Half {
  /** seconds from the start of the recording, [from, to) */
  from: number
  to: number
  minutes: number
  distanceM: number
  mPerMin: number
  /** metres over HI_MPS */
  hiDistM: number
  sprints: number
  topSpeedKmh: number
  avgHr?: number
}

/** Metres in play at each speed: walking (under WALK_MPS), jogging (to HI_MPS), running (to SPRINT_MPS) and sprinting. */
export interface Bands {
  walk: number
  jog: number
  run: number
  sprint: number
}

export interface FootballAnalysis {
  /** minutes played: kick-off to the final whistle, without half time */
  minutes: number
  /** the whole recording, as the watch measured it */
  distanceM: number
  /** metres a minute played */
  mPerMin: number
  topSpeedKmh: number
  sprints: number
  hiDistM: number
  avgHr?: number
  maxHr?: number
  buckets: Bucket[]
  fadeMinute?: number
  halves: [Half, Half]
  bands: Bands
  /** points in pitch space, x along the length, both 0–1 */
  heat: [number, number][]
  /** index into heat where the second half starts */
  half: number
  /** the half-time break in seconds from the start, [from, to); undefined if the game ran straight through */
  halfTime?: { from: number; to: number; paused: boolean }
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

/** A fade lasts at least this many minutes, to the final whistle. */
const FADE_MIN = 10

/**
 * Fading: from some minute of the second half to the final whistle, every five minutes under 90% of your
 * first half's metres a minute, and all of it under 85%, for FADE_MIN minutes or more. Its minute is the
 * first one that was down. Anything less clear says nothing: a second half that restarts a little slower,
 * or a quiet spell you came back from, isn't a fade.
 */
function fadeOf(cum: (s: number) => number, [first, second]: [Half, Half]): number | undefined {
  const ref = first.mPerMin
  const full = Math.floor(second.minutes)
  if (first.minutes < 10 || full < FADE_MIN || !ref) return undefined
  const m = Array.from({ length: full }, (_, k) => cum(second.from + 60 * (k + 1)) - cum(second.from + 60 * k))
  const five = (k: number) => (m[k] + m[k + 1] + m[k + 2] + m[k + 3] + m[k + 4]) / 5
  // back from the whistle while every five minutes stays down
  let from = full - 5
  while (from >= 0 && five(from) < 0.9 * ref) from--
  for (let s = from + 1; full - s >= FADE_MIN; s++) {
    if (mean(m.slice(s)) >= 0.85 * ref) continue
    let k = s
    while (k < s + 4 && m[k] >= 0.9 * ref) k++
    return Math.round((second.from + 60 * k) / 60)
  }
  return undefined
}

export function analyseFootball(stream: Stream): FootballAnalysis {
  const dt = stream.dt
  const v = stream.v ?? []
  const hr = stream.hr ?? []
  const n = v.length
  const ph = phasesOf(stream)
  const at = (s: number) => Math.min(n, Math.max(0, Math.round(s / dt)))
  // distance so far: the watch's own when it kept one, otherwise from speed
  const d = stream.d
  const own = !!d && d.length === n && d[n - 1] > d[0]
  const pre = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + v[i] * dt
  const cum = (s: number) => (own ? d![Math.min(n - 1, at(s))] - d![0] : pre[at(s)])

  // a sprint is SPRINT_MPS held for 2 s, at least 3 s after the last one
  const sprintAt: number[] = []
  for (let i = 0, run = 0, cool = 99; i < n; i++) {
    if (v[i] >= SPRINT_MPS) {
      run += dt
      if (run >= 2 && cool >= 3) {
        sprintAt.push(i * dt)
        cool = 0
        run = -999
      }
    } else {
      run = 0
      cool += dt
    }
  }

  const halfOf = (from: number, to: number): Half => {
    let hi = 0
    let top = 0
    const hs: number[] = []
    for (let i = at(from); i < at(to); i++) {
      if (v[i] > HI_MPS) hi += v[i] * dt
      top = Math.max(top, v[i])
      if (hr[i] > 0) hs.push(hr[i])
    }
    const minutes = Math.max(0, to - from) / 60
    const distanceM = Math.max(0, cum(to) - cum(from))
    return {
      from,
      to,
      minutes,
      distanceM,
      mPerMin: minutes ? distanceM / minutes : 0,
      hiDistM: hi,
      sprints: sprintAt.filter((t) => t >= from && t < to).length,
      topSpeedKmh: round(top * 3.6, 1),
      avgHr: hs.length ? Math.round(mean(hs)) : undefined,
    }
  }
  const halves: [Half, Half] = [halfOf(ph.kickOff, ph.halfTime?.from ?? ph.second), halfOf(ph.second, ph.end)]
  const inPlay = (s: number) => halves.some((h) => s >= h.from && s < h.to)

  const bands: Bands = { walk: 0, jog: 0, run: 0, sprint: 0 }
  for (const h of halves) for (let i = at(h.from); i < at(h.to); i++) bands[v[i] >= SPRINT_MPS ? 'sprint' : v[i] > HI_MPS ? 'run' : v[i] >= WALK_MPS ? 'jog' : 'walk'] += v[i] * dt

  const total = (n * dt) / 60
  const buckets: Bucket[] = []
  for (let b = 0; b * 5 < total; b++) {
    const hs: number[] = []
    for (let i = at(b * 300); i < at((b + 1) * 300); i++) if (hr[i]) hs.push(hr[i])
    buckets.push({
      startMin: b * 5,
      distM: Math.max(0, cum((b + 1) * 300) - cum(b * 300)),
      avgHr: hs.length ? Math.round(mean(hs)) : undefined,
      sprints: sprintAt.filter((t) => t >= b * 300 && t < (b + 1) * 300).length,
    })
  }

  const minutes = halves[0].minutes + halves[1].minutes
  const played = halves[0].distanceM + halves[1].distanceM
  const hs = hr.filter((x, i) => x > 0 && inPlay(i * dt))

  // the heatmap is where you played: a point every 2 s of each half
  const every = Math.max(1, Math.round(2 / dt))
  const kept: number[] = []
  for (let i = 0; i < (stream.lat ?? []).length; i += every) if (inPlay(i * dt)) kept.push(i)
  const lat = kept.map((i) => stream.lat![i])
  const lon = kept.map((i) => stream.lon![i])
  // projectToPitch skips points with no fix, so count only those up to the second half
  const half = kept.filter((i, k) => i * dt < ph.second && lat[k] && lon[k]).length
  // and a coarser record of the same, small enough to keep for every game
  const every15 = Math.max(1, Math.round(15 / dt))
  const sparse = kept.filter((i) => i % every15 < every && stream.lat![i] && stream.lon![i])

  return {
    minutes,
    // the watch's own distance when it recorded one, so the report agrees with the activity
    distanceM: own ? d![n - 1] - d![0] : pre[n],
    mPerMin: minutes ? played / minutes : 0,
    topSpeedKmh: Math.max(halves[0].topSpeedKmh, halves[1].topSpeedKmh),
    sprints: halves[0].sprints + halves[1].sprints,
    hiDistM: halves[0].hiDistM + halves[1].hiDistM,
    avgHr: hs.length ? Math.round(mean(hs)) : undefined,
    maxHr: hs.length ? Math.max(...hs) : undefined,
    buckets,
    fadeMinute: fadeOf(cum, halves),
    halves,
    bands,
    heat: projectToPitch(lat, lon),
    half,
    halfTime: ph.halfTime,
    trace: traceOf(sparse, stream, ph.second, !!ph.halfTime),
  }
}

function traceOf(idx: number[], stream: Stream, secondS: number, hadBreak: boolean): PitchTrace | undefined {
  if (idx.length < 20) return undefined
  const at: [number, number] = [round(mean(idx.map((i) => stream.lat![i])), 5), round(mean(idx.map((i) => stream.lon![i])), 5)]
  const kx = kxAt(at[0])
  const xy = idx.flatMap((i) => [Math.round((stream.lon![i] - at[1]) * kx), Math.round((stream.lat![i] - at[0]) * KY)])
  return { at, xy, half: idx.filter((i) => i * stream.dt < secondS).length, break: hadBreak }
}

/**
 * Bump when the per-game summary gains something: sync makes older ones again from the stored stream.
 * 3: half time to the second (the pause, or standing about), minutes and metres a minute counted from
 * kick-off to the final whistle without half time, and the fade judged against your own first half.
 */
export const FOOTBALL_SUMMARY = 3

export function summaryOf(a: FootballAnalysis): FootballSummary {
  return {
    v: FOOTBALL_SUMMARY,
    minutes: round(a.minutes, 1),
    distanceM: Math.round(a.distanceM),
    // as worked out, so a rating line made from it rounds the way the report's own number does
    mPerMin: a.mPerMin,
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

/** What fading late takes off a rating. */
const FADE = -0.1
const workRateLine = (a: Pick<Physical, 'mPerMin' | 'sprints'>) => `Work rate: ${Math.round(a.mPerMin)} m/min, ${a.sprints} sprints`
const topSpeedLine = (kmh: number) => `New top speed, ${kmh} km/h`
const fadeLine = (minute: number) => `Faded from ${minute}'`

/**
 * A saved rating's lines from the watch, brought up to date with its game's summary. Ratings saved before
 * FOOTBALL_SUMMARY 3 counted half time in metres a minute, and their fade was judged against minutes 3–20, so
 * a second half that restarted a little slower read as one. Once the summary is current the fade line follows
 * it (in or out, moving the rating 0.1) and the work-rate and top-speed lines say what the report shows.
 */
export function withWatchLines(m: Match, s: FootballSummary | undefined): Match {
  if (!s || (s.v ?? 1) < FOOTBALL_SUMMARY || !m.breakdown.some((f) => f.key === 'workrate')) return m
  let change = 0
  const lines = m.breakdown.flatMap((f): RatingFactor[] => {
    if (f.key === 'workrate') return [{ ...f, label: workRateLine(s) }]
    if (f.key === 'topspeed') return [{ ...f, label: topSpeedLine(s.topSpeedKmh) }]
    if (f.key !== 'fade') return [f]
    if (s.fadeMinute !== undefined) return [{ ...f, label: fadeLine(s.fadeMinute) }]
    change -= f.value
    return []
  })
  if (s.fadeMinute !== undefined && !lines.some((f) => f.key === 'fade')) {
    // where rateMatch puts it: last of the watch's lines, before your verdict
    const at = lines.findIndex((f) => f.key === 'feel')
    lines.splice(at < 0 ? lines.length : at, 0, { key: 'fade', label: fadeLine(s.fadeMinute), value: FADE })
    change += FADE
  }
  if (!change && lines.every((f, i) => f.label === m.breakdown[i]?.label)) return m
  return { ...m, breakdown: lines, rating: round(clamp(m.rating + change, 3, 10), 1) }
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
    f.push({ key: 'workrate', label: workRateLine(a), value: distPts + sprintPts })
    if (a.topSpeedKmh > b.topSpeedKmh) f.push({ key: 'topspeed', label: topSpeedLine(a.topSpeedKmh), value: 0.1 })
    // a fade is only found with ten minutes of it to go, so it's never just the last few minutes
    if (a.fadeMinute !== undefined) f.push({ key: 'fade', label: fadeLine(a.fadeMinute), value: FADE })
  }

  f.push({ key: 'feel', label: `Your verdict: ${FEEL[i.feel]}`, value: (i.feel - 6) * 0.12 })

  const total = 6 + f.reduce((a, x) => a + x.value, 0)
  return {
    rating: round(clamp(total, 3, 10), 1),
    breakdown: f.map((x) => ({ ...x, value: round(x.value, 2) })),
  }
}

/** A rating's band: its colour (as a class, a text class and the variable behind both) and its word. */
export function ratingTone(r: number): { cls: string; text: string; v: string; word: string } {
  if (r >= 9) return { cls: 'bg-strength', text: 'text-strength', v: '--strength', word: 'World class' }
  if (r >= 8) return { cls: 'bg-z1', text: 'text-z1', v: '--z1', word: 'Excellent' }
  if (r >= 7) return { cls: 'bg-z2', text: 'text-z2', v: '--z2', word: 'Good' }
  if (r >= 6) return { cls: 'bg-z3', text: 'text-z3', v: '--z3', word: 'Decent' }
  // red from 5 down: the ochre zone colour is kept for zone charts
  if (r >= 5) return { cls: 'bg-z5', text: 'text-z5', v: '--z5', word: 'Poor' }
  return { cls: 'bg-z5', text: 'text-z5', v: '--z5', word: 'Shocker' }
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

export function ordinal(n: number): string {
  const v = n % 100
  const suf = v >= 11 && v <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
  return `${n}${suf}`
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
