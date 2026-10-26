// Ghosts: your earlier runs on the same route, raced against this one. Pure
// logic; the ghost screen loads the streams and plays them back.
//
// Routes are matched by place, not by distance: each run's summary keeps an
// outline, a point every ROUTE_STEP metres, and two outlines are lined up
// point by point (dynamic time warping). So a start a few doors apart, or a
// watch that measures long, doesn't throw out the rest of the run.

import type { Activity, RunSummary, Stream } from '../data/types'
import { mean, quantile } from './math'

/** A run as distance against time, and where it was. */
export interface Path {
  /** metres along, seconds in, and position, one entry per sample */
  d: number[]
  t: number[]
  lat: number[]
  lon: number[]
  hr: number[]
}

/** metres between the points of a run's outline */
export const ROUTE_STEP = 100
/** a point is on the other run's route when that run passed within this */
const ON_ROUTE_M = 40
/** the share of each run that has to lie on the other's route */
const SHARED = 0.9
/** how far one run may get ahead of the other at the same place, beyond a steady drift from a watch measuring long: more is a detour */
const DETOUR_M = 150
/** runs that start further apart than this aren't compared */
const START_M = 500

const KY = 110_540
const kxAt = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180)

/** The samples with a position, as a path; undefined without GPS. */
export function pathOf(s: Stream): Path | undefined {
  const lat = s.lat ?? []
  const lon = s.lon ?? []
  let sum = 0
  const d = s.d?.length ? s.d : (s.v ?? []).map((v) => (sum += v * s.dt))
  const p: Path = { d: [], t: [], lat: [], lon: [], hr: [] }
  for (let i = 0; i < lat.length; i++) {
    if (!lat[i] || !lon[i] || d[i] === undefined) continue
    p.d.push(d[i] - (d[0] ?? 0))
    p.t.push(i * s.dt)
    p.lat.push(lat[i])
    p.lon.push(lon[i])
    p.hr.push(s.hr?.[i] ?? 0)
  }
  return p.d.length > 20 ? p : undefined
}

const total = (p: Path) => p.d[p.d.length - 1]

/** Index of the last sample at or before `x` in a rising series. */
function before(xs: number[], x: number): number {
  let lo = 0
  let hi = xs.length - 1
  if (x <= xs[0]) return 0
  if (x >= xs[hi]) return hi
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (xs[mid] <= x) lo = mid
    else hi = mid
  }
  return lo
}

/** `ys` at `x` along the rising `xs`, straight between samples. */
function lerp(xs: number[], ys: number[], x: number): number {
  const i = before(xs, x)
  const j = Math.min(xs.length - 1, i + 1)
  const f = xs[j] > xs[i] ? Math.min(1, Math.max(0, (x - xs[i]) / (xs[j] - xs[i]))) : 0
  return ys[i] + (ys[j] - ys[i]) * f
}

/**
 * Where a run went: a point every ROUTE_STEP metres and one at the finish, as
 * whole metres east and north of `at`. Small enough to keep on the run's
 * summary, so ghosts are found before any stream loads.
 */
export function routeOf(p: Path, at: [number, number]): number[] {
  const kx = kxAt(at[0])
  const out: number[] = []
  const put = (m: number) => out.push(Math.round((lerp(p.d, p.lon, m) - at[1]) * kx), Math.round((lerp(p.d, p.lat, m) - at[0]) * KY))
  for (let m = 0; m < total(p); m += ROUTE_STEP) put(m)
  put(total(p))
  return out
}

type Pt = [number, number]

/** A run's outline as metres east and north of `at0`. */
function outline(r: RunSummary, at0: [number, number]): Pt[] {
  const [lat, lon] = r.at!
  const route = r.route!
  const out: Pt[] = []
  for (let i = 0; i + 1 < route.length; i += 2) out.push([(lon + route[i] / kxAt(lat) - at0[1]) * kxAt(at0[0]), (lat + route[i + 1] / KY - at0[0]) * KY])
  return out
}

/** How far along its run each outline point is: every ROUTE_STEP metres, then the finish (the run's distance when it's known, else the last leg as the crow flies). */
function alongOf(pts: Pt[], end?: number): number[] {
  const n = pts.length
  const last = end ?? (n - 2) * ROUTE_STEP + Math.hypot(pts[n - 1][0] - pts[n - 2][0], pts[n - 1][1] - pts[n - 2][1])
  return pts.map((_, i) => (i < n - 1 ? i * ROUTE_STEP : last))
}

/** Point `p` against the outline `B` either side of its point j: how far off it is, and how far along B's run the nearest place is. */
function nearest(p: Pt, B: Pt[], dB: number[], j: number): { gap: number; at: number } {
  let best = { gap: Math.hypot(p[0] - B[j][0], p[1] - B[j][1]), at: dB[j] }
  for (const k of [j - 1, j]) {
    if (k < 0 || k + 1 >= B.length) continue
    const [a, b] = [B[k], B[k + 1]]
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
    const len = dx * dx + dy * dy
    const f = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0
    const gap = Math.hypot(p[0] - a[0] - f * dx, p[1] - a[1] - f * dy)
    if (gap < best.gap) best = { gap, at: dB[k] + f * (dB[k + 1] - dB[k]) }
  }
  return best
}

/** How far the points stray from the straight line that fits them best: the spread of the middle nine tenths. */
function wander(pts: Pt[]): number {
  if (pts.length < 3) return 0
  const mx = mean(pts.map((p) => p[0]))
  const my = mean(pts.map((p) => p[1]))
  const sxx = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0)
  const slope = sxx ? pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / sxx : 0
  const off = pts.map((p) => p[1] - my - slope * (p[0] - mx))
  return quantile(off, 0.95) - quantile(off, 0.05)
}

export interface Alignment {
  /** how far along your run each of your outline points is (m) */
  mine: number[]
  /** how far along its own run the ghost was at each of them (m); NaN where it went another way */
  theirs: number[]
  /** the share of your outline on the ghost's route, and of the ghost's on yours */
  shared: [number, number]
  /** how far the ghost got ahead or fell behind at the same place, beyond a steady drift (m): a detour */
  detour: number
}

/** Two outlines lined up by place, so each point of one meets the stretch of the other it passed; `ends` are the runs' exact distances when the streams are to hand. */
export function align(you: RunSummary, ghost: RunSummary, ends: [number?, number?] = []): Alignment | undefined {
  if (!you.route || !you.at || !ghost.route || !ghost.at) return undefined
  const A = outline(you, you.at)
  const B = outline(ghost, you.at)
  if (A.length < 3 || B.length < 3) return undefined
  const dA = alongOf(A, ends[0])
  const dB = alongOf(B, ends[1])
  const n = A.length
  const m = B.length
  const cost = (i: number, j: number) => Math.min(nearest(A[i], B, dB, j).gap, nearest(B[j], A, dA, i).gap)
  // the cheapest way through both outlines from start to finish, never going back
  const D = new Float64Array(n * m)
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++)
      D[i * m + j] = cost(i, j) + (i && j ? Math.min(D[(i - 1) * m + j], D[i * m + j - 1], D[(i - 1) * m + j - 1]) : i ? D[(i - 1) * m] : j ? D[j - 1] : 0)
  // walked back from both finishes: each point meets one or more of the other's
  const mineGap = new Array<number>(n).fill(Infinity)
  const theirGap = new Array<number>(m).fill(Infinity)
  const theirs = new Array<number>(n).fill(NaN)
  for (let i = n - 1, j = m - 1; ;) {
    const here = nearest(A[i], B, dB, j)
    if (here.gap < mineGap[i]) [mineGap[i], theirs[i]] = [here.gap, here.at]
    theirGap[j] = Math.min(theirGap[j], nearest(B[j], A, dA, i).gap)
    if (!i && !j) break
    if (!i) j--
    else if (!j) i--
    else {
      const [up, left, diag] = [D[(i - 1) * m + j], D[i * m + j - 1], D[(i - 1) * m + j - 1]]
      if (diag <= up && diag <= left) [i, j] = [i - 1, j - 1]
      else if (up < left) i--
      else j--
    }
  }
  for (let i = 0; i < n; i++) if (mineGap[i] > ON_ROUTE_M) theirs[i] = NaN
  const on = (gaps: number[]) => gaps.filter((g) => g <= ON_ROUTE_M).length / gaps.length
  // how far ahead the ghost was at the same place: a watch measuring long makes it drift steadily, a detour makes it jump
  const ahead = theirs.flatMap((x, i): Pt[] => (Number.isFinite(x) ? [[dA[i], x - dA[i]]] : []))
  return { mine: dA, theirs, shared: [on(mineGap), on(theirGap)], detour: wander(ahead) }
}

/** The same route the same way round: nine tenths of each run on the other's, and no detour. */
export const sameRoute = (al: Alignment) => al.shared[0] >= SHARED && al.shared[1] >= SHARED && al.detour <= DETOUR_M

/** How far apart two runs started (m). */
function startGap(a: RunSummary, b: RunSummary): number {
  const start = (r: RunSummary) => [r.at![0] + r.route![1] / KY, r.at![1] + r.route![0] / kxAt(r.at![0])]
  const [[lat1, lon1], [lat2, lon2]] = [start(a), start(b)]
  return Math.hypot((lon1 - lon2) * kxAt(lat1), (lat1 - lat2) * KY)
}

/**
 * Your earlier runs on this route, the same way round, newest first. Worked
 * out from the outlines on the summaries, so no stream has to load; runs
 * without one (older than a year) aren't ghosts.
 */
export function ghostsOf(a: Activity, activities: Activity[], max = 8): Activity[] {
  const r = a.run
  const d = a.distanceM ?? 0
  if (!r?.route || !r.at || !d) return []
  const t = Date.parse(a.start)
  return activities
    .filter(
      (x) =>
        x.sport === 'run' && x.hasStream && Date.parse(x.start) < t && x.run?.route && x.run.at && Math.abs((x.distanceM ?? 0) - d) <= d * 0.06 && startGap(r, x.run) <= START_M,
    )
    .sort((x, y) => y.start.localeCompare(x.start))
    .filter((x) => {
      const al = align(r, x.run!)
      return !!al && sameRoute(al)
    })
    .slice(0, max)
}

/** Your metres along and the ghost's at the same places, both rising: the starts meet, and so do the finishes. */
export interface Course {
  mine: number[]
  theirs: number[]
}

/** The ghost's run laid on yours by place, with the streams' exact distances. */
export function courseOf(you: Path, ghost: Path, yourRun: RunSummary, ghostRun: RunSummary): Course | undefined {
  const al = align(yourRun, ghostRun, [total(you), total(ghost)])
  if (!al) return undefined
  const c: Course = { mine: [0], theirs: [0] }
  al.theirs.forEach((x, i) => {
    if (x > c.theirs[c.theirs.length - 1] && x < total(ghost) && al.mine[i] > c.mine[c.mine.length - 1] && al.mine[i] < total(you)) {
      c.mine.push(al.mine[i])
      c.theirs.push(x)
    }
  })
  c.mine.push(total(you))
  c.theirs.push(total(ghost))
  return c
}

/** How far along its own run the ghost was where you were `m` metres along yours. */
export const theirsAt = (c: Course, m: number) => lerp(c.mine, c.theirs, m)
/** Where on your run the ghost was when it was `m` metres along its own. */
export const mineAt = (c: Course, m: number) => lerp(c.theirs, c.mine, m)

/** Seconds you were ahead (+) of the ghost at each point along your run, every `step` metres: its time to the same place, less yours. */
export function gapTo(you: Path, ghost: Path, c: Course, step = 100): { m: number; s: number }[] {
  const out: { m: number; s: number }[] = []
  const at = (m: number) => ({ m, s: lerp(ghost.d, ghost.t, theirsAt(c, m)) - lerp(you.d, you.t, m) })
  for (let m = 0; m < total(you); m += step) out.push(at(m))
  out.push(at(total(you)))
  return out
}

/** Heart rate along your run, every `step` metres: a run's own, or with a course, the ghost's at the same places. */
export function hrAlong(p: Path, you: Path, c?: Course, step = 250): { m: number; s: number }[] {
  const g = (m: number) => (c ? theirsAt(c, m) : m)
  const out: { m: number; s: number }[] = []
  for (let m = step; m <= total(you); m += step) {
    const i0 = before(p.d, g(m - step))
    const i1 = before(p.d, g(m))
    const hs = p.hr.slice(i0, i1 + 1).filter((h) => h > 0)
    if (hs.length) out.push({ m, s: hs.reduce((a, b) => a + b, 0) / hs.length })
  }
  return out
}

/** Where a run was `t` seconds in, and how far along its own run. */
export function positionAt(p: Path, t: number): { lat: number; lon: number; m: number } {
  return { lat: lerp(p.t, p.lat, t), lon: lerp(p.t, p.lon, t), m: lerp(p.t, p.d, t) }
}

/** Where on the route you gained most on a ghost: the stretch of about a kilometre with the biggest swing your way. */
export function bestStretch(gap: { m: number; s: number }[], len = 1000): { from: number; to: number; s: number } | undefined {
  const k = Math.max(1, Math.round(len / ((gap[1]?.m ?? len) - (gap[0]?.m ?? 0))))
  let best: { from: number; to: number; s: number } | undefined
  for (let i = 0; i + k < gap.length; i++) {
    const s = gap[i + k].s - gap[i].s
    if (!best || s > best.s) best = { from: gap[i].m, to: gap[i + k].m, s }
  }
  return best
}
