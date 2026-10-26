// Ghosts: your past runs on the same route, raced against this one. Pure
// logic; the ghost screen loads the streams and plays them back.

import type { Activity, Stream } from '../data/types'

/** A run as distance against time, and where it was. */
export interface Path {
  /** metres along, seconds in, and position, one entry per sample */
  d: number[]
  t: number[]
  lat: number[]
  lon: number[]
  hr: number[]
}

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
 * Runs worth checking for the same route: about as far (6%), starting in the
 * same part of town, newest first. Only their streams can say for sure.
 */
export function ghostCandidates(a: Activity, activities: Activity[], max = 8): Activity[] {
  const d = a.distanceM ?? 0
  const near = (x: Activity) => !a.run?.at || !x.run?.at || (Math.abs(a.run.at[0] - x.run.at[0]) <= 0.1 && Math.abs(a.run.at[1] - x.run.at[1]) <= 0.1)
  return activities
    .filter((x) => x.sport === 'run' && x.id !== a.id && x.hasStream && d > 0 && Math.abs((x.distanceM ?? 0) - d) <= d * 0.06 && near(x))
    .sort((x, y) => y.start.localeCompare(x.start))
    .slice(0, max)
}

/** Where a path is `f` of the way along it, in metres from a fixed point. */
function pointAt(p: Path, f: number, lat0: number): [number, number] {
  const m = f * total(p)
  return [lerp(p.d, p.lon, m) * kxAt(lat0), lerp(p.d, p.lat, m) * KY]
}

/** The same route the same way round: points the same share of the way along both stay within a few strides of each other. */
export function sameRoute(p: Path, q: Path): boolean {
  const lat0 = p.lat[0]
  const gaps = Array.from({ length: 50 }, (_, i) => {
    const [x1, y1] = pointAt(p, i / 49, lat0)
    const [x2, y2] = pointAt(q, i / 49, lat0)
    return Math.hypot(x1 - x2, y1 - y2)
  }).sort((a, b) => a - b)
  return gaps.reduce((a, b) => a + b, 0) / gaps.length < 45 && gaps[Math.floor(gaps.length * 0.9)] < 90
}

/** The ghost's distance made to match yours, so a watch that measures a little long doesn't count as falling behind. */
const scaled = (ghost: Path, you: Path) => (m: number) => (m * total(ghost)) / total(you)

/** Seconds you were ahead (+) of the ghost at each point along the route, every `step` metres. */
export function gapTo(you: Path, ghost: Path, step = 100): { m: number; s: number }[] {
  const g = scaled(ghost, you)
  const out: { m: number; s: number }[] = []
  const at = (m: number) => ({ m, s: lerp(ghost.d, ghost.t, g(m)) - lerp(you.d, you.t, m) })
  for (let m = 0; m < total(you); m += step) out.push(at(m))
  out.push(at(total(you)))
  return out
}

/** Heart rate along the route, every `step` metres, the ghost's on your distances. */
export function hrAlong(p: Path, you: Path, step = 250): { m: number; s: number }[] {
  const g = scaled(p, you)
  const out: { m: number; s: number }[] = []
  for (let m = step; m <= total(you); m += step) {
    const i0 = before(p.d, g(m - step))
    const i1 = before(p.d, g(m))
    const hs = p.hr.slice(i0, i1 + 1).filter((h) => h > 0)
    if (hs.length) out.push({ m, s: hs.reduce((a, b) => a + b, 0) / hs.length })
  }
  return out
}

/** Where a run was `t` seconds in: its position and how far along, in your distances. */
export function positionAt(p: Path, you: Path, t: number): { lat: number; lon: number; m: number } {
  const m = lerp(p.t, p.d, t)
  return { lat: lerp(p.t, p.lat, t), lon: lerp(p.t, p.lon, t), m: (m * total(you)) / total(p) }
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
