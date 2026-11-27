// Every run on one map. A run's summary keeps its outline: a point every 100 m, in metres east and north of where it
// started rounded to 0.1° (`RunSummary.route`, `at`). Runs from the same place and the places either side of it can
// be put in one frame and drawn together, with no map underneath: the streets run most come out brightest.

import type { Activity } from '../data/types'
import { KY, kxAt } from './ghost'

export interface RunMap {
  /** each run's outline, x0, y0, x1, y1, … metres east and north of one place */
  routes: number[][]
  /** where most of the runs start, when at least HOME_RUNS start within HOME_M of each other */
  home?: [number, number]
  /** what they all fit in: west, south, east, north */
  box: [number, number, number, number]
  runs: number
  /** their distance in all, km */
  km: number
}

/** a start this close to most of the others is one of them (m) */
const HOME_M = 300
/** starts it takes to call a place home */
const HOME_RUNS = 3
/** a run that starts further from home than this (m) was somewhere else: a holiday, a race in another city */
const NEAR_M = 15_000
/** runs it takes to draw a map at all */
const LEAST = 3

const hyp = (dx: number, dy: number) => Math.sqrt(dx * dx + dy * dy)

/**
 * The runs with an outline, around where most of them are: those starting in the place most runs are measured from
 * (a start rounded to 0.1°) or one either side of it, and then within NEAR_M of where most of them start. The rest
 * were run elsewhere and are left off, so the map stays on the streets you run. None with fewer than LEAST runs.
 */
export function runMapOf(activities: Activity[]): RunMap | undefined {
  const runs = activities.filter((a) => a.sport === 'run' && a.run?.at && (a.run.route?.length ?? 0) >= 4)
  if (runs.length < LEAST) return undefined
  // the place most runs are measured from
  const count = new Map<string, number>()
  for (const a of runs) count.set(a.run!.at!.join(), (count.get(a.run!.at!.join()) ?? 0) + 1)
  const [lat0, lon0] = [...count.entries()]
    .reduce((b, e) => (e[1] > b[1] ? e : b))[0]
    .split(',')
    .map(Number)
  const kx = kxAt(lat0)
  // every outline from there and the places either side, moved into its frame
  const near = runs.flatMap((a) => {
    const [la, lo] = a.run!.at!
    if (Math.abs(la - lat0) > 0.1 + 1e-6 || Math.abs(lo - lon0) > 0.1 + 1e-6) return []
    const dx = Math.round((lo - lon0) * kx)
    const dy = Math.round((la - lat0) * KY)
    return [{ a, pts: a.run!.route!.map((m, i) => m + (i % 2 ? dy : dx)) }]
  })
  // home: the start with the most others close to it, when enough are
  let home: [number, number] | undefined
  let most = 0
  for (const r of near) {
    const by = near.filter((o) => hyp(o.pts[0] - r.pts[0], o.pts[1] - r.pts[1]) <= HOME_M)
    if (by.length > most) {
      most = by.length
      home = [Math.round(by.reduce((t, o) => t + o.pts[0], 0) / by.length), Math.round(by.reduce((t, o) => t + o.pts[1], 0) / by.length)]
    }
  }
  if (most < HOME_RUNS) home = undefined
  // the runs that started around here
  const centre = home ?? [near.map((r) => r.pts[0]).sort((a, b) => a - b)[near.length >> 1], near.map((r) => r.pts[1]).sort((a, b) => a - b)[near.length >> 1]]
  const kept = near.filter((r) => hyp(r.pts[0] - centre[0], r.pts[1] - centre[1]) <= NEAR_M)
  if (kept.length < LEAST) return undefined
  const box: RunMap['box'] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const { pts } of kept)
    for (let i = 0; i + 1 < pts.length; i += 2) {
      box[0] = Math.min(box[0], pts[i])
      box[1] = Math.min(box[1], pts[i + 1])
      box[2] = Math.max(box[2], pts[i])
      box[3] = Math.max(box[3], pts[i + 1])
    }
  return { routes: kept.map((r) => r.pts), home, box, runs: kept.length, km: Math.round(kept.reduce((t, r) => t + (r.a.distanceM ?? 0), 0) / 1000) }
}
