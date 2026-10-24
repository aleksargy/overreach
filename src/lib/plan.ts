import { differenceInCalendarDays, parseISO } from 'date-fns'
import { LEG_MUSCLES } from '../data/exercises'
import type { Activity, Exercise, Muscle, Routine, Workout } from '../data/types'
import { isWorking } from './lift'

export interface PlanInput {
  now: Date
  routines: Routine[]
  /** finished workouts, newest first */
  workouts: Workout[]
  exercises: Map<string, Exercise>
  /** newest first */
  activities: Activity[]
  nextFootball?: { at: Date; label: string } | null
  readiness?: number
}

export interface RoutineStatus {
  routine: Routine
  lastDone?: string
  daysSince?: number
  legShare: number
  sets: number
  /** why this routine isn't today's pick, if it's ruled out */
  blocked?: string
}

export interface LiftPlan {
  routine: Routine
  reasons: string[]
  statuses: RoutineStatus[]
  /** readiness is low: suggestions are capped at RPE 7 */
  easy: boolean
}

/** Share of a routine's sets that hit the legs. */
export function legShare(r: Routine, exercises: Map<string, Exercise>): number {
  let legs = 0
  let total = 0
  for (const it of r.items) {
    const e = exercises.get(it.exerciseId)
    if (!e) continue
    total += it.sets
    if (LEG_MUSCLES.includes(e.muscle)) legs += it.sets
  }
  return total ? legs / total : 0
}

const ago = (d: number) => (d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`)

/**
 * Which routine to do next. The longest-neglected routine wins, unless it
 * would put heavy legs within 40 hours of a game, a day after one, or repeat
 * something trained in the last two days.
 */
export function planNext(i: PlanInput): LiftPlan | null {
  if (!i.routines.length) return null
  const hoursToGame = i.nextFootball ? (i.nextFootball.at.getTime() - i.now.getTime()) / 3.6e6 : Infinity
  const lastGame = i.activities.find((a) => a.sport === 'football')
  const hoursSinceGame = lastGame ? (i.now.getTime() - (Date.parse(lastGame.start) + lastGame.durationS * 1000)) / 3.6e6 : Infinity

  const statuses: RoutineStatus[] = i.routines.map((r) => {
    const last = i.workouts.find((w) => w.routineId === r.id)
    const daysSince = last ? differenceInCalendarDays(i.now, parseISO(last.start)) : undefined
    const ls = legShare(r, i.exercises)
    let blocked: string | undefined
    if (ls >= 0.4 && hoursToGame < 40) blocked = `${r.name} can wait: ${i.nextFootball!.label}, so keep the legs fresh.`
    else if (ls >= 0.4 && hoursSinceGame < 24) blocked = `${r.name} can wait: your legs are still recovering from the game.`
    else if (daysSince !== undefined && daysSince < 2) blocked = `${r.name} was ${ago(daysSince)}.`
    return { routine: r, lastDone: last?.start, daysSince, legShare: ls, sets: r.items.reduce((a, x) => a + x.sets, 0), blocked }
  })

  // never-done routines rank as most overdue; ties keep your routine order
  const ranked = [...statuses].sort((a, b) => Number(!!a.blocked) - Number(!!b.blocked) || (b.daysSince ?? 99) - (a.daysSince ?? 99))
  const pick = ranked[0]
  const reasons: string[] = []
  if (pick.blocked) reasons.push(`Everything was trained recently, so this is the least bad option. ${pick.blocked}`)
  else if (pick.daysSince === undefined) reasons.push(`You haven't done ${pick.routine.name} yet.`)
  else reasons.push(`${pick.routine.name} has waited longest: last done ${ago(pick.daysSince)}.`)
  for (const s of statuses) if (s !== pick && s.blocked && reasons.length < 3) reasons.push(s.blocked)
  const easy = i.readiness !== undefined && i.readiness < 45
  if (easy) reasons.push(`Readiness is ${i.readiness}, so every set stops at RPE 7.`)
  return { routine: pick.routine, reasons, statuses, easy }
}

/** Working sets per muscle in the last `days` days: primary counts 1, secondary 0.5. */
export function setsByMuscle(workouts: Workout[], exercises: Map<string, Exercise>, now: Date, days = 7): Map<Muscle, number> {
  const out = new Map<Muscle, number>()
  const since = now.getTime() - days * 86_400_000
  for (const w of workouts) {
    if (Date.parse(w.start) < since) continue
    for (const we of w.exercises) {
      const e = exercises.get(we.exerciseId)
      if (!e) continue
      const n = we.sets.filter(isWorking).length
      if (!n) continue
      out.set(e.muscle, (out.get(e.muscle) ?? 0) + n)
      for (const m of e.secondary ?? []) out.set(m, (out.get(m) ?? 0) + n * 0.5)
    }
  }
  return out
}
