// Ghosts: your earlier runs over the same roads, raced against this one where
// you both ran. Pure logic; the ghost screen loads the streams and plays them back.
//
// Runs are matched by place, not by distance. Each run's summary keeps an
// outline, a point every ROUTE_STEP metres, and two outlines are walked point
// by point for the longest stretch they share the same way round. So a run that
// went on further, or turned off halfway, still races you where you both ran,
// and a start a few doors apart or a watch that measures long doesn't throw out
// the rest.

import type { Activity, RunSummary, Stream } from '../data/types'
import { clamp, mean, quantile } from './math'

/** A run as distance against moving time, and where it was. */
export interface Path {
  /** metres along, seconds of moving time in, and position, one entry per sample */
  d: number[]
  t: number[]
  lat: number[]
  lon: number[]
  hr: number[]
}

/** metres between the points of a run's outline */
export const ROUTE_STEP = 100
/** a stretch worth racing is at least this long (m) */
export const STRETCH_M = 3000
/** and on a longer run at least this share of it, though never more than MAX_NEEDED_M */
const STRETCH_SHARE = 0.3
const MAX_NEEDED_M = 5000
/** a point is on the other run's route when that run passed within this (m) */
const ON_ROUTE_M = 40
/** points in a row that can miss the other route (GPS trouble, a corner cut) without ending a stretch */
const BRIDGE = 2
/** between two of your points, how much the other run may cover for each metre of yours and still be on the same road */
const PACE: [number, number] = [0.5, 1.6]
/** over a whole stretch, the two runs' distances agree to within this share (watches measure differently) */
const AGREE = 0.15
/** how far one run may get ahead of the other at the same place, beyond a steady drift: more is a detour (m) */
const DETOUR_M = 150
/** slower than this (m/s) is standing still: waiting for GPS, at a crossing. Ghosts race on moving time, so stops don't count */
const MOVING = 0.8
/** ghosts raced at once, and courses offered for one run */
const GHOSTS = 8
const COURSES = 3

const KY = 110_540
const kxAt = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180)
/** outline legs are filed by squares this big (m): a leg within ON_ROUTE_M of a point has an end within one square of it */
const CELL = 150

/** The samples with a position, as a path on moving time; undefined without GPS. */
export function pathOf(s: Stream): Path | undefined {
  const lat = s.lat ?? []
  const lon = s.lon ?? []
  let sum = 0
  const d = s.d?.length ? s.d : (s.v ?? []).map((v) => (sum += v * s.dt))
  const p: Path = { d: [], t: [], lat: [], lon: [], hr: [] }
  let t = 0
  for (let i = 0; i < lat.length; i++) {
    // the clock only runs while moving
    if (i && (s.v?.[i] ?? (d[i] - d[i - 1]) / s.dt) >= MOVING) t += s.dt
    if (!lat[i] || !lon[i] || d[i] === undefined) continue
    p.d.push(d[i] - (d[0] ?? 0))
    p.t.push(t)
    p.lat.push(lat[i])
    p.lon.push(lon[i])
    p.hr.push(s.hr?.[i] ?? 0)
  }
  return p.d.length > 20 ? p : undefined
}

const total = (p: Path) => p.d[p.d.length - 1]

/** Index of the last sample at or before `x` in a rising series (so a run standing still at the start is timed from when it set off). */
function before(xs: number[], x: number): number {
  let lo = 0
  let hi = xs.length - 1
  if (x < xs[0]) return 0
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

/** A run's outline as metres east and north of `at0`, and how far along the run each point is (the finish's last leg as the crow flies). */
function outline(r: RunSummary, at0: [number, number]): { pts: Pt[]; d: number[] } {
  const [lat, lon] = r.at!
  const route = r.route!
  const pts: Pt[] = []
  for (let i = 0; i + 1 < route.length; i += 2) pts.push([(lon + route[i] / kxAt(lat) - at0[1]) * kxAt(at0[0]), (lat + route[i + 1] / KY - at0[0]) * KY])
  const n = pts.length
  const d = pts.map((_, i) => (i < n - 1 || n < 2 ? i * ROUTE_STEP : (n - 2) * ROUTE_STEP + Math.hypot(pts[n - 1][0] - pts[n - 2][0], pts[n - 1][1] - pts[n - 2][1])))
  return { pts, d }
}

type Outline = ReturnType<typeof outline> & { legs: Map<number, number[]> }

const cellOf = (x: number, y: number) => (Math.floor(x / CELL) + 4096) * 8192 + Math.floor(y / CELL) + 4096

/** An outline with its legs filed by square, so a point only meets the legs near it. */
function filed(o: ReturnType<typeof outline>): Outline {
  const legs = new Map<number, number[]>()
  for (let k = 0; k + 1 < o.pts.length; k++)
    for (const c of new Set([cellOf(...o.pts[k]), cellOf(...o.pts[k + 1])])) {
      const list = legs.get(c)
      if (list) list.push(k)
      else legs.set(c, [k])
    }
  return { ...o, legs }
}

/**
 * Every time the outline B comes by `p`, within ON_ROUTE_M: how close, and how
 * far along B's run. Where B doubles back past it (a spur out and back), that's
 * twice, once each way.
 */
function passes(p: Pt, B: Outline): { gap: number; at: number }[] {
  const near = new Set<number>()
  const [cx, cy] = [Math.floor(p[0] / CELL) + 4096, Math.floor(p[1] / CELL) + 4096]
  for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) for (const k of B.legs.get(x * 8192 + y) ?? []) near.add(k)
  const hits: { k: number; gap: number; at: number }[] = []
  for (const k of [...near].sort((x, y) => x - y)) {
    const [a, b] = [B.pts[k], B.pts[k + 1]]
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
    const len = dx * dx + dy * dy
    const f = len ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len, 0, 1) : 0
    const gap = Math.hypot(p[0] - a[0] - f * dx, p[1] - a[1] - f * dy)
    if (gap <= ON_ROUTE_M) hits.push({ k, gap, at: B.d[k] + f * (B.d[k + 1] - B.d[k]) })
  }
  // where it comes closest: a leg nearer than the legs either side of it (two that meet at a corner count once)
  return hits.filter((h, i) => {
    const prev = hits[i - 1]?.k === h.k - 1 ? hits[i - 1] : undefined
    const next = hits[i + 1]?.k === h.k + 1 ? hits[i + 1] : undefined
    return (!prev || h.gap < prev.gap) && (!next || h.gap <= next.gap)
  })
}

/** How far the points stray from the straight line that fits them best: the spread of the middle nine tenths. */
function wander(xs: number[], ys: number[]): number {
  if (xs.length < 3) return 0
  const [mx, my] = [mean(xs), mean(ys)]
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0)
  const slope = sxx ? xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / sxx : 0
  const off = ys.map((y, i) => y - my - slope * (xs[i] - mx))
  return quantile(off, 0.95) - quantile(off, 0.05)
}

/** Where two runs both went: your metres along and the other's at the same places, both rising. */
export interface Shared {
  mine: number[]
  theirs: number[]
}

/**
 * The longest stretch two runs share the same way round, from their outlines:
 * your points one after another, each on the other's route and reached at
 * about your rate, a short miss bridged. Undefined when none hangs together.
 */
export function sharedStretch(you: RunSummary, other: RunSummary): Shared | undefined {
  if (!you.route || !you.at || !other.route || !other.at) return undefined
  return shared(outline(you, you.at), filed(outline(other, you.at)))
}

function shared(A: ReturnType<typeof outline>, B: Outline): Shared | undefined {
  if (A.pts.length < 3 || B.pts.length < 3) return undefined
  interface Link {
    i: number
    at: number
    start: number
    prev?: Link
  }
  // for each of your points, every way the other run came by, linked to the earliest-starting stretch it can carry on
  const links: Link[][] = []
  let best: Link | undefined
  const length = (l: Link) => A.d[l.i] - A.d[l.start]
  A.pts.forEach((p, i) => {
    links[i] = passes(p, B).map((c) => {
      let link: Link = { i, at: c.at, start: i }
      for (let k = 1; k <= BRIDGE + 1 && k <= i; k++) {
        const mine = A.d[i] - A.d[i - k]
        for (const q of links[i - k]) {
          const rate = (c.at - q.at) / mine
          if (rate >= PACE[0] && rate <= PACE[1] && q.start < link.start) link = { i, at: c.at, start: q.start, prev: q }
        }
      }
      return link
    })
    for (const l of links[i]) if (!best || length(l) > length(best)) best = l
  })
  if (!best || best.start === best.i) return undefined
  const s: Shared = { mine: [], theirs: [] }
  for (let l: Link | undefined = best; l; l = l.prev) {
    s.mine.unshift(A.d[l.i])
    s.theirs.unshift(l.at)
  }
  const mine = s.mine[s.mine.length - 1] - s.mine[0]
  const theirs = s.theirs[s.theirs.length - 1] - s.theirs[0]
  // a watch measuring long makes one drift steadily ahead; a detour makes it jump
  const off = s.theirs.map((x, i) => x - s.mine[i])
  if (Math.abs(theirs / mine - 1) > AGREE || wander(s.mine, off) > DETOUR_M) return undefined
  return s
}

/** An earlier run's stretch of yours: where it starts and ends on your run (m), and the two runs' metres along it. */
export interface Stretch extends Shared {
  a: Activity
  from: number
  to: number
}

/** A stretch of your run raced against the ghosts that ran all of it, newest first. */
export interface Course {
  from: number
  to: number
  ghosts: Stretch[]
}

/** How long a stretch of a run of `distance` metres has to be to count. */
export const stretchNeeded = (distance: number) => Math.max(STRETCH_M, Math.min(MAX_NEEDED_M, distance * STRETCH_SHARE))

/** Your earlier runs that share a stretch worth racing with this one, newest first. Worked out from the outlines on the summaries, so no stream has to load; runs without one (older than a year) aren't ghosts. */
export function stretchesOf(a: Activity, activities: Activity[]): Stretch[] {
  const r = a.run
  if (!r?.route || !r.at || !a.distanceM) return []
  const needed = stretchNeeded(a.distanceM)
  const t = Date.parse(a.start)
  const A = outline(r, r.at)
  // a run that never came near this one's ground isn't walked at all
  const box = (pts: Pt[]) => [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))]
  const mine = box(A.pts)
  const near = (pts: Pt[]) => {
    const b = box(pts)
    return b[0] <= mine[1] + ON_ROUTE_M && b[1] >= mine[0] - ON_ROUTE_M && b[2] <= mine[3] + ON_ROUTE_M && b[3] >= mine[2] - ON_ROUTE_M
  }
  return activities
    .filter((x) => x.sport === 'run' && x.hasStream && Date.parse(x.start) < t && x.run?.route && x.run.at && (x.distanceM ?? 0) >= needed)
    .sort((x, y) => y.start.localeCompare(x.start))
    .flatMap((x): Stretch[] => {
      const B = outline(x.run!, r.at!)
      const s = near(B.pts) ? shared(A, filed(B)) : undefined
      const from = s?.mine[0] ?? 0
      const to = s?.mine[s.mine.length - 1] ?? 0
      return s && to - from >= needed ? [{ ...s, a: x, from, to }] : []
    })
}

/**
 * The stretches worth racing on this run, longest first: each with every ghost
 * that ran all of it. A shorter one is only offered when it brings in more
 * ghosts than a longer one over the same ground can race.
 */
export function coursesOf(a: Activity, activities: Activity[]): Course[] {
  const stretches = stretchesOf(a, activities)
  const needed = stretchNeeded(a.distanceM ?? 0)
  const spans: { from: number; to: number }[] = []
  for (const s of [...stretches].sort((x, y) => y.to - y.from - (x.to - x.from)))
    if (!spans.some((c) => Math.abs(c.from - s.from) <= 300 && Math.abs(c.to - s.to) <= 300)) spans.push({ from: s.from, to: s.to })
  const courses: (Course & { all: number })[] = []
  for (const span of spans) {
    const all = stretches.filter((s) => s.from <= span.from + ROUTE_STEP && s.to >= span.to - ROUTE_STEP)
    const over = (c: Course) => Math.min(c.to, span.to) - Math.max(c.from, span.from) >= 0.8 * (span.to - span.from)
    if (courses.some((c) => over(c) && (c.all >= all.length || c.all >= GHOSTS))) continue
    const from = Math.max(...all.map((s) => s.from))
    const to = Math.min(...all.map((s) => s.to))
    if (to - from >= needed) courses.push({ from, to, ghosts: all.slice(0, GHOSTS), all: all.length })
  }
  return courses.slice(0, COURSES).map(({ from, to, ghosts }) => ({ from, to, ghosts }))
}

/** How far along its own run the ghost was where you were `m` metres along yours. */
export const theirsAt = (s: Shared, m: number) => lerp(s.mine, s.theirs, m)
/** Where on your run the ghost was when it was `m` metres along its own. */
export const mineAt = (s: Shared, m: number) => lerp(s.theirs, s.mine, m)

/** How many seconds into a run it was `m` metres along. */
export const timeAt = (p: Path, m: number) => lerp(p.d, p.t, m)

/** Seconds you were ahead (+) of the ghost along the course, every `step` metres of your run: its time from the start of the course to the same place, less yours. */
export function gapTo(you: Path, ghost: Path, s: Shared, c: { from: number; to: number }, step = 100): { m: number; s: number }[] {
  const tYou = (m: number) => timeAt(you, m)
  const tGhost = (m: number) => timeAt(ghost, theirsAt(s, m))
  const out: { m: number; s: number }[] = []
  const at = (m: number) => ({ m, s: tGhost(m) - tGhost(c.from) - (tYou(m) - tYou(c.from)) })
  for (let m = c.from; m < c.to; m += step) out.push(at(m))
  out.push(at(c.to))
  return out
}

/** Heart rate along the course, every `step` metres of your run: a run's own, or with a stretch, the ghost's at the same places. */
export function hrAlong(p: Path, c: { from: number; to: number }, s?: Shared, step = 250): { m: number; s: number }[] {
  const g = (m: number) => (s ? theirsAt(s, m) : m)
  const out: { m: number; s: number }[] = []
  for (let m = c.from + step; m <= c.to; m += step) {
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

/** Where you gained most on a ghost: the kilometre or so with the biggest swing your way. */
export function biggestGain(gap: { m: number; s: number }[], len = 1000): { from: number; to: number; s: number } | undefined {
  const k = Math.max(1, Math.round(len / ((gap[1]?.m ?? len) - (gap[0]?.m ?? 0))))
  let best: { from: number; to: number; s: number } | undefined
  for (let i = 0; i + k < gap.length; i++) {
    const s = gap[i + k].s - gap[i].s
    if (!best || s > best.s) best = { from: gap[i].m, to: gap[i + k].m, s }
  }
  return best
}
