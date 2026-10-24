import type { Daily } from '../data/types'
import { clamp, mapRange, mean, quantile, round, std } from './math'

export type Tone = 'good' | 'ok' | 'warn' | 'bad'

export interface Factor {
  key: 'hrv' | 'rhr' | 'sleep' | 'load'
  label: string
  display: string
  unit: string
  today: number
  /** your normal range, p15–p85 of the last 28 days */
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

export interface Readiness {
  date: string
  score: number
  label: string
  tone: Tone
  verdict: string
  factors: Factor[]
}

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

/**
 * Readiness compares today with your own last 28 days, never a population norm.
 * HRV 40%, resting HR 20%, sleep 25%, load ratio 15%.
 */
export function readiness(dailies: Daily[], acwr: number, plan?: string): Readiness | null {
  if (dailies.length < 8) return null
  const today = dailies[dailies.length - 1]
  const base = dailies.slice(-29, -1)
  const factors: Factor[] = []

  const hrvBase = base.map((d) => d.hrv).filter((x): x is number => !!x)
  if (today.hrv && hrvBase.length > 6) {
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
      note:
        delta >= 3
          ? `resting HR is up ${delta} bpm on your baseline`
          : delta <= -2
            ? `resting HR is ${-delta} bpm under your baseline`
            : `resting HR is normal`,
    })
  }

  if (today.sleepS) {
    const sleepBase = base.map((d) => d.sleepS).filter((x): x is number => !!x)
    const h = today.sleepS / 3600
    const durScore = mapRange(h, 5, 8, 15, 95)
    const score = today.sleepScore ? 0.5 * durScore + 0.5 * today.sleepScore : durScore
    const b = band(sleepBase.map((s) => s / 3600), h)
    factors.push({
      key: 'sleep',
      label: 'Sleep',
      display: hours(today.sleepS),
      unit: today.sleepScore ? `score ${today.sleepScore}` : '',
      today: h,
      ...b,
      score,
      better: 'up',
      note: h < 6.5 ? `only ${hours(today.sleepS)} of sleep` : `${hours(today.sleepS)} of sleep`,
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

  const weights: Record<Factor['key'], number> = { hrv: 0.4, rhr: 0.2, sleep: 0.25, load: 0.15 }
  const wsum = factors.reduce((a, f) => a + weights[f.key], 0)
  const score = Math.round(factors.reduce((a, f) => a + f.score * weights[f.key], 0) / wsum)
  const { label, tone } = toneFor(score)

  const sorted = [...factors].sort((a, b) => b.score - a.score)
  const best = sorted[0]
  const worst = sorted[sorted.length - 1]
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

  let verdict: string
  if (tone === 'good') {
    verdict = `${cap(best.note)}. ${plan ? `Go hard at ${plan}.` : 'Good day to go hard.'}`
  } else if (tone === 'ok') {
    verdict = `${cap(best.note)}, but ${worst.note}. ${plan ? `${cap(plan)} is fine, just keep the easy stuff easy.` : 'Train as planned and keep the easy stuff easy.'}`
  } else if (tone === 'warn') {
    verdict = `${cap(worst.note)}. ${plan ? `Play ${plan}, but skip anything extra.` : 'Keep today aerobic or swap it for mobility.'}`
  } else {
    verdict = `${cap(worst.note)}. Take the day off: one rest day now saves a bad week later.`
  }

  return { date: today.date, score, label, tone, verdict, factors: factors.map((f) => ({ ...f, score: round(f.score) })) }
}
