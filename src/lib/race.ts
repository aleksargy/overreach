// The race you're training for: goal pace, weekly volume, and where a taper
// usually lands. Pure logic; the Run tab draws it.

import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { Activity, Race, Stream } from '../data/types'
import { clock } from './format'

export const DISTANCES = [
  { m: 5000, label: '5K' },
  { m: 10_000, label: '10K' },
  { m: 21_097.5, label: 'Half' },
  { m: 42_195, label: 'Marathon' },
] as const

export const raceName = (m: number) => DISTANCES.find((d) => d.m === m)?.label ?? `${(m / 1000).toFixed(1)} km`

/** "3:30" means 3 h 30 for a half or longer and 3 min 30 below it; "3:29:59" is always h:mm:ss. */
export function parseGoal(text: string, distanceM: number): number | undefined {
  const m = text.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return undefined
  const [a, b, c] = [Number(m[1]), Number(m[2]), m[3] === undefined ? undefined : Number(m[3])]
  if (b > 59 || (c ?? 0) > 59) return undefined
  if (c !== undefined) return a * 3600 + b * 60 + c
  return distanceM >= 21_000 ? a * 3600 + b * 60 : a * 60 + b
}

/**
 * Adds the colons to what's typed on the iPhone's number pad, which has none: for a half or
 * longer 330 is 3:30 and 33000 is 3:30:00, below it 1930 is 19:30. Five or six digits are always h:mm:ss.
 */
export function typeGoal(text: string, distanceM: number): string {
  const d = text.replace(/\D/g, '').slice(0, 6)
  if (d.length >= 5) return `${d.slice(0, -4)}:${d.slice(-4, -2)}:${d.slice(-2)}`
  const parts = distanceM >= 21_000 ? [d.slice(0, 1), d.slice(1, 3), d.slice(3)] : [d.slice(0, 2), d.slice(2)]
  return parts.filter(Boolean).join(':')
}

export function formatGoal(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.round(s % 60)
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

/** The pace (s/km) that makes the goal, rounded down: 3:30 for a marathon needs 4:58, since 4:59 finishes over. */
export const goalPaceS = (r: Race) => (r.goalS ? Math.floor(r.goalS / (r.distanceM / 1000)) : undefined)

export const daysTo = (r: Race, now: Date) => differenceInCalendarDays(parseISO(r.date), now)

/** Running km in 7-day blocks back from now: index 0 is the last seven days. */
export function weeklyKm(activities: Activity[], now: Date, weeks = 10): number[] {
  const t = now.getTime()
  const out = Array.from({ length: weeks }, () => 0)
  for (const a of activities) {
    if (a.sport !== 'run' || !a.distanceM) continue
    const i = Math.floor((t - Date.parse(a.start)) / (7 * 86_400_000))
    if (i >= 0 && i < weeks) out[i] += a.distanceM / 1000
  }
  return out
}

/**
 * Where weekly volume usually lands in a taper, as a share of your biggest
 * week: common coaching guidance (three weeks for a marathon, two for a half,
 * one below that), not a rule. Undefined outside the taper.
 */
export function taperShare(daysOut: number, distanceM: number): [number, number] | undefined {
  const week = Math.ceil(daysOut / 7) // 1 is race week
  if (daysOut < 0 || week < 1) return undefined
  if (distanceM >= 42_000) return week === 1 ? [0.4, 0.5] : week === 2 ? [0.6, 0.75] : week === 3 ? [0.75, 0.85] : undefined
  if (distanceM >= 21_000) return week === 1 ? [0.5, 0.6] : week === 2 ? [0.75, 0.85] : undefined
  return week === 1 ? [0.6, 0.8] : undefined
}

// ---------- after the race ----------

/** Runs that were races: marked as a race on the watch, or the one on the day of the race you set in Settings. Newest first. */
export function racesIn(activities: Activity[], race?: Race): Activity[] {
  const onTheDay = race?.date
    ? activities
        .filter((a) => a.sport === 'run' && a.start.slice(0, 10) === race.date && (a.distanceM ?? 0) >= race.distanceM * 0.9)
        .sort((a, b) => (b.distanceM ?? 0) - (a.distanceM ?? 0))[0]
    : undefined
  return activities.filter((a) => a.sport === 'run' && (a.kind === 'race' || a === onTheDay))
}

/** The race this run was: the one set in Settings if it's that day, else the standard distance it's close to, else its own. */
export function raceFor(a: Activity, race?: Race): Race {
  if (race?.date && a.start.slice(0, 10) === race.date) return race
  const d = a.distanceM ?? 0
  const std = DISTANCES.find((x) => Math.abs(d - x.m) <= x.m * 0.06)
  return { date: a.start.slice(0, 10), distanceM: std?.m ?? d }
}

export interface RaceSplit {
  /** where the split ends, metres along the course */
  toM: number
  s: number
  hr?: number
}

export interface RaceReport {
  race: Race
  timeS: number
  splits: RaceSplit[]
  /** seconds ahead (+) or behind (−) of goal pace, or of an even pace when there's no goal, every 250 m */
  gap: { m: number; s: number }[]
  halves: [number, number]
  settledHr?: number
  finishHr?: number
  /** metres in where heart rate first sat 5 bpm above where it settled (half marathon and up) */
  driftM?: number
  /** metres in where the pace fell away and stayed down */
  fadeM?: number
  /** your best before this one at the distance */
  bestS?: number
  headline: string
}

/** "3:30" for a goal of whole minutes over an hour, "3:29:30" or "19:30" otherwise */
const short = (s: number) => (s >= 3600 && s % 60 === 0 ? clock(s).slice(0, -3) : clock(s))

/**
 * What happened in a race, from its stream. The watch measures a course a bit
 * long, so distances are scaled to the race distance and the finish is the
 * time on the watch.
 */
export function raceReport(a: Activity, st: Stream, opts: { race?: Race; earlier: Activity[]; name: string }): RaceReport | undefined {
  const race = raceFor(a, opts.race)
  const D = race.distanceM
  const n = st.d?.length ?? st.v?.length ?? 0
  if (n < 10 || !D) return undefined
  let sum = 0
  const raw = st.d?.length ? st.d : (st.v ?? []).map((v) => (sum += v * st.dt))
  const end = raw[n - 1] - raw[0]
  if (end < D * 0.85) return undefined
  const T = a.durationS
  const dist = raw.map((x) => ((x - raw[0]) * D) / end)
  // the stream's samples spread over the time on the watch, the last one at the finish
  const tOf = (i: number) => (i * T) / (n - 1)
  /** seconds from the start to `m` metres in */
  const at = (m: number) => {
    let lo = 0
    let hi = n - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (dist[mid] < m) lo = mid
      else hi = mid
    }
    const f = dist[hi] > dist[lo] ? (m - dist[lo]) / (dist[hi] - dist[lo]) : 0
    return tOf(lo) + (tOf(hi) - tOf(lo)) * Math.min(1, Math.max(0, f))
  }
  const hrBetween = (m0: number, m1: number) => {
    const hs = (st.hr ?? []).filter((h, i) => h > 0 && dist[i] >= m0 && dist[i] < m1)
    return hs.length ? Math.round(hs.reduce((x, y) => x + y, 0) / hs.length) : undefined
  }

  const splitM = D >= 21_000 ? 5000 : 1000
  const splits: RaceSplit[] = []
  for (let m0 = 0; m0 < D - 1; m0 += splitM) {
    const m1 = Math.min(D, m0 + splitM)
    splits.push({ toM: m1, s: at(m1) - at(m0), hr: hrBetween(m0, m1) })
  }
  const per = (race.goalS ?? T) / D
  const gap: { m: number; s: number }[] = []
  for (let m = 0; m <= D; m += 250) gap.push({ m, s: per * m - at(m) })
  if (gap[gap.length - 1].m < D) gap.push({ m: D, s: per * D - T })

  const halves: [number, number] = [at(D / 2), T - at(D / 2)]
  const hrs = (st.hr ?? []).map((h, i) => ({ h, m: dist[i] })).filter((x) => x.h > 0)
  const sorted = hrs
    .filter((x) => x.m >= D * 0.1 && x.m < D * 0.2)
    .map((x) => x.h)
    .sort((p, q) => p - q)
  const settledHr = sorted.length ? sorted[Math.floor(sorted.length / 2)] : undefined
  let driftM: number | undefined
  if (settledHr && D >= 21_000) {
    for (let m = D * 0.2; m < D && driftM === undefined; m += 250) if ((hrBetween(m, m + 1000) ?? 0) >= settledHr + 5) driftM = m
  }
  // the pace falls away once a stretch runs 4% slower than the first half and stays there to the end
  const w = Math.max(1000, D * 0.07)
  const firstHalf = halves[0] / (D / 2)
  let fadeM: number | undefined
  for (let m = D / 2; m + w <= D; m += 250) {
    if ((at(m + w) - at(m)) / w > firstHalf * 1.04 && (T - at(m)) / (D - m) > firstHalf * 1.04) {
      fadeM = m
      break
    }
  }
  const before = opts.earlier.filter((x) => x.sport === 'run' && x.start < a.start && Math.abs((x.distanceM ?? 0) - D) <= D * 0.04).map((x) => x.durationS)
  const bestS = before.length ? Math.min(...before) : undefined
  const report = { race, timeS: T, splits, gap, halves, settledHr, finishHr: hrBetween(D * 0.9, D + 1), driftM, fadeM, bestS, headline: '' }
  report.headline = raceHeadline(report, opts.name)
  return report
}

function raceHeadline(r: RaceReport, name: string): string {
  const t = clock(r.timeS)
  const label = raceName(r.race.distanceM).replace(/^(Half|Marathon)$/, (x) => x.toLowerCase())
  const at = (m: number) => `${Math.round(m / 1000)} km`
  if (r.race.goalS !== undefined) {
    const under = r.race.goalS - r.timeS
    const goal = short(r.race.goalS)
    if (under >= 120) return `${name} smashes the ${goal} target in ${t}`
    if (under >= 0) return `Sub-${goal}! ${name} beats the clock by ${clock(under)}`
    if (r.fadeM !== undefined) return `Legs go at ${at(r.fadeM)} as ${name} misses ${goal} by ${clock(-under)}`
    return `${name} falls ${clock(-under)} short of ${goal}`
  }
  if (r.bestS !== undefined && r.timeS < r.bestS) return `New PB: ${name} runs ${t} for the ${label}`
  if (r.halves[1] < r.halves[0]) return `${name} saves the best for last in ${t}`
  if (r.fadeM !== undefined && r.race.distanceM >= 10_000) return `The wall at ${at(r.fadeM)}: ${name} hangs on for ${t}`
  return `${name} clocks ${t} for the ${label}`
}
