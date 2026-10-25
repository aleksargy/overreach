// The race you're training for: goal pace, weekly volume, and where a taper
// usually lands. Pure logic; the Run tab draws it.

import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { Activity, Race } from '../data/types'

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
