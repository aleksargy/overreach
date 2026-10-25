import type { Activity, Format, Match, MomentKey, Position, RatingFactor, Stream } from '../data/types'
import { clamp, mapRange, mean, median, quantile, round } from './math'
import { hashString } from './rng'

export const MOMENTS: { key: MomentKey; label: string; delta: number }[] = [
  { key: 'worldie', label: 'Scored a worldie', delta: 0.3 },
  { key: 'nutmeg', label: 'Nutmeg', delta: 0.1 },
  { key: 'lastDitch', label: 'Last-ditch tackle', delta: 0.2 },
  { key: 'bigSave', label: 'Big save', delta: 0.2 },
  { key: 'sitter', label: 'Missed a sitter', delta: -0.2 },
  { key: 'error', label: 'Error for a goal', delta: -0.3 },
  { key: 'ownGoal', label: 'Own goal', delta: -0.4 },
  { key: 'lostHead', label: 'Lost my head', delta: -0.2 },
]

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

export const SPRINT_MPS = 5.0 // 18 km/h
export const HI_MPS = 4.0 // 14.4 km/h

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
  half: number
}

/** Rotate GPS points so the long axis of your movement runs left to right, then frame them. */
export function projectToPitch(lat: number[], lon: number[]): [number, number][] {
  const pts: [number, number][] = []
  let lat0 = 0
  let lon0 = 0
  let n = 0
  for (let i = 0; i < lat.length; i++) {
    if (!lat[i] || !lon[i]) continue
    lat0 += lat[i]
    lon0 += lon[i]
    n++
  }
  if (n < 10) return []
  lat0 /= n
  lon0 /= n
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180)
  const ky = 110_540
  for (let i = 0; i < lat.length; i++) {
    if (!lat[i] || !lon[i]) continue
    pts.push([(lon[i] - lon0) * kx, (lat[i] - lat0) * ky])
  }
  let cxx = 0
  let cyy = 0
  let cxy = 0
  for (const [x, y] of pts) {
    cxx += x * x
    cyy += y * y
    cxy += x * y
  }
  const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy)
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  const rot = pts.map(([x, y]) => [x * c + y * s, -x * s + y * c] as [number, number])
  const us = rot.map((p) => p[0])
  const vs = rot.map((p) => p[1])
  const u0 = quantile(us, 0.01)
  const u1 = quantile(us, 0.99)
  const v0 = quantile(vs, 0.01)
  const v1 = quantile(vs, 0.99)
  return rot.map(([u, v]) => [clamp((u - u0) / (u1 - u0 || 1), 0, 1), clamp((v - v0) / (v1 - v0 || 1), 0, 1)])
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
  const sprintsByHalf: [number, number] = [0, 0]
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
        sprintsByHalf[i < n / 2 ? 0 : 1]++
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

  // Fade: the first minute after half time where your 5-minute rolling output
  // stays under 80% of your minutes 3–20 for five minutes straight. Breaks
  // (half time, a drink) are dropped first so they don't count as a fade.
  let fadeMinute: number | undefined
  const active = perMin.map((d, m) => ({ d: d ?? 0, m })).filter((x) => x.d > 25)
  if (active.length >= 24) {
    const ds = active.map((x) => x.d)
    const base = mean(ds.slice(3, Math.min(20, Math.floor(ds.length / 2))))
    const roll = ds.map((_, i) => mean(ds.slice(Math.max(0, i - 4), i + 1)))
    for (let i = Math.floor(ds.length / 2); i < ds.length - 5; i++) {
      if (roll.slice(i, i + 5).every((x) => x < base * 0.8)) {
        fadeMinute = active[Math.max(0, i - 2)].m
        break
      }
    }
  }

  // the watch's own distance when it recorded one, so the report agrees with the activity
  const d = stream.d
  if (d && d.length === n && d[n - 1] > d[0]) dist = d[n - 1] - d[0]

  const hs = hr.filter((x) => x > 0)
  const every = Math.max(1, Math.round(2 / dt))
  const lat = (stream.lat ?? []).filter((_, i) => i % every === 0)
  const lon = (stream.lon ?? []).filter((_, i) => i % every === 0)

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
    half: Math.floor(lat.length / 2),
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
  moments: MomentKey[]
  position: Position
  feel: number
  analysis?: Physical
  baseline: Baseline
}

const EXPECTED_SHARE: Record<Position, number> = { GK: 0.15, DEF: 0.6, MID: 1, FWD: 1.5, ANY: 1 }
const DEF_WEIGHT: Record<Position, number> = { GK: 0.6, DEF: 0.5, MID: 0.2, FWD: 0.05, ANY: 0.25 }

/**
 * Match rating on the familiar 0–10 football scale. Everyone starts on 6.0,
 * then the result, your goal involvement, defending, moments, work rate from
 * the watch and your own verdict move it. Every step is returned so the
 * report can show exactly where the number came from.
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

  for (const m of MOMENTS) if (i.moments.includes(m.key)) f.push({ key: m.key, label: m.label, value: m.delta })

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

/** Tabloid back-page headline, picked from the most newsworthy thing that happened. */
export function headline(
  m: Pick<Match, 'id' | 'scoreFor' | 'scoreAgainst' | 'goals' | 'assists' | 'moments' | 'team' | 'opponent' | 'rating'>,
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
  // tiers from most to least newsworthy; the first tier with a story wins
  const tiers: string[][] = [
    [
      ...(m.moments.includes('ownGoal') ? [`Own goal agony for ${N}`, `${N} scores at the wrong end`] : []),
      ...(m.goals >= 3 ? [`${N} hat-trick hero as ${T} sink ${O}`, `Treble trouble: ${N} bags ${m.goals === 3 ? 'three' : m.goals}`] : []),
      ...(m.rating >= 9 && m.goals < 3 ? [`${N} unplayable in ${s} ${word}`] : []),
    ],
    [
      ...(m.goals === 2 && r === 'W' ? [`${N}’s brace sinks ${O}`, `Double top: ${N} fires ${T} to ${s} win`] : []),
      ...(m.goals === 2 && r !== 'W' ? [`${N} brace not enough in ${s} ${word}`] : []),
      ...(m.assists >= 3 ? [`${N} pulls the strings in ${s} ${word}`, `Provider: ${N} sets up ${m.assists}`] : []),
      ...(m.moments.includes('worldie') ? [`What a hit! ${N} stuns ${O}`] : []),
      ...(m.moments.includes('sitter') && m.goals === 0 ? [`Sitter shame for ${N}`, `${N} misses a sitter as ${T} ${r === 'W' ? 'hang on' : 'pay the price'}`] : []),
      ...(m.moments.includes('error') ? [`Howler: ${N} gifts ${O} a goal`] : []),
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
