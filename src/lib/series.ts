// Your numbers as series for `standout` (lib/standout) to look through: each
// one only says what it's called, which end is good news and how to write a
// value. What counts as news is decided there, from your own history.

import { addWeeks, startOfISOWeek } from 'date-fns'
import type { Activity, BodyEntry, Daily, Exercise, Match, Workout } from '../data/types'
import { clock, km } from './format'
import { fmtKg, historyFor, topOf } from './lift'
import { BEST_M, BEST_NAME } from './running'
import type { Series } from './standout'

/** a morning's reading has to be the most extreme in three weeks to be worth a mention */
const DAILY = 21

const noon = (day: string) => Date.parse(`${day}T12:00:00`)
const hm = (s: number) => `${Math.floor(s / 3600)}h${String(Math.round((s % 3600) / 60)).padStart(2, '0')}`

/** This morning against your other mornings. Days oldest first. */
export function recoverySeries(dailies: Daily[]): Series[] {
  const of = (pick: (d: Daily) => number | undefined) => dailies.flatMap((d) => (pick(d) ? [{ t: noon(d.date), v: pick(d)! }] : []))
  return [
    { key: 'hrv', what: 'HRV', points: of((d) => d.hrv), top: 'Highest', bottom: 'Lowest', good: 'top', format: (v) => `${Math.round(v)} ms`, min: DAILY },
    { key: 'rhr', what: 'resting heart rate', points: of((d) => d.rhr), top: 'Highest', bottom: 'Lowest', good: 'bottom', format: (v) => `${Math.round(v)} bpm`, min: DAILY },
    { key: 'sleep', what: 'night’s sleep', points: of((d) => d.sleepS), top: 'Longest', bottom: 'Shortest', good: 'top', format: hm, min: DAILY },
  ]
}

/** Your runs: how far the last one went, how big last week was, and how fast you covered each distance. Any order. A run is news the day it's run and the day after. */
export function runSeries(activities: Activity[], now: Date): Series[] {
  const runs = activities.filter((a) => a.sport === 'run' && a.distanceM).sort((a, b) => a.start.localeCompare(b.start))
  if (!runs.length) return []
  const t = (a: Activity) => Date.parse(a.start)
  // whole weeks only, Monday to Sunday: a week is news once it's finished, not while it's still filling up
  const weeks: { t: number; v: number }[] = []
  for (let w = startOfISOWeek(new Date(t(runs[0]))); addWeeks(w, 1) <= now; w = addWeeks(w, 1)) {
    const end = addWeeks(w, 1).getTime()
    weeks.push({ t: end, v: runs.filter((a) => t(a) >= w.getTime() && t(a) < end).reduce((s, a) => s + a.distanceM!, 0) })
  }
  return [
    { key: 'long', what: 'run', points: runs.map((a) => ({ t: t(a), v: a.distanceM! })), top: 'Longest', good: 'top', format: (v) => `${km(v, 1)} km`, min: 10, fresh: 2 },
    { key: 'week', what: 'week of running', points: weeks, top: 'Biggest', good: 'top', format: (v) => `${Math.round(v / 1000)} km`, min: 6, fresh: 2 },
    ...BEST_M.slice(0, 4).map((_, k): Series => ({
      key: `best-${k}`,
      what: BEST_NAME[k].toLowerCase(),
      points: runs.flatMap((a) => (a.run?.bestD?.[k] ? [{ t: t(a), v: a.run.bestD[k] }] : [])),
      bottom: 'Fastest',
      good: 'bottom',
      format: clock,
      min: 10,
      fresh: 2,
    })),
  ]
}

/** Every lift you've logged: the most you moved in a session. Workouts in any order. */
export function liftSeries(workouts: Workout[], exercises: Map<string, Exercise>): Series[] {
  const ids = new Set(workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId)))
  return [...ids].flatMap((id): Series[] => {
    const ex = exercises.get(id)
    if (!ex) return []
    const sessions = historyFor(id, workouts).reverse()
    const loaded = ex.kind === 'weight' || ex.kind === 'weighted-bodyweight'
    return [
      {
        key: `lift-${id}`,
        what: loaded ? ex.name.toLowerCase() : `${ex.name.toLowerCase()}${ex.kind === 'duration' ? ' hold' : ' set'}`,
        points: sessions.map((h) => ({ t: Date.parse(h.date), v: topOf(ex, h.sets) })).filter((p) => p.v > 0),
        top: loaded ? 'Heaviest' : ex.kind === 'duration' ? 'Longest' : 'Biggest',
        good: 'top',
        format: (v) => (ex.kind === 'weight' ? `${fmtKg(v)} kg` : ex.kind === 'weighted-bodyweight' ? `+${fmtKg(v)} kg` : ex.kind === 'duration' ? `${v} s` : `${v} reps`),
        min: 3,
        fresh: 2,
        count: 'sessions',
      },
    ]
  })
}

/** Your games in one format: the rating you gave, and what the watch saw. */
export function footballSeries(matches: Match[], games: Activity[]): Series[] {
  const byGame = [...games].filter((a) => a.football).sort((a, b) => a.start.localeCompare(b.start))
  const of = (pick: (a: Activity) => number) => byGame.map((a) => ({ t: Date.parse(a.start), v: pick(a) })).filter((p) => p.v > 0)
  const base = { min: 8, fresh: 3, count: 'games', good: 'top' } as const
  return [
    {
      ...base,
      key: 'rating',
      what: 'rating',
      points: [...matches].sort((a, b) => a.date.localeCompare(b.date)).map((m) => ({ t: Date.parse(m.date), v: m.rating })),
      top: 'Best',
      bottom: 'Lowest',
      format: (v) => v.toFixed(1),
    },
    { ...base, key: 'sprints', what: 'sprints', points: of((a) => a.football!.sprints), top: 'Most', format: (v) => String(v) },
    { ...base, key: 'top', what: 'top speed', points: of((a) => a.football!.topSpeedKmh), top: 'Highest', format: (v) => `${v.toFixed(1)} km/h` },
    { ...base, key: 'ground', what: 'ground covered', points: of((a) => a.football!.distanceM), top: 'Most', format: (v) => `${km(v, 1)} km` },
  ]
}

/** Your weigh-ins, any order. Neither end is good or bad: that's yours to say. */
export function weightSeries(body: BodyEntry[]): Series[] {
  const points = body
    .filter((b) => b.weightKg)
    .map((b) => ({ t: noon(b.date.slice(0, 10)), v: b.weightKg! }))
    .sort((a, b) => a.t - b.t)
  return [{ key: 'weight', what: 'weigh-in', points, top: 'Heaviest', bottom: 'Lightest', format: (v) => `${v.toFixed(1)} kg`, min: 10, fresh: 2 }]
}
