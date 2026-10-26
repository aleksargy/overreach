// Synthetic but physically plausible recordings for the sample athlete.
// Every stream is a pure function of the activity id, so it can be thrown
// away and regenerated on demand instead of being stored.

import { PITCH } from '../../lib/football'
import { clamp } from '../../lib/math'
import { rng, type Rng } from '../../lib/rng'
import type { Format, Lap, Stream } from '../types'

export const HOME = { lat: 51.4816, lon: -0.1205 }
/** where the Saturday parkrun starts */
const PARK = { lat: HOME.lat + 0.009, lon: HOME.lon - 0.015 }
const HR_MAX = 192
const HR_REST = 48
const RESERVE = HR_MAX - HR_REST

type Seg = { m: number; pace: number } // metres at sec/km

function polyLength(xs: number[], ys: number[]) {
  const cum = [0]
  for (let i = 1; i < xs.length; i++) cum.push(cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]))
  return cum
}

/** A closed, wobbly loop of the given perimeter, in metres around the origin. */
function loop(r: Rng, perimeter: number) {
  const n = 900
  const p1 = r.range(0, 6)
  const p2 = r.range(0, 6)
  const a1 = r.range(0.12, 0.3)
  const a2 = r.range(0.05, 0.14)
  const stretch = r.range(1.1, 1.8)
  const rot = r.range(0, Math.PI)
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2
    const rad = 1 + a1 * Math.sin(3 * t + p1) + a2 * Math.sin(7 * t + p2)
    const x = rad * Math.cos(t) * stretch
    const y = rad * Math.sin(t)
    xs.push(x * Math.cos(rot) - y * Math.sin(rot))
    ys.push(x * Math.sin(rot) + y * Math.cos(rot))
  }
  // shift so the loop starts and ends at the origin (home)
  const x0 = xs[0]
  const y0 = ys[0]
  for (let i = 0; i <= n; i++) {
    xs[i] -= x0
    ys[i] -= y0
  }
  const scale = perimeter / polyLength(xs, ys)[n]
  return { xs: xs.map((x) => x * scale), ys: ys.map((y) => y * scale) }
}

/** A 400 m athletics track: two 84.39 m straights joined by 36.5 m radius bends. */
function track() {
  const xs: number[] = []
  const ys: number[] = []
  const R = 36.5
  const S = 84.39
  const steps = 200
  for (let i = 0; i <= steps; i++) {
    const d = (i / steps) * 400
    if (d < S) {
      xs.push(d)
      ys.push(0)
    } else if (d < S + Math.PI * R) {
      const a = (d - S) / R
      xs.push(S + R * Math.sin(a))
      ys.push(R - R * Math.cos(a))
    } else if (d < 2 * S + Math.PI * R) {
      xs.push(S - (d - S - Math.PI * R))
      ys.push(2 * R)
    } else {
      const a = (d - 2 * S - Math.PI * R) / R
      xs.push(-R * Math.sin(a))
      ys.push(R + R * Math.cos(a))
    }
  }
  return { xs, ys }
}

function toLatLon(x: number, y: number, origin = HOME) {
  return {
    lat: origin.lat + y / 110_540,
    lon: origin.lon + x / (111_320 * Math.cos((origin.lat * Math.PI) / 180)),
  }
}

function sampleAt(path: { xs: number[]; ys: number[]; cum: number[] }, dist: number) {
  const total = path.cum[path.cum.length - 1]
  const d = ((dist % total) + total) % total
  let lo = 0
  let hi = path.cum.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (path.cum[mid] <= d) lo = mid
    else hi = mid
  }
  const t = (d - path.cum[lo]) / (path.cum[hi] - path.cum[lo] || 1)
  return { x: path.xs[lo] + (path.xs[hi] - path.xs[lo]) * t, y: path.ys[lo] + (path.ys[hi] - path.ys[lo]) * t }
}

/** What the day brings to a sample run: fitness, weather, legs after football and how long heart rate holds. */
export interface RunDay {
  /** threshold speed on the day, m/s */
  vT: number
  tempC: number
  /** hours since football finished, when there was a game in the last three days */
  afterFootballH?: number
  /** minutes of steady running before heart rate starts to climb */
  holdMin: number
}

export function runPlan(kind: string, r: Rng, day: RunDay): Seg[] {
  const easy = r.range(310, 325)
  switch (kind) {
    case 'tempo':
      return [
        { m: 1500, pace: 330 },
        { m: r.pick([5000, 6000, 7000]), pace: r.range(248, 256) },
        { m: 1500, pace: 335 },
      ]
    case 'intervals': {
      const reps = r.pick([5, 6, 8])
      const segs: Seg[] = [{ m: 2000, pace: 330 }]
      for (let i = 0; i < reps; i++) segs.push({ m: 800, pace: r.range(214, 222) }, { m: 400, pace: 380 })
      segs.push({ m: 1600, pace: 340 })
      return segs
    }
    case 'race':
      // flat out over 5 km, so the pace follows fitness
      return [{ m: 5000, pace: 1000 / (day.vT * r.range(1.025, 1.045)) }]
    case 'long':
      return [{ m: r.pick([14000, 16000, 18000]), pace: r.range(312, 322) }]
    default:
      return [{ m: r.pick([6000, 7000, 8000, 9000]), pace: easy }]
  }
}

/**
 * A run whose heart rate answers to the things the running analysis looks for:
 * speed, hills (the runner eases off uphill but still pays), heat above 12°C,
 * legs from football the night before, and drift once past the day's hold time.
 */
export function runStream(id: string, kind: string, day: RunDay): { stream: Stream; laps: Lap[] } {
  const r = rng(id)
  const dt = 5
  const plan = runPlan(kind, r, day)
  const total = plan.reduce((a, s) => a + s.m, 0)
  const onTrack = kind === 'intervals'
  // a route for every distance run from home, and the parkrun course: the same distance is the same way round, hills and all
  const route = rng(`route:${kind === 'race' ? 'parkrun' : total}`)
  const shape = onTrack ? track() : loop(route, kind === 'long' || kind === 'race' ? total : total / route.pick([1, 2]))
  const path = { ...shape, cum: polyLength(shape.xs, shape.ys) }
  const origin = kind === 'race' ? PARK : HOME
  // rolling road terrain; the track is flat
  const hill = onTrack
    ? null
    : { a1: route.range(2, 9), l1: route.range(1400, 2600), p1: route.range(0, 6), a2: route.range(0.3, 1.5), l2: route.range(420, 700), p2: route.range(0, 6) }
  const wave = (x: number, a: number, l: number, p: number) => a * Math.sin((2 * Math.PI * x) / l + p)
  const altAt = (x: number) => (hill ? 18 + wave(x, hill.a1, hill.l1, hill.p1) + wave(x, hill.a2, hill.l2, hill.p2) : 12)
  const gradeAt = (x: number) =>
    hill
      ? 100 *
        (((2 * Math.PI * hill.a1) / hill.l1) * Math.cos((2 * Math.PI * x) / hill.l1 + hill.p1) +
          ((2 * Math.PI * hill.a2) / hill.l2) * Math.cos((2 * Math.PI * x) / hill.l2 + hill.p2))
      : 0
  const heat = 0.7 * Math.max(0, day.tempC - 12)
  const legs = day.afterFootballH !== undefined && day.afterFootballH < 36 ? 4 : 0
  const out: Stream = { activityId: id, dt, hr: [], v: [], d: [], alt: [], lat: [], lon: [], cad: [] }
  let d = 0
  let v = 2.4
  let hr = 95
  let ou = 0
  let t = 0
  let seg = 0
  let segEnd = plan[0].m
  const laps: Lap[] = []
  let lapStart = { t: 0, d: 0, hrs: [] as number[] }
  while (d < total) {
    while (d >= segEnd && seg < plan.length - 1) segEnd += plan[++seg].m
    ou += -0.15 * ou + r.normal(0, 0.06)
    const g = gradeAt(d)
    const up = Math.max(g, 0)
    const down = Math.max(-g, 0)
    const target = (1000 / plan[seg].pace + ou) * (1 - 0.022 * up + 0.012 * down)
    v += (target - v) * (dt / 10)
    // what the hill makes the effort feel like, in flat-ground speed
    const vEff = v * (1 + 0.035 * up - 0.018 * down)
    const mins = t / 60
    const drift = 0.04 * mins + 0.22 * Math.max(0, mins - day.holdMin)
    const frac = Math.min(0.97, 0.12 + (0.75 * vEff) / day.vT)
    const hrT = HR_REST + RESERVE * frac + heat + legs + drift
    hr += (hrT - hr) * (dt / 28) + r.normal(0, 0.8)
    d += v * dt
    t += dt
    const pos = sampleAt(path, d)
    const ll = toLatLon(pos.x + r.normal(0, 1.2), pos.y + r.normal(0, 1.2), origin)
    out.v!.push(+v.toFixed(3))
    out.hr!.push(Math.round(clamp(hr, 70, HR_MAX)))
    out.d!.push(Math.round(d))
    out.alt!.push(+(altAt(d) + r.normal(0, 0.1)).toFixed(1))
    out.lat!.push(+ll.lat.toFixed(6))
    out.lon!.push(+ll.lon.toFixed(6))
    out.cad!.push(Math.round(166 + (v - 3) * 9 + r.normal(0, 2)))
    lapStart.hrs.push(hr)
    if (d - lapStart.d >= 1000 || d >= total) {
      laps.push({
        index: laps.length,
        startS: lapStart.t,
        durationS: t - lapStart.t,
        distanceM: Math.round(d - lapStart.d),
        avgHr: Math.round(lapStart.hrs.reduce((a, b) => a + b, 0) / lapStart.hrs.length),
        avgSpeed: (d - lapStart.d) / (t - lapStart.t),
      })
      lapStart = { t, d, hrs: [] }
    }
  }
  return { stream: out, laps }
}

export function rideStream(id: string, kind: string): Stream {
  const r = rng(id)
  const dt = 5
  const commute = kind === 'commute'
  const total = commute ? r.range(8500, 10500) : r.range(48_000, 66_000)
  const shape = loop(r, commute ? total * 2 : total)
  const path = { ...shape, cum: polyLength(shape.xs, shape.ys) }
  const out: Stream = { activityId: id, dt, hr: [], v: [], d: [], alt: [], lat: [], lon: [], pwr: [], cad: [] }
  let d = 0
  let v = 4
  let hr = 90
  let stop = 0
  let t = 0
  while (d < total) {
    const alt = 40 + 22 * Math.sin((2 * Math.PI * d) / 9000) + 9 * Math.sin((2 * Math.PI * d) / 2600 + 2)
    const grade = (22 * 2 * Math.PI * Math.cos((2 * Math.PI * d) / 9000)) / 9000 + (9 * 2 * Math.PI * Math.cos((2 * Math.PI * d) / 2600 + 2)) / 2600
    if (commute && stop <= 0 && r.chance(0.012)) stop = r.int(15, 45)
    let target = (commute ? 6.4 : 8.4) - grade * 55 + r.normal(0, 0.2)
    if (stop > 0) {
      target = 0
      stop -= dt
    }
    v += (clamp(target, 0, 16) - v) * 0.35
    const pwr = v < 0.5 ? 0 : clamp(160 + grade * 2600 + (v - 7) * 12 + r.normal(0, 18), 0, 650)
    const hrT = HR_REST + RESERVE * (0.38 + 0.38 * clamp(pwr / 260, 0, 1.4) ** 1.4)
    hr += (hrT - hr) * (dt / 35)
    d += v * dt
    t += dt
    const pos = sampleAt(path, d)
    const ll = toLatLon(pos.x, pos.y)
    out.v!.push(+v.toFixed(2))
    out.hr!.push(Math.round(hr))
    out.d!.push(Math.round(d))
    out.alt!.push(+alt.toFixed(1))
    out.lat!.push(+ll.lat.toFixed(6))
    out.lon!.push(+ll.lon.toFixed(6))
    out.pwr!.push(Math.round(pwr))
    out.cad!.push(v < 0.5 ? 0 : Math.round(86 + r.normal(0, 3)))
  }
  void t
  return out
}

export function swimStream(id: string): { stream: Stream; laps: Lap[]; poolM: number } {
  const r = rng(id)
  const poolM = 25
  const sets: { reps: number; m: number; pace: number; rest: number }[] = [
    { reps: 1, m: 300, pace: 125, rest: 30 },
    { reps: r.pick([6, 8]), m: 100, pace: r.range(104, 110), rest: 20 },
    { reps: r.pick([3, 4]), m: 200, pace: r.range(112, 118), rest: 30 },
    { reps: 1, m: 200, pace: 130, rest: 0 },
  ]
  const dt = 5
  const out: Stream = { activityId: id, dt, hr: [], v: [], d: [] }
  const laps: Lap[] = []
  let t = 0
  let d = 0
  let hr = 100
  const push = (v: number, secs: number) => {
    for (let s = 0; s < secs; s += dt) {
      const hrT = v > 0 ? HR_REST + RESERVE * (0.55 + 0.25 * clamp(v / 0.95, 0, 1.2)) : 105
      hr += (hrT - hr) * 0.12
      d += v * dt
      out.v!.push(+v.toFixed(3))
      out.hr!.push(Math.round(hr + r.normal(0, 1.5)))
      out.d!.push(Math.round(d))
    }
  }
  for (const set of sets) {
    for (let k = 0; k < set.reps; k++) {
      const lengths = set.m / poolM
      for (let l = 0; l < lengths; l++) {
        const secs = Math.round((set.pace * poolM) / 100 + r.normal(0, 0.8))
        laps.push({ index: laps.length, startS: t, durationS: secs, distanceM: poolM, avgSpeed: poolM / secs })
        push(poolM / secs, secs)
        t += secs
      }
      if (set.rest) {
        push(0, set.rest)
        t += set.rest
      }
    }
  }
  return { stream: out, laps, poolM }
}

const SPEEDS = [0.3, 1.3, 2.7, 4.2, 6.4]
// per-second transition probabilities between stand, walk, jog, run, sprint
const T = [
  [0, 0.25, 0.05, 0.005, 0.003],
  [0.09, 0, 0.1, 0.02, 0.009],
  [0.04, 0.16, 0, 0.06, 0.02],
  [0.01, 0.08, 0.22, 0, 0.055],
  [0, 0.03, 0.15, 0.2, 0],
]

/** Where the sample athlete plays: the same pitch every week for each format, each laid at its own angle. */
const GROUNDS: Record<number, { origin: { lat: number; lon: number }; bearing: number }> = {
  11: { origin: { lat: HOME.lat + 0.004, lon: HOME.lon - 0.006 }, bearing: 0.42 },
  7: { origin: { lat: HOME.lat - 0.011, lon: HOME.lon + 0.017 }, bearing: 1.2 },
}

/**
 * A game for a right-sided central midfielder. Positions are worked out facing
 * the goal being attacked (x up the pitch, y across from the right touchline),
 * then turned onto the real pitch: the toss picks the first-half end and the
 * ends change at half time.
 */
export function footballStream(id: string, format: Format, minutes: number): Stream {
  const r = rng(id)
  const dt = 1
  const [L, W] = PITCH[format]
  const home = { x: L * r.range(0.36, 0.48), y: W * r.range(0.22, 0.36) }
  let pos = { ...home }
  let target = { ...home }
  let state = 1
  let speed = 1.3
  let vSmooth = 1
  let hr = 100
  let gx = 0
  let gy = 0
  const fadeAt = r.chance(0.55) ? minutes * r.range(0.55, 0.8) : minutes * 2
  const firstEnd = r.range(0, Math.PI) < Math.PI / 2 ? 1 : -1
  const { origin, bearing } = GROUNDS[format] ?? GROUNDS[7]
  const halfTime = format >= 7 ? [minutes / 2 - (format === 11 ? 5 : 2.5), minutes / 2 + (format === 11 ? 5 : 2.5)] : null
  let restarted = false
  const out: Stream = { activityId: id, dt, hr: [], v: [], lat: [], lon: [] }
  const n = Math.round(minutes * 60)
  for (let i = 0; i < n; i++) {
    const min = i / 60
    const tired = min > fadeAt ? 0.4 : 1
    const jogTired = min > fadeAt ? 0.7 : 1
    const resting = halfTime && min > halfTime[0] && min < halfTime[1]
    // everyone lines up in their own half for the second-half kick-off
    if (halfTime && !resting && min >= halfTime[1] && !restarted) {
      pos = { ...home }
      target = { ...home }
      restarted = true
    }
    if (resting) {
      state = 1
    } else {
      const row = T[state]
      let roll = r()
      for (let s = 0; s < 5; s++) {
        const p = row[s] * (s >= 3 ? tired : s === 2 ? jogTired : tired < 1 ? 1.7 : 1)
        if (roll < p) {
          state = s
          if (s === 4) {
            speed = r.range(5.3, 7.6)
            const ang = r.range(0, Math.PI * 2)
            target = { x: clamp(pos.x + Math.cos(ang) * 16, 1, L - 1), y: clamp(pos.y + Math.sin(ang) * 10, 1, W - 1) }
          }
          break
        }
        roll -= p
      }
    }
    if (state !== 4) speed += (SPEEDS[state] * r.range(0.9, 1.1) - speed) * 0.4
    const dx = target.x - pos.x
    const dy = target.y - pos.y
    const dist = Math.hypot(dx, dy)
    if (dist < 2 || r.chance(0.02)) {
      const wide = r.chance(0.35)
      target = {
        x: clamp(wide ? r.range(0, L) : r.normal(home.x, L * 0.2), 1, L - 1),
        y: clamp(wide ? r.range(0, W) : r.normal(home.y, W * 0.24), 1, W - 1),
      }
    }
    const step = Math.min(dist, speed * dt)
    pos = {
      x: clamp(pos.x + (dist ? (dx / dist) * step : 0), 0, L),
      y: clamp(pos.y + (dist ? (dy / dist) * step : 0), 0, W),
    }
    const v = resting ? 0.2 : step / dt
    vSmooth += (v - vSmooth) * 0.07
    const hrT = (resting ? 112 : 118 + (vSmooth / 6.4) * 82) + (min / minutes) * 6
    hr += (hrT - hr) * 0.05 + r.normal(0, 0.7)
    gx += -0.1 * gx + r.normal(0, 0.35)
    gy += -0.1 * gy + r.normal(0, 0.35)
    // facing the other way, the same spot is the far end and the far side
    const end = halfTime && min >= halfTime[1] ? -firstEnd : firstEnd
    const x = end > 0 ? pos.x + gx : L - pos.x - gx
    const y = end > 0 ? pos.y + gy : W - pos.y - gy
    const ll = toLatLon(x * Math.cos(bearing) - y * Math.sin(bearing), x * Math.sin(bearing) + y * Math.cos(bearing), origin)
    out.v!.push(+v.toFixed(2))
    out.hr!.push(Math.round(clamp(hr, 80, HR_MAX)))
    out.lat!.push(+ll.lat.toFixed(7))
    out.lon!.push(+ll.lon.toFixed(7))
  }
  return out
}
