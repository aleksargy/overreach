import { addDays, differenceInCalendarDays, parseISO, startOfDay } from 'date-fns'
import type { Activity, Daily, Profile, ZoneSeconds } from '../data/types'
import { median, round } from './math'
import { isoDay } from './format'

/**
 * Max and resting HR from what the watch measured, for when Garmin's zone settings don't say: resting is the
 * middle of your last 28 mornings, max the second highest of your three highest readings in a year (so one spike
 * from a loose strap doesn't count). Each is left out when there isn't enough to go on.
 */
export function heartRatesFrom(dailies: Pick<Daily, 'date' | 'rhr'>[], activities: Pick<Activity, 'start' | 'maxHr'>[], now: Date): { hrMax?: number; hrRest?: number } {
  const since = isoDay(addDays(now, -28))
  const rests = dailies.filter((d) => d.date >= since && d.rhr && d.rhr > 30 && d.rhr < 100).map((d) => d.rhr!)
  const yearAgo = addDays(now, -365).getTime()
  const tops = activities
    .filter((a) => Date.parse(a.start) >= yearAgo && a.maxHr && a.maxHr > 120 && a.maxHr < 230)
    .map((a) => a.maxHr!)
    .sort((a, b) => b - a)
  return { ...(tops.length >= 3 ? { hrMax: tops[1] } : {}), ...(rests.length >= 7 ? { hrRest: Math.round(median(rests)) } : {}) }
}

/** Lower bound (bpm) of zones 1–5: your Garmin zones once synced, else 50–90% of max HR, the way Garmin defaults them. */
export function zoneBounds(p: Pick<Profile, 'hrMax' | 'zones'>): number[] {
  if (p.zones?.length === 5) return p.zones
  return [0.5, 0.6, 0.7, 0.8, 0.9].map((f) => Math.round(p.hrMax * f))
}

export function zoneOf(hr: number, bounds: number[]): number {
  for (let z = 4; z >= 0; z--) if (hr >= bounds[z]) return z
  return 0
}

export function zoneSecondsFromHr(hr: number[], dt: number, bounds: number[]): ZoneSeconds {
  const out: ZoneSeconds = [0, 0, 0, 0, 0]
  for (const h of hr) if (h > 0) out[zoneOf(h, bounds)] += dt
  return out
}

/** Spread a session around its average HR when there is no HR stream. */
export function zoneSecondsFromAvg(avgHr: number, durationS: number, bounds: number[]): ZoneSeconds {
  const z = zoneOf(avgHr, bounds)
  const out: ZoneSeconds = [0, 0, 0, 0, 0]
  out[z] += durationS * 0.6
  out[Math.max(0, z - 1)] += durationS * 0.25
  out[Math.min(4, z + 1)] += durationS * 0.15
  return out
}

/** Edwards TRIMP: minutes in each zone weighted 1–5. */
export const trimp = (zs: ZoneSeconds) => round(zs.reduce((acc, s, i) => acc + (s / 60) * (i + 1), 0))

/** Foster session-RPE load, scaled to sit on the same axis as TRIMP. */
export const srpeLoad = (minutes: number, srpe: number) => round(minutes * srpe * 0.25)

export interface LoadDay {
  date: string
  load: number
  bySport: Partial<Record<Activity['sport'], number>>
}

export function dailyLoads(activities: Activity[], days: number, today = new Date()): LoadDay[] {
  const end = startOfDay(today)
  const start = addDays(end, -(days - 1))
  const out: LoadDay[] = Array.from({ length: days }, (_, i) => ({
    date: isoDay(addDays(start, i)),
    load: 0,
    bySport: {},
  }))
  for (const a of activities) {
    const i = differenceInCalendarDays(parseISO(a.start), start)
    if (i < 0 || i >= days) continue
    out[i].load += a.load
    out[i].bySport[a.sport] = (out[i].bySport[a.sport] ?? 0) + a.load
  }
  return out
}

export interface LoadModel {
  days: LoadDay[]
}

/** Each day's load, by sport, over the last `days` days. */
export function loadModel(activities: Activity[], days = 84, today = new Date()): LoadModel {
  return { days: dailyLoads(activities, days, today) }
}
