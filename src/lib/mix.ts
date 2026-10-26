// How your running splits between easy, tempo and hard, week by week, and
// this block of training against the one before. Pure logic; the Run tab draws it.
//
// Easy is zones 1–3: on Garmin's zones zone 3 is "aerobic", where easy and
// long runs sit, and on zones from max heart rate it tops out at 80%. Zone 4
// is threshold work, zone 5 above it.

import { addWeeks, startOfISOWeek } from 'date-fns'
import type { Activity } from '../data/types'

const DAY = 86_400_000
/** a long run, for counting: an hour and a half or more */
const LONG_S = 90 * 60

export interface WeekMix {
  start: Date
  /** seconds of running in zones 1–3, 4 and 5 */
  easyS: number
  tempoS: number
  hardS: number
}

/** Running time by zone for each of the last `weeks` weeks, Monday to Sunday, oldest first. */
export function weeklyMix(activities: Activity[], now: Date, weeks = 12): WeekMix[] {
  const first = addWeeks(startOfISOWeek(now), -(weeks - 1))
  const out = Array.from({ length: weeks }, (_, i) => ({ start: addWeeks(first, i), easyS: 0, tempoS: 0, hardS: 0 }))
  for (const a of activities) {
    if (a.sport !== 'run') continue
    const t = Date.parse(a.start)
    const i = out.findIndex((w, k) => t >= w.start.getTime() && (k === weeks - 1 || t < out[k + 1].start.getTime()))
    if (i < 0) continue
    const z = a.zoneS
    out[i].easyS += z[0] + z[1] + z[2]
    out[i].tempoS += z[3]
    out[i].hardS += z[4]
  }
  return out
}

export interface Block {
  runs: number
  kmPerWeek: number
  /** runs of 90 minutes or more */
  longRuns: number
  /** share of running time in zones 1–3 */
  easy: number
  /** minutes a week in zones 4–5 */
  hardMin: number
}

/** The runs from `from` up to `to`, as one block of training. */
export function blockOf(activities: Activity[], from: Date, to: Date): Block {
  const runs = activities.filter((a) => a.sport === 'run' && Date.parse(a.start) >= from.getTime() && Date.parse(a.start) < to.getTime())
  const weeks = (to.getTime() - from.getTime()) / (7 * DAY)
  const time = (zones: number[]) => runs.reduce((s, a) => s + zones.reduce((t, z) => t + a.zoneS[z], 0), 0)
  const total = time([0, 1, 2, 3, 4])
  return {
    runs: runs.length,
    kmPerWeek: runs.reduce((s, a) => s + (a.distanceM ?? 0), 0) / 1000 / weeks,
    longRuns: runs.filter((a) => a.durationS >= LONG_S).length,
    easy: total ? time([0, 1, 2]) / total : 0,
    hardMin: time([3, 4]) / 60 / weeks,
  }
}
