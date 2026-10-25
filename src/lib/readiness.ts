import { differenceInCalendarDays, format } from 'date-fns'
import type { Activity, Daily } from '../data/types'
import { clamp, mapRange, mean, median, quantile, round, std } from './math'

export type Tone = 'good' | 'ok' | 'warn' | 'bad'

export interface Factor {
  key: 'hrv' | 'rhr' | 'sleep' | 'bb' | 'load'
  label: string
  display: string
  unit: string
  today: number
  /** your normal range: Garmin's baseline for HRV, p15–p85 of the last 28 days for the rest */
  lo: number
  hi: number
  /** axis bounds for drawing */
  min: number
  max: number
  score: number
  /** which direction is good */
  better: 'up' | 'down'
  note: string
}

/** The session you're still recovering from. */
export interface Strain {
  /** "yesterday's 32 km run" */
  name: string
  hoursAgo: number
  /** hours it takes to absorb, by its training effect or its load against your usual session */
  needH: number
  /** what made it count: "training effect 4.3" or "2.8× your usual session" */
  why: string
}

export interface Readiness {
  date: string
  score: number
  label: string
  tone: Tone
  verdict: string
  factors: Factor[]
  strain?: Strain
}

const HOUR = 3_600_000
const DAY = 24 * HOUR

const hours = (s: number) => {
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return `${h}h${String(m).padStart(2, '0')}`
}

function band(values: number[], today: number) {
  const lo = quantile(values, 0.15)
  const hi = quantile(values, 0.85)
  const all = [...values, today]
  const pad = (Math.max(...all) - Math.min(...all)) * 0.12 || 1
  return { lo, hi, min: Math.min(...all) - pad, max: Math.max(...all) + pad }
}

export function toneFor(score: number): { label: string; tone: Tone } {
  if (score >= 75) return { label: 'Green light', tone: 'good' }
  if (score >= 60) return { label: 'Good to go', tone: 'ok' }
  if (score >= 45) return { label: 'Easy does it', tone: 'warn' }
  return { label: 'Recover', tone: 'bad' }
}

const endOf = (a: Activity) => Date.parse(a.start) + a.durationS * 1000

/**
 * Hours a session takes to absorb. Garmin's training effect decides when the
 * watch worked one out, on its own bands: 3 improves, 4 highly improves, 5
 * overreaches. Otherwise, and for very long sessions, its load against your
 * usual session. A day, two or three is a judgement call in line with common
 * coaching practice; it isn't Garmin's recovery time, which the Personal API
 * doesn't share.
 */
export function recoveryNeedH(a: Activity, usualLoad: number): number {
  const te = Math.max(a.garmin?.aerobicTE ?? 0, a.garmin?.anaerobicTE ?? 0)
  const rel = usualLoad > 0 ? a.load / usualLoad : 0
  if (te >= 5 || rel >= 3) return 72
  if (te >= 4 || rel >= 2) return 48
  if (te >= 3 || rel >= 1.4) return 24
  return 0
}

const WHAT: Record<Activity['sport'], string> = { run: 'run', ride: 'ride', swim: 'swim', football: 'game', strength: 'gym session', other: 'session' }

function nameOf(a: Activity, now: Date): string {
  const days = differenceInCalendarDays(now, new Date(a.start))
  const when = days <= 0 ? 'today’s' : days === 1 ? 'yesterday’s' : `${format(new Date(a.start), 'EEEE')}’s`
  const km = (a.sport === 'run' || a.sport === 'ride') && a.distanceM ? `${Math.round(a.distanceM / 1000)} km ` : ''
  return `${when} ${km}${WHAT[a.sport]}`
}

/** The session from the last three days with the most recovery still to go, if any. */
export function strainOf(activities: Activity[], now: Date): Strain | undefined {
  const t = now.getTime()
  const done = activities.filter((a) => endOf(a) <= t && t - endOf(a) < 56 * DAY)
  // your usual session: the median of the last eight weeks, before this recovery window
  const usual = median(done.filter((a) => a.durationS >= 20 * 60 && t - endOf(a) > 72 * HOUR).map((a) => a.load))
  let best: Strain | undefined
  let mostLeft = 0
  for (const a of done) {
    const hoursAgo = (t - endOf(a)) / HOUR
    if (hoursAgo > 72) continue
    const needH = recoveryNeedH(a, usual)
    if (needH - hoursAgo <= mostLeft) continue
    mostLeft = needH - hoursAgo
    const te = Math.max(a.garmin?.aerobicTE ?? 0, a.garmin?.anaerobicTE ?? 0)
    const why = te >= 3 ? `training effect ${te.toFixed(1)}` : `${(a.load / usual).toFixed(1)}× your usual session`
    best = { name: nameOf(a, now), hoursAgo: Math.round(hoursAgo), needH, why }
  }
  return best
}

/**
 * Readiness for the morning of the last day in `dailies`, against your own
 * normal, never a population norm. Overnight it weighs HRV against Garmin's
 * baseline (30%), sleep against the sleep Garmin says you needed (25%), Body
 * Battery (20%), resting HR (15%) and the load ratio (10%). Then recent training
 * caps it: whatever last night looked like, a session still being absorbed
 * keeps the day easy.
 */
export function readiness(dailies: Daily[], activities: Activity[], acwr: number, now = new Date()): Readiness | null {
  if (dailies.length < 8) return null
  const today = dailies[dailies.length - 1]
  const base = dailies.slice(-29, -1)
  const factors: Factor[] = []

  if (today.hrv) {
    const lo = today.hrvLow
    const hi = today.hrvHigh
    if (lo && hi && hi > lo) {
      // Garmin's balanced range: inside it is fine, under it is a warning, above it is no extra credit
      const z = Math.log(today.hrv / Math.sqrt(lo * hi)) / (Math.log(hi / lo) / 2)
      const status = today.hrvStatus && today.hrvStatus !== 'BALANCED' ? ` (Garmin says ${today.hrvStatus.toLowerCase()})` : ''
      const pad = (hi - lo) * 0.6
      factors.push({
        key: 'hrv',
        label: 'HRV',
        display: String(Math.round(today.hrv)),
        unit: 'ms',
        today: today.hrv,
        lo,
        hi,
        min: Math.min(lo - pad, today.hrv - 2),
        max: Math.max(hi + pad, today.hrv + 2),
        score: z >= -1 ? clamp(78 + 12 * Math.min(z, 1), 0, 100) : clamp(66 + 30 * (z + 1), 0, 100),
        better: 'up',
        note:
          today.hrv < lo
            ? `HRV is down at ${Math.round(today.hrv)} ms, under your Garmin baseline${status}`
            : today.hrv > hi
              ? `HRV is ${Math.round(today.hrv)} ms, above your Garmin baseline${status}`
              : `HRV is inside your Garmin baseline${status}`,
      })
    } else {
      const hrvBase = base.map((d) => d.hrv).filter((x): x is number => !!x)
      if (hrvBase.length > 6) {
        const ln = hrvBase.map(Math.log)
        const z = (Math.log(today.hrv) - mean(ln)) / (std(ln) || 0.1)
        const b = band(hrvBase, today.hrv)
        factors.push({
          key: 'hrv',
          label: 'HRV',
          display: String(Math.round(today.hrv)),
          unit: 'ms',
          today: today.hrv,
          ...b,
          score: clamp(55 + 22 * z, 0, 100),
          better: 'up',
          note:
            today.hrv > b.hi
              ? `HRV is ${Math.round(today.hrv)} ms, above your normal range`
              : today.hrv < b.lo
                ? `HRV is down at ${Math.round(today.hrv)} ms, below your normal range`
                : `HRV is in your normal range`,
        })
      }
    }
  }

  const rhrBase = base.map((d) => d.rhr).filter((x): x is number => !!x)
  if (today.rhr && rhrBase.length > 6) {
    const m = mean(rhrBase)
    const z = -(today.rhr - m) / (std(rhrBase) || 1)
    const b = band(rhrBase, today.rhr)
    const delta = Math.round(today.rhr - m)
    factors.push({
      key: 'rhr',
      label: 'Resting HR',
      display: String(today.rhr),
      unit: 'bpm',
      today: today.rhr,
      ...b,
      score: clamp(55 + 20 * z, 0, 100),
      better: 'down',
      note: delta >= 3 ? `resting HR is up ${delta} bpm on your baseline` : delta <= -2 ? `resting HR is ${-delta} bpm under your baseline` : `resting HR is normal`,
    })
  }

  if (today.sleepS) {
    const sleepBase = base.map((d) => d.sleepS).filter((x): x is number => !!x)
    const need = today.sleepNeedS ?? 8 * 3600
    const h = today.sleepS / 3600
    const durScore = mapRange(today.sleepS / need, 0.75, 1, 20, 95)
    const short = Math.round((need - today.sleepS) / 60)
    const b = band(
      sleepBase.map((s) => s / 3600),
      h,
    )
    factors.push({
      key: 'sleep',
      label: 'Sleep',
      display: hours(today.sleepS),
      unit: today.sleepScore ? `score ${today.sleepScore}` : '',
      today: h,
      ...b,
      score: today.sleepScore ? 0.5 * durScore + 0.5 * today.sleepScore : durScore,
      better: 'up',
      note: !today.sleepNeedS
        ? h < 6.5
          ? `only ${hours(today.sleepS)} of sleep`
          : `${hours(today.sleepS)} of sleep`
        : short > 20
          ? `${hours(today.sleepS)} of sleep, ${short} min short of what Garmin says you needed`
          : `${hours(today.sleepS)} of sleep, as much as Garmin says you needed`,
    })
  }

  const bbBase = base.map((d) => d.bbHigh).filter((x): x is number => !!x)
  if (today.bbHigh && bbBase.length > 6) {
    factors.push({
      key: 'bb',
      label: 'Body Battery',
      display: String(today.bbHigh),
      unit: '',
      today: today.bbHigh,
      ...band(bbBase, today.bbHigh),
      // it's Garmin's own 0–100 estimate, so it scores as it is
      score: today.bbHigh,
      better: 'up',
      note: today.bbHigh < 50 ? `Body Battery only charged to ${today.bbHigh} overnight` : `Body Battery charged to ${today.bbHigh} overnight`,
    })
  }

  {
    const r = acwr
    const score =
      r <= 0.8 ? 85 : r <= 1.1 ? mapRange(r, 0.8, 1.1, 95, 85) : r <= 1.3 ? mapRange(r, 1.1, 1.3, 85, 65) : r <= 1.5 ? mapRange(r, 1.3, 1.5, 65, 40) : mapRange(r, 1.5, 1.9, 40, 15)
    factors.push({
      key: 'load',
      label: 'Load ratio',
      display: r.toFixed(2),
      unit: 'acute:chronic',
      today: r,
      lo: 0.8,
      hi: 1.3,
      min: 0.4,
      max: 1.8,
      score,
      better: 'down',
      note: r > 1.3 ? `load ratio is ${r.toFixed(2)}, you've ramped up fast` : r < 0.8 ? `load is light lately` : `load is in the sweet spot`,
    })
  }

  const weights: Record<Factor['key'], number> = { hrv: 0.3, sleep: 0.25, bb: 0.2, rhr: 0.15, load: 0.1 }
  const wsum = factors.reduce((a, f) => a + weights[f.key], 0)
  let score = Math.round(factors.reduce((a, f) => a + f.score * weights[f.key], 0) / wsum)

  // whatever last night looked like, a session still being absorbed keeps the day easy
  const strain = strainOf(activities, now)
  const left = strain ? strain.needH - strain.hoursAgo : 0
  const cap = !strain ? 100 : left >= 36 ? 40 : left >= 12 ? 59 : 74
  const capped = score > cap
  score = Math.min(score, cap)
  const { label, tone } = toneFor(score)

  const sorted = [...factors].sort((a, b) => b.score - a.score)
  const best = sorted[0]
  const worst = sorted[sorted.length - 1]
  const up = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

  let verdict: string
  if (strain && capped) {
    const what = `${up(strain.name)} (${strain.why})`
    verdict =
      tone === 'bad'
        ? `${what} needs another day or two. Rest today, or keep it very easy.`
        : tone === 'warn'
          ? `${what} is still in your legs. Keep today easy and aerobic.`
          : `${what} is nearly absorbed. Train if it's planned, but keep it controlled.`
  } else if (tone === 'good') {
    verdict = `${up(best.note)}. A good day for a hard session.`
  } else if (tone === 'ok') {
    verdict = `${up(best.note)}, but ${worst.note}. Fine to train, keep the easy stuff easy.`
  } else if (tone === 'warn') {
    verdict = `${up(worst.note)}. Keep today aerobic, or swap it for mobility.`
  } else {
    verdict = `${up(worst.note)}. Take the day off: one rest day now saves a bad week later.`
  }

  return { date: today.date, score, label, tone, verdict, factors: factors.map((f) => ({ ...f, score: round(f.score) })), strain }
}
