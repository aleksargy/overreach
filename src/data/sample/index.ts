// The sample athlete: twelve weeks of runs, rides, swims, 5-a-side, lifting
// and watch health, generated deterministically per calendar day so the data
// stays stable as days pass and only new days get added.

import { addDays, addMinutes, differenceInCalendarWeeks, getDay, setHours, setMinutes, startOfDay } from 'date-fns'
import { analyseFootball, baselineFor, headline, rateMatch, type FootballAnalysis } from '../../lib/football'
import { isoDay } from '../../lib/format'
import { srpeLoad, trimp, zoneBounds, zoneSecondsFromAvg, zoneSecondsFromHr } from '../../lib/load'
import { liftSummary } from '../../lib/lift'
import { clamp, mean, round } from '../../lib/math'
import { rng, type Rng } from '../../lib/rng'
import { BUILTIN_EXERCISES, BUILTIN_ROUTINES } from '../exercises'
import type { Activity, BodyEntry, Daily, Format, Match, MomentKey, Profile, SetEntry, Stream, Workout } from '../types'
import { footballStream, rideStream, runStream, swimStream } from './streams'

export const SAMPLE_PROFILE: Profile = {
  name: 'Alex',
  hrMax: 192,
  hrRest: 48,
  team: 'Bibs',
  opponent: 'Non-bibs',
  format: 5,
  position: 'ANY',
}

const DAYS = 84

type Slot = { key: string; sport: Activity['sport']; kind: string; h: number; m: number; mins?: number; routine?: string; format?: Format }

function slotsFor(date: Date, week: number, r: Rng): Slot[] {
  const dow = getDay(date)
  const s: Slot[] = []
  const skip = (p: number) => r.chance(p)
  switch (dow) {
    case 1:
      if (r.chance(0.35)) s.push({ key: 'am', sport: 'run', kind: 'easy', h: 7, m: 5 })
      if (!skip(0.1)) s.push({ key: 'lift', sport: 'strength', kind: 'push-a', h: 18, m: 30, routine: 'push-a' })
      break
    case 2:
      if (!skip(0.08)) s.push({ key: 'fb', sport: 'football', kind: '5', h: 21, m: 0, mins: 60, format: 5 })
      break
    case 3:
      if (!skip(0.1)) s.push({ key: 'run', sport: 'run', kind: week % 2 ? 'intervals' : 'tempo', h: 7, m: 0 })
      break
    case 4:
      if (week % 2 && !skip(0.2)) s.push({ key: 'swim', sport: 'swim', kind: 'pool', h: 7, m: 15 })
      if (!skip(0.1)) s.push({ key: 'lift', sport: 'strength', kind: week % 2 ? 'pull-a' : 'calisthenics', h: 18, m: 30, routine: week % 2 ? 'pull-a' : 'calisthenics' })
      break
    case 5:
      if (r.chance(0.6)) s.push({ key: 'ride', sport: 'ride', kind: 'commute', h: 8, m: 10 })
      break
    case 6:
      if (!skip(0.1)) s.push({ key: 'run', sport: 'run', kind: week % 3 === 2 ? 'easy' : 'long', h: 9, m: 0 })
      break
    case 0:
      if (week % 2 === 0) {
        if (!skip(0.1)) s.push({ key: 'fb', sport: 'football', kind: '7', h: 10, m: 30, mins: 70, format: 7 })
      } else if (!skip(0.15)) s.push({ key: 'ride', sport: 'ride', kind: 'endurance', h: 9, m: 0 })
      if (!skip(0.3)) s.push({ key: 'lift', sport: 'strength', kind: 'legs-a', h: 17, m: 0, routine: 'legs-a' })
      break
  }
  return s
}

const RUN_NAMES: Record<string, string> = { easy: 'Easy run', tempo: 'Tempo run', intervals: 'Track reps', long: 'Long run' }

function summarise(a: Activity, stream: Stream, bounds: number[]): Activity {
  const n = stream.v?.length ?? stream.hr?.length ?? 0
  const durationS = n * stream.dt
  const hr = (stream.hr ?? []).filter((x) => x > 0)
  const dist = stream.d?.length ? stream.d[stream.d.length - 1] : (stream.v ?? []).reduce((acc, v) => acc + v * stream.dt, 0)
  let gain = 0
  const alt = stream.alt ?? []
  for (let i = 1; i < alt.length; i++) if (alt[i] > alt[i - 1]) gain += alt[i] - alt[i - 1]
  const zoneS = zoneSecondsFromHr(stream.hr ?? [], stream.dt, bounds)
  const avgHr = Math.round(mean(hr))
  return {
    ...a,
    durationS,
    distanceM: Math.round(dist),
    elevGainM: alt.length ? Math.round(gain) : undefined,
    avgHr,
    maxHr: Math.max(...hr),
    avgSpeed: dist / durationS,
    maxSpeed: Math.max(...(stream.v ?? [0])),
    avgPower: stream.pwr ? Math.round(mean(stream.pwr.filter((p) => p > 0))) : undefined,
    avgCadence: stream.cad ? Math.round(mean(stream.cad.filter((c) => c > 0))) : undefined,
    calories: Math.round((durationS / 60) * avgHr * 0.075),
    zoneS,
    load: trimp(zoneS),
    hasStream: true,
  }
}

export function sampleStreamFor(a: Activity): Stream | null {
  if (a.source !== 'sample') return null
  switch (a.sport) {
    case 'run':
      return runStream(a.id, a.kind ?? 'easy').stream
    case 'ride':
      return rideStream(a.id, a.kind ?? 'endurance')
    case 'swim':
      return swimStream(a.id).stream
    case 'football':
      return footballStream(a.id, (Number(a.kind) || 5) as Format, Math.round(a.durationS / 60))
    default:
      return null
  }
}

// ---------- strength ----------

const START_KG: Record<string, number> = {
  'bench-press': 70,
  'overhead-press': 42.5,
  'incline-db-press': 24,
  'lateral-raise': 9,
  'triceps-pushdown': 25,
  'pull-up': 5,
  'barbell-row': 62.5,
  'lat-pulldown': 55,
  'face-pull': 20,
  'barbell-curl': 30,
  'back-squat': 85,
  'romanian-deadlift': 80,
  'bulgarian-split-squat': 18,
  'leg-curl': 40,
  'calf-raise': 60,
  dips: 7.5,
}

type LiftState = { kg: number; reps: number }

function simulateWorkout(id: string, routineId: string, start: Date, state: Map<string, LiftState>, r: Rng): Workout {
  const routine = BUILTIN_ROUTINES.find((x) => x.id === routineId)!
  const exercises = routine.items.map((item, idx) => {
    const ex = BUILTIN_EXERCISES.find((e) => e.id === item.exerciseId)!
    const [lo, hi] = ex.repRange
    const st = state.get(ex.id) ?? { kg: START_KG[ex.id] ?? 0, reps: lo + 1 }
    const sets: SetEntry[] = []
    if (idx === 0 && ex.kind === 'weight') {
      sets.push({ id: `${id}-${ex.id}-w1`, kind: 'warmup', kg: round((st.kg * 0.5) / 2.5) * 2.5, reps: 8, done: true })
      sets.push({ id: `${id}-${ex.id}-w2`, kind: 'warmup', kg: round((st.kg * 0.75) / 2.5) * 2.5, reps: 4, done: true })
    }
    const rpes: number[] = []
    const vals: number[] = []
    for (let k = 0; k < item.sets; k++) {
      const v = Math.max(1, st.reps - (k >= 2 && r.chance(0.4) ? 1 : 0))
      const rpe = clamp(Math.round((7 + k * 0.5 + r.normal(0, 0.4)) * 2) / 2, 6, 10)
      rpes.push(rpe)
      vals.push(v)
      sets.push({
        id: `${id}-${ex.id}-${k}`,
        kind: 'working',
        kg: ex.kind === 'weight' || ex.kind === 'weighted-bodyweight' ? st.kg : undefined,
        reps: ex.kind === 'duration' ? undefined : v,
        secs: ex.kind === 'duration' ? v : undefined,
        rpe,
        done: true,
      })
    }
    if (Math.min(...vals) >= hi && Math.max(...rpes) <= 8.5 && ex.increment) state.set(ex.id, { kg: st.kg + ex.increment, reps: lo })
    else state.set(ex.id, { kg: st.kg, reps: Math.min(hi, st.reps + (r.chance(0.6) ? (ex.kind === 'duration' ? 3 : 1) : 0)) })
    return { id: `${id}-${ex.id}`, exerciseId: ex.id, sets }
  })
  const mins = r.int(52, 72)
  return {
    id,
    name: routine.name,
    routineId,
    start: start.toISOString(),
    end: addMinutes(start, mins).toISOString(),
    exercises,
    srpe: r.pick([7, 7, 8, 8, 9]),
    source: 'sample',
  }
}

// ---------- football ----------

const OPPONENTS = ['Inter Ya Nan', 'Athletico Lethargic', 'Lokomotiv Lager', 'Borussia Teeth', 'Ajax Trays', 'Dynamo Kickers', 'Sporting Chance', 'Hertha Ankle']
const NOTES = [
  'Keeper rotation killed us second half.',
  'Left foot is finally coming along.',
  'Calf went tight after half an hour.',
  'Pitch was a swamp.',
  'Their number 9 was an absolute unit.',
  'Should have squared it for the third.',
  '',
  '',
  '',
]

function poisson(r: Rng, lambda: number) {
  const L = Math.exp(-lambda)
  let k = 0
  let p = 1
  do {
    k++
    p *= r()
  } while (p > L)
  return k - 1
}

function sampleMatch(a: Activity, analysis: FootballAnalysis, history: { match: Match; analysis?: FootballAnalysis }[], profile: Profile): Match {
  const r = rng(`match:${a.id}`)
  const format = (Number(a.kind) || 5) as Format
  const five = format <= 6
  const scoreFor = poisson(r, five ? 7 : 3.6)
  const scoreAgainst = poisson(r, five ? 6.6 : 3.3)
  let goals = 0
  let assists = 0
  for (let g = 0; g < scoreFor; g++) {
    if (r.chance(five ? 0.24 : 0.16)) goals++
    else if (r.chance(five ? 0.17 : 0.12)) assists++
  }
  const moments: MomentKey[] = []
  const pool: [MomentKey, number][] = [
    ['nutmeg', 0.25],
    ['lastDitch', 0.2],
    ['worldie', goals ? 0.18 : 0],
    ['bigSave', five ? 0.15 : 0.03],
    ['sitter', 0.22],
    ['error', 0.08],
    ['ownGoal', 0.03],
    ['lostHead', 0.06],
  ]
  for (const [k, p] of pool) if (r.chance(p)) moments.push(k)
  const res = Math.sign(scoreFor - scoreAgainst)
  const feel = clamp(Math.round(5.5 + res * 0.8 + goals * 0.6 + assists * 0.3 + r.normal(0, 1)), 2, 10)
  const flipSides = r.chance(0.5)
  const team = five ? (flipSides ? 'Non-bibs' : 'Bibs') : 'Real Ale Madrid'
  const opponent = five ? (flipSides ? 'Bibs' : 'Non-bibs') : r.pick(OPPONENTS)
  const position = five ? profile.position : 'MID'
  const baseline = baselineFor(format, history)
  const { rating, breakdown } = rateMatch({ format, scoreFor, scoreAgainst, goals, assists, moments, position, feel, analysis, baseline })
  const m: Match = {
    id: `m-${a.id}`,
    activityId: a.id,
    date: a.start,
    format,
    team,
    opponent,
    scoreFor,
    scoreAgainst,
    goals,
    assists,
    moments,
    position,
    feel,
    notes: r.pick(NOTES) || undefined,
    rating,
    breakdown,
    headline: '',
    createdAt: a.start,
  }
  m.headline = headline(m, profile.name, analysis, baseline)
  return m
}

// ---------- assemble ----------

export interface SampleData {
  activities: Activity[]
  dailies: Daily[]
  matches: Match[]
  workouts: Workout[]
  body: BodyEntry[]
  analyses: Map<string, FootballAnalysis>
}

export function buildSample(now = new Date(), profile: Profile = SAMPLE_PROFILE): SampleData {
  const bounds = zoneBounds(profile)
  const first = addDays(startOfDay(now), -(DAYS - 1))
  const activities: Activity[] = []
  const workouts: Workout[] = []
  const liftState = new Map<string, LiftState>()
  const analyses = new Map<string, FootballAnalysis>()

  for (let i = 0; i < DAYS; i++) {
    const day = addDays(first, i)
    const iso = isoDay(day)
    const r = rng(`day:${iso}`)
    const week = differenceInCalendarWeeks(day, new Date(2026, 0, 5), { weekStartsOn: 1 })
    for (const slot of slotsFor(day, week, r)) {
      const start = setMinutes(setHours(day, slot.h), slot.m + r.int(-6, 6))
      const id = `s-${iso}-${slot.key}`
      const sr = rng(id)
      const base: Activity = {
        id,
        source: 'sample',
        sport: slot.sport,
        kind: slot.kind,
        name: '',
        start: start.toISOString(),
        durationS: 0,
        zoneS: [0, 0, 0, 0, 0],
        load: 0,
        hasStream: false,
      }
      let a: Activity
      if (slot.sport === 'run') {
        const { stream, laps } = runStream(id, slot.kind)
        a = { ...summarise(base, stream, bounds), laps, name: RUN_NAMES[slot.kind] }
      } else if (slot.sport === 'ride') {
        a = { ...summarise(base, rideStream(id, slot.kind), bounds), name: slot.kind === 'commute' ? 'Commute' : 'Endurance ride' }
      } else if (slot.sport === 'swim') {
        const { stream, laps, poolM } = swimStream(id)
        const s = summarise(base, stream, bounds)
        const swimLaps = laps.length
        const avgLen = mean(laps.map((l) => l.durationS))
        a = { ...s, laps, name: 'Pool swim', swim: { poolM, lengths: swimLaps, swolf: Math.round(avgLen + 17 + sr.normal(0, 0.6)), stroke: 'Freestyle' } }
      } else if (slot.sport === 'football') {
        const fmt = slot.format ?? 5
        const stream = footballStream(id, fmt, slot.mins ?? 60)
        const s = summarise(base, stream, bounds)
        const an = analyseFootball(stream)
        analyses.set(id, an)
        a = {
          ...s,
          distanceM: Math.round(an.distanceM),
          name: fmt <= 6 ? `${fmt}-a-side` : `${fmt}-a-side league`,
          football: {
            minutes: an.minutes,
            distanceM: an.distanceM,
            mPerMin: an.mPerMin,
            topSpeedKmh: an.topSpeedKmh,
            sprints: an.sprints,
            hiDistM: an.hiDistM,
            fadeMinute: an.fadeMinute,
          },
        }
      } else {
        const w = simulateWorkout(`w-${iso}`, slot.routine!, start, liftState, sr)
        workouts.push(w)
        const durationS = (Date.parse(w.end!) - Date.parse(w.start)) / 1000
        const avgHr = sr.int(104, 118)
        a = {
          ...base,
          name: w.name,
          durationS,
          avgHr,
          maxHr: avgHr + sr.int(30, 45),
          zoneS: zoneSecondsFromAvg(avgHr, durationS, bounds),
          load: srpeLoad(durationS / 60, w.srpe ?? 7),
          workoutId: w.id,
          lift: liftSummary(w),
          calories: Math.round((durationS / 60) * 6.5),
        }
      }
      if (Date.parse(a.start) + a.durationS * 1000 <= now.getTime()) activities.push(a)
      else if (slot.sport === 'strength') workouts.pop()
    }
  }
  activities.sort((a, b) => b.start.localeCompare(a.start))

  // Football: rate every game except the latest, which is left for you to log.
  const games = activities.filter((a) => a.sport === 'football').sort((a, b) => a.start.localeCompare(b.start))
  const history: { match: Match; analysis?: FootballAnalysis }[] = []
  const matches: Match[] = []
  for (const g of games.slice(0, -1)) {
    const m = sampleMatch(g, analyses.get(g.id)!, history, profile)
    history.push({ match: m, analysis: analyses.get(g.id) })
    matches.push(m)
  }

  return { activities, dailies: buildDailies(first, activities), matches, workouts, body: buildBody(first, now), analyses }
}

function buildDailies(first: Date, activities: Activity[]): Daily[] {
  const loadByDay = new Map<string, number>()
  const lateGame = new Set<string>()
  for (const a of activities) {
    const d = isoDay(new Date(a.start))
    loadByDay.set(d, (loadByDay.get(d) ?? 0) + a.load)
    if (a.sport === 'football' && new Date(a.start).getHours() >= 20) lateGame.add(d)
  }
  const out: Daily[] = []
  for (let i = 0; i < DAYS; i++) {
    const day = addDays(first, i)
    const iso = isoDay(day)
    const prev = isoDay(addDays(day, -1))
    const r = rng(`health:${iso}`)
    const pr = rng(`health:${prev}`)
    const dow = getDay(addDays(day, -1))
    const drinks = (dow === 5 || dow === 6) && pr.chance(0.35)
    const yLoad = loadByDay.get(prev) ?? 0
    const isToday = i === DAYS - 1
    let hrv = 62 * Math.exp(r.normal(0, 0.075)) - yLoad * 0.04 - (drinks ? 9 : 0)
    let sleepH = 7.35 + r.normal(0, 0.45) - (drinks ? 0.6 : 0) - (lateGame.has(prev) ? 0.45 : 0)
    if (isToday) {
      hrv = Math.max(hrv, 66)
      sleepH = Math.max(sleepH, 7.7)
    }
    hrv = clamp(hrv, 36, 95)
    const rhr = Math.round(clamp(49 - (hrv - 60) * 0.12 + r.normal(0, 1) + (drinks ? 3 : 0) - (isToday ? 1 : 0), 42, 62))
    const sleepS = Math.round(clamp(sleepH, 5, 9.4) * 3600)
    const sleepScore = Math.round(clamp(55 + (sleepH - 5.5) * 12 + r.normal(0, 4) - (drinks ? 8 : 0), 35, 97))
    out.push({
      date: iso,
      hrv: Math.round(hrv),
      rhr,
      sleepS,
      sleepScore,
      deepS: Math.round(sleepS * r.range(0.15, 0.21)),
      remS: Math.round(sleepS * r.range(0.19, 0.25)),
      awakeS: Math.round(sleepS * r.range(0.03, 0.07)),
      lightS: 0,
      bbHigh: Math.round(clamp(40 + (hrv - 50) * 1.1 + sleepH * 4 + r.normal(0, 4), 25, 100)),
      bbLow: Math.round(clamp(r.normal(18, 6), 5, 40)),
      stress: Math.round(clamp(r.normal(27, 5) + (drinks ? 6 : 0), 12, 60)),
      steps: Math.round(clamp(r.normal(9500, 2400), 3000, 22000)),
    })
    const d = out[out.length - 1]
    d.lightS = d.sleepS! - d.deepS! - d.remS! - d.awakeS!
  }
  return out
}

function buildBody(first: Date, now: Date): BodyEntry[] {
  const out: BodyEntry[] = []
  for (let i = 0; i < DAYS; i++) {
    const day = addDays(first, i)
    const r = rng(`body:${isoDay(day)}`)
    if (!r.chance(0.55) && i !== DAYS - 1) continue
    const t = i / DAYS
    const at = setMinutes(setHours(day, 7), r.int(0, 40))
    if (at.getTime() > now.getTime()) continue
    out.push({
      id: `b-${isoDay(day)}`,
      date: at.toISOString(),
      weightKg: round(77.9 - t * 1.4 + r.normal(0, 0.32), 1),
      bodyFat: round(15.6 - t * 1.0 + r.normal(0, 0.25), 1),
      ...(i % 14 === 3 ? { waistCm: round(82.5 - t * 1.6, 1), chestCm: round(100 + t * 0.6, 1), armCm: round(35.4 + t * 0.6, 1), thighCm: round(57.2 + t * 0.3, 1) } : {}),
      source: 'sample',
    })
  }
  return out
}
