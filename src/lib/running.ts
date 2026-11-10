// Running analysis: your aerobic engine, and your best times. Each run is
// boiled down once (at sync time) to a minute-by-minute table, its best times
// and an outline of where it went, and everything here works from those, so
// the phone never needs every stream.
//
// Inside a run, heart rate follows speed, grade and time on your feet:
//   hr = a + bV·speed + bUp·uphill% + bDown·downhill% + bT·minutes
// The slopes are shared by every run and learnt only from how HR moves within
// each run, so fitness, weather and tiredness cancel out of them. What's left,
// the run's own `a`, is how hard that day was for your heart: it drifts slowly
// with fitness and jumps from run to run with heat and football. Pulling those
// apart gives the engine trend: the pace you hold at an easy heart rate.

import type { Activity, Profile, RunSummary, Stream } from '../data/types'
import { pathOf, routeOf } from './ghost'
import { clamp, mean, median } from './math'

/** bump when the run summary gains something, and sync adds it to the older ones from the stored stream: 2 is the outline ghosts are matched by, 3 the best times over set distances */
export const RUN_SUMMARY = 3

/** Distances a run's best times are kept for (m), and what they're called. */
export const BEST_M = [1000, 5000, 10_000, 21_097.5, 42_195]
export const BEST_NAME = ['1 km', '5 km', '10 km', 'Half marathon', 'Marathon']

/** Durations (s) of the best efforts kept for each run. */
export const BEST_S = [60, 120, 180, 300, 420, 600, 900, 1200, 1800, 2700, 3600]

/** below this (m/s) the watch is standing still */
const MOVING = 0.8
/** slower than this (m/s, about 8:45 /km) is walking, not running */
const RUNNING = 1.9
/** minutes skipped at the start of every run while heart rate catches up */
const WARMUP = 8
/** the engine is quoted this far into a run, before drift */
const REF_MIN = 20
/** above this (°C) heat starts to cost */
const HEAT_FROM = 12
/** a run this soon after football (hours from the final whistle) counts as the morning after */
const HANGOVER_H = 36
const DAY = 86_400_000

const r1 = (x: number) => Math.round(x * 10) / 10
const r2 = (x: number) => Math.round(x * 100) / 100

// ---------- per run ----------

function smooth(xs: number[], half: number): number[] {
  const out: number[] = []
  let acc = 0
  let lo = 0
  let hi = -1
  for (let i = 0; i < xs.length; i++) {
    while (hi < Math.min(xs.length - 1, i + half)) acc += xs[++hi]
    while (lo < i - half) acc -= xs[lo++]
    out.push(acc / (hi - lo + 1))
  }
  return out
}

/** One run's minute table and best efforts. Undefined when there's no speed to read. */
export function summariseRun(s: Stream): RunSummary | undefined {
  const dt = s.dt
  const v = s.v ?? s.d?.map((x, i, d) => (i ? Math.max(0, (x - d[i - 1]) / dt) : 0))
  if (!v || v.length < 2) return undefined
  const n = v.length
  const alt = s.alt ? smooth(s.alt, Math.max(1, Math.round(15 / dt))) : undefined
  const per = Math.max(1, Math.round(60 / dt))

  const spd: number[] = []
  const hr: number[] = []
  const grade: number[] = []
  let k = 0
  let dist = 0
  let hs = 0
  let hn = 0
  let a0 = 0
  for (let i = 0; i < n; i++) {
    if (!(v[i] >= MOVING)) continue
    if (k === 0) a0 = alt?.[i] ?? 0
    k++
    dist += v[i] * dt
    const h = s.hr?.[i] ?? 0
    if (h > 0) {
      hs += h
      hn++
    }
    if (k === per) {
      spd.push(r2(dist / (per * dt)))
      hr.push(hn >= per / 2 ? Math.round(hs / hn) : 0)
      grade.push(alt && dist > 30 ? r1(clamp((((alt[i] - a0) * per) / (per - 1 || 1) / dist) * 100, -30, 30)) : 0)
      k = dist = hs = hn = 0
    }
  }
  if (!spd.length) return undefined

  // best efforts by elapsed time, so a stop counts against you as it would in a race;
  // speed is capped so a GPS jump can't set a record
  const cum = [0]
  for (let i = 0; i < n; i++) cum.push(cum[i] + Math.min(v[i], 9) * dt)
  const best = BEST_S.map((d) => {
    const w = Math.round(d / dt)
    if (w > n) return 0
    let m = 0
    for (let i = 0; i + w <= n; i++) m = Math.max(m, cum[i + w] - cum[i])
    return r2(m / (w * dt))
  })

  const first = s.lat?.findIndex((x) => Number.isFinite(x)) ?? -1
  const at: [number, number] | undefined = first >= 0 && s.lon && Number.isFinite(s.lon[first]) ? [r1(s.lat![first]), r1(s.lon[first])] : undefined
  return { v: RUN_SUMMARY, spd, hr, grade, best, ...(at ? { at } : {}), ...summaryExtras(s, at) }
}

/** What a summary has gained since it was first made: the outline and the best times. Sync adds these to older summaries from the stored stream. */
export function summaryExtras(s: Stream, at?: [number, number]): Pick<RunSummary, 'route' | 'bestD'> {
  const path = at && pathOf(s)
  return { ...(path ? { route: routeOf(path, at!) } : {}), bestD: distanceBests(s) }
}

/**
 * Your fastest time (s) over each distance in BEST_M inside one run, by the
 * clock: a stop counts against you, as it would in a race. 0 where the run was
 * shorter. Distance is the watch's, with speed capped so a GPS jump can't set a
 * record.
 */
export function distanceBests(s: Stream): number[] {
  const n = s.d?.length ?? s.v?.length ?? 0
  const cum = [0]
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.min(s.d ? Math.max(0, s.d[i] - s.d[i - 1]) : (s.v![i] ?? 0) * s.dt, 9 * s.dt))
  return BEST_M.map((m) => {
    if (!n || cum[n - 1] < m) return 0
    let best = Infinity
    for (let i = 0, j = 1; i < n; i++) {
      while (j < n && cum[j] - cum[i] < m) j++
      if (j >= n) break
      // the moment inside the last step the distance was reached
      const step = cum[j] - cum[j - 1]
      const part = step > 0 ? (m - (cum[j - 1] - cum[i])) / step : 1
      best = Math.min(best, (j - 1 - i + part) * s.dt)
    }
    return Number.isFinite(best) ? Math.round(best) : 0
  })
}

export interface Best {
  /** index into BEST_M */
  k: number
  s: number
  id: string
  date: string
}

/**
 * Your best time over each distance in the summaries on hand (a year of runs),
 * shortest first; distances you haven't covered are left out. A race counts at
 * its finish time over the distance it was, since a watch measures a course
 * long and would hand you a faster one.
 */
export function bestsOf(runs: Activity[], races: Activity[] = []): Best[] {
  const out: Best[] = []
  BEST_M.forEach((m, k) => {
    let best: Best | undefined
    const take = (a: Activity, sec: number) => {
      if (sec > 0 && (!best || sec < best.s)) best = { k, s: Math.round(sec), id: a.id, date: a.start }
    }
    const raced = (a: Activity) => (a.distanceM ?? 0) >= m * 0.985 && (a.distanceM ?? 0) <= m * 1.06 && races.some((r) => r.id === a.id)
    for (const a of runs) take(a, raced(a) ? a.durationS : (a.run?.bestD?.[k] ?? 0))
    if (best) out.push(best)
  })
  return out
}

// ---------- the model ----------

interface Row {
  t: number
  v: number
  up: number
  dn: number
  hr: number
}

export interface Slopes {
  /** bpm per m/s */
  v: number
  /** bpm per % of uphill */
  up: number
  /** bpm per % of downhill (negative: going down is easier) */
  dn: number
  /** bpm per minute on your feet */
  t: number
}

/** Minutes where pace has held long enough for heart rate to have caught up. */
function steadyRows(s: RunSummary, p: Profile): Row[] {
  const out: Row[] = []
  for (let i = WARMUP; i < s.spd.length; i++) {
    const v = s.spd[i]
    const hr = s.hr[i]
    const g = s.grade[i] ?? 0
    if (!hr || v < RUNNING || Math.abs(g) > 8 || hr < p.hrRest + 20 || hr > p.hrMax + 3) continue
    if (Math.abs(s.spd[i - 1] - v) > 0.1 * v || Math.abs(s.spd[i - 2] - v) > 0.14 * v) continue
    out.push({ t: i, v, up: Math.max(g, 0), dn: Math.max(-g, 0), hr })
  }
  return out
}

/** Solve a small dense system by Gaussian elimination with partial pivoting. */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length
  const m = a.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let piv = c
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r
    if (Math.abs(m[piv][c]) < 1e-12) return null
    ;[m[c], m[piv]] = [m[piv], m[c]]
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = m[r][c] / m[c][c]
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k]
    }
  }
  return m.map((row, i) => row[n] / row[i])
}

/** Where the slopes start before your data says otherwise: roughly a typical runner. */
const PRIOR: Slopes = { v: 26, up: 3, dn: -1.5, t: 0.05 }
/** how much a regressor varies in a typical minute, to size the prior as ~20 minutes of data */
const SPREAD = { v: 0.15, up: 0.6, dn: 0.6, t: 150 }
const PRIOR_MIN = 20

interface Fit {
  slopes: Slopes
  /** how much of each slope came from your data rather than the prior, 0–1 */
  evidence: Record<keyof Slopes, number>
}

/** The shared slopes, from how heart rate moves within each run (each run's own level removed). */
function fitSlopes(runs: Row[][]): Fit | null {
  const keys = ['v', 'up', 'dn', 't'] as const
  const rows: { x: number[]; y: number }[] = []
  for (const rs of runs) {
    const mx = keys.map((k) => mean(rs.map((r) => r[k])))
    const my = mean(rs.map((r) => r.hr))
    for (const r of rs) rows.push({ x: keys.map((k, i) => r[k] - mx[i]), y: r.hr - my })
  }
  if (rows.length < 30) return null
  const lambda = keys.map((k) => PRIOR_MIN * SPREAD[k])
  const prior = keys.map((k) => PRIOR[k])
  let w = rows.map(() => 1)
  let beta = prior
  // a few rounds of Huber reweighting so a strap glitch can't swing the slopes
  for (let it = 0; it < 4; it++) {
    const A = keys.map((_, i) => keys.map((_, j) => (i === j ? lambda[i] : 0)))
    const b = keys.map((_, i) => lambda[i] * prior[i])
    rows.forEach((r, n) => {
      for (let i = 0; i < 4; i++) {
        b[i] += w[n] * r.x[i] * r.y
        for (let j = 0; j < 4; j++) A[i][j] += w[n] * r.x[i] * r.x[j]
      }
    })
    const next = solve(A, b)
    if (!next) return null
    beta = next
    const res = rows.map((r) => r.y - r.x.reduce((acc, x, i) => acc + x * beta[i], 0))
    const sigma = 1.4826 * median(res.map(Math.abs)) || 1
    w = res.map((e) => Math.min(1, (1.5 * sigma) / (Math.abs(e) || 1e-9)))
  }
  const info = keys.map((_, i) => rows.reduce((acc, r) => acc + r.x[i] * r.x[i], 0))
  return {
    slopes: { v: beta[0], up: beta[1], dn: beta[2], t: beta[3] },
    evidence: { v: info[0] / (info[0] + lambda[0]), up: info[1] / (info[1] + lambda[1]), dn: info[2] / (info[2] + lambda[2]), t: info[3] / (info[3] + lambda[3]) },
  }
}

/** Gaussian-weighted average of ys around x; undefined where there's too little data nearby. */
function kernel(xs: number[], ys: number[], x: number, sigma: number, minWeight = 1.2): number | undefined {
  let sw = 0
  let sy = 0
  for (let i = 0; i < xs.length; i++) {
    const w = Math.exp(-0.5 * ((x - xs[i]) / sigma) ** 2)
    sw += w
    sy += w * ys[i]
  }
  return sw >= minWeight ? sy / sw : undefined
}

/** Slope of y on x with an intercept, and its standard error. */
function slope(xs: number[], ys: number[]): { b: number; se: number } | null {
  const n = xs.length
  if (n < 4) return null
  const mx = mean(xs)
  const my = mean(ys)
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2
    sxy += (xs[i] - mx) * (ys[i] - my)
  }
  if (sxx < 1e-9) return null
  const b = sxy / sxx
  const sse = xs.reduce((acc, x, i) => acc + (ys[i] - my - b * (x - mx)) ** 2, 0)
  return { b, se: Math.sqrt(sse / Math.max(1, n - 2) / sxx) }
}

export interface RunPoint {
  id: string
  date: string
  t: number
  /** how hard the day was for your heart: HR at zero speed, flat, minute zero (only meaningful relative to other runs) */
  level: number
  /** engine on the day: speed (m/s) at the reference HR, flat, 20 minutes in, with heat and football taken out */
  engine: number
  steady: number
  tempC?: number
  /** hours since the last football session ended, if within three days */
  afterFootballH?: number
}

export interface RunModel {
  refHr: number
  slopes: Slopes
  runs: RunPoint[]
  /** smoothed engine (m/s at refHr) by date */
  trend: { t: number; v: number }[]
  /** the engine now, and the change in s/km since `then` (negative is faster) */
  engineNow?: { v: number; change?: number; since?: string }
  hills?: { upS: number; downS: number; netPer10m: number }
  heat?: { bpmPerC: number; sPer5C: number; runs: number; range: [number, number]; clear: boolean }
  football?: { bpm: number; sPerKm: number; after: number; without: number; clear: boolean }
}

/** s/km lost when speed v drops by dv */
const secPerKm = (v: number, dv: number) => 1000 / (v - dv) - 1000 / v

/** The heart rate the engine is quoted at: an easy aerobic effort, about 68% of your heart rate reserve. */
export const refHrFor = (p: Profile) => Math.round((p.hrRest + 0.68 * (p.hrMax - p.hrRest)) / 5) * 5

export function runModel(activities: Activity[], p: Profile, now = new Date()): RunModel | null {
  const runs = activities.filter((a) => a.sport === 'run' && a.run).sort((a, b) => a.start.localeCompare(b.start))
  const games = activities.filter((a) => a.sport === 'football').map((a) => Date.parse(a.start) + a.durationS * 1000)
  const rows = runs.map((a) => steadyRows(a.run!, p))
  const usable = runs.map((a, i) => ({ a, rows: rows[i] })).filter((x) => x.rows.length >= 6)
  const fit = fitSlopes(usable.map((x) => x.rows))
  if (!fit || fit.slopes.v < 8 || fit.evidence.v < 0.5) return null
  const b = fit.slopes
  const refHr = refHrFor(p)

  const pts = usable.map(({ a, rows }) => {
    const level = mean(rows.map((r) => r.hr - b.v * r.v - b.up * r.up - b.dn * r.dn - b.t * r.t))
    const start = Date.parse(a.start)
    const ended = games.filter((g) => g <= start && start - g < 72 * 3_600_000)
    return {
      id: a.id,
      date: a.start,
      t: start,
      level,
      steady: rows.length,
      tempC: a.run!.tempC,
      afterFootballH: ended.length ? Math.round((start - Math.max(...ended)) / 3_600_000) : undefined,
    }
  })

  // fitness (slow), heat and football (run to run), fitted together by backfitting
  const heatOf = (x: (typeof pts)[number]) => (x.tempC === undefined ? undefined : Math.max(0, x.tempC - HEAT_FROM))
  const fbOf = (x: (typeof pts)[number]) => (x.afterFootballH !== undefined && x.afterFootballH < HANGOVER_H ? 1 : 0)
  const ts = pts.map((x) => x.t)
  let bh = 0
  let bf = 0
  let fbFit: { b: number; se: number } | null = null
  let heatFit: { b: number; se: number } | null = null
  const warm = pts.filter((x) => heatOf(x) !== undefined)
  for (let it = 0; it < 8; it++) {
    const adj = pts.map((x) => x.level - bh * (heatOf(x) ?? 0) - bf * fbOf(x))
    const mu = ts.map((t) => kernel(ts, adj, t, 12 * DAY, 0) ?? 0)
    const res = pts.map((x, i) => x.level - mu[i])
    heatFit =
      warm.length >= 8
        ? slope(
            warm.map((x) => heatOf(x)!),
            warm.map((x) => res[pts.indexOf(x)] - bf * fbOf(x)),
          )
        : null
    bh = heatFit ? clamp(heatFit.b, 0, 3) : 0
    fbFit = slope(
      pts.map(fbOf),
      pts.map((x, i) => res[i] - bh * (heatOf(x) ?? 0)),
    )
    bf = fbFit ? clamp(fbFit.b, -3, 12) : 0
  }

  const engineOf = (level: number) => (refHr - level - b.t * REF_MIN) / b.v
  const out: RunPoint[] = pts.map((x) => ({ ...x, engine: engineOf(x.level - bh * (heatOf(x) ?? 0) - bf * fbOf(x)) }))
  const ok = out.filter((x) => x.engine > 1.5 && x.engine < 7)
  const ev = ok.map((x) => x.engine)
  const tt = ok.map((x) => x.t)
  const trend: { t: number; v: number }[] = []
  if (ok.length >= 4) {
    for (let t = tt[0]; t <= Math.max(tt[tt.length - 1], now.getTime() - DAY); t += DAY) {
      const v = kernel(tt, ev, t, 10 * DAY)
      if (v !== undefined) trend.push({ t, v })
    }
  }

  const model: RunModel = { refHr, slopes: b, runs: out, trend }
  const last = trend[trend.length - 1]
  if (last) {
    const thenT = last.t - 56 * DAY
    const then = trend.find((x) => x.t >= thenT)
    model.engineNow = {
      v: last.v,
      ...(then && then !== last && last.t - then.t > 20 * DAY ? { change: 1000 / last.v - 1000 / then.v, since: new Date(then.t).toISOString() } : {}),
    }
  }
  const v0 = last?.v ?? median(ev)

  // hills: only when your runs have had enough of them to say
  if (fit.evidence.up > 0.75 && fit.evidence.dn > 0.6) {
    const upS = secPerKm(v0, b.up / b.v)
    const downS = -secPerKm(v0, b.dn / b.v)
    model.hills = { upS, downS, netPer10m: upS - downS }
  }
  if (heatFit && warm.length >= 8) {
    const temps = warm.map((x) => x.tempC!)
    const hot = temps.filter((t) => t > HEAT_FROM + 3).length
    if (hot >= 4)
      model.heat = {
        bpmPerC: bh,
        sPer5C: secPerKm(v0, (5 * bh) / b.v),
        runs: warm.length,
        range: [Math.min(...temps), Math.max(...temps)],
        clear: bh >= 0.2 && bh > 2 * heatFit.se,
      }
  }
  const after = pts.filter((x) => fbOf(x)).length
  if (fbFit && after >= 4 && pts.length - after >= 6) {
    model.football = { bpm: bf, sPerKm: secPerKm(v0, bf / b.v), after, without: pts.length - after, clear: Math.abs(bf) > 2 * fbFit.se && Math.abs(bf) >= 1 }
  }
  return model
}
