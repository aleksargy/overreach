import { addDays, differenceInCalendarDays, parseISO, startOfDay } from 'date-fns'
import type { Activity, Profile, ZoneSeconds } from '../data/types'
import { ewma, round } from './math'
import { isoDay } from './format'

/** Lower bound (bpm) of zones 1–5, as % of max HR, the way Garmin defaults them. */
export function zoneBounds(p: Pick<Profile, 'hrMax'>): number[] {
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
  acute: number[]
  chronic: number[]
  ratio: number[]
}

/** Acute:chronic workload ratio from 7- and 28-day EWMAs. */
export function loadModel(activities: Activity[], days = 84, today = new Date()): LoadModel {
  const ds = dailyLoads(activities, days, today)
  const loads = ds.map((d) => d.load)
  const acute = ewma(loads, 7)
  const chronic = ewma(loads, 28)
  const ratio = acute.map((a, i) => (chronic[i] > 1 ? a / chronic[i] : 1))
  return { days: ds, acute, chronic, ratio }
}

export function acwrLabel(r: number): { label: string; tone: 'good' | 'warn' | 'bad' | 'low' } {
  if (r < 0.8) return { label: 'Detraining', tone: 'low' }
  if (r <= 1.3) return { label: 'Sweet spot', tone: 'good' }
  if (r <= 1.5) return { label: 'Pushing it', tone: 'warn' }
  return { label: 'Danger zone', tone: 'bad' }
}
