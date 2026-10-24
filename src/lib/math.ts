export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const round = (x: number, dp = 0) => {
  const f = 10 ** dp
  return Math.round(x * f) / f
}
export const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)
export const mean = (xs: readonly number[]) => (xs.length ? sum(xs) / xs.length : NaN)

export function std(xs: readonly number[]): number {
  if (xs.length < 2) return NaN
  const m = mean(xs)
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1))
}

export function quantile(xs: readonly number[], q: number): number {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const pos = (s.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return lerp(s[lo], s[hi], pos - lo)
}

export const median = (xs: readonly number[]) => quantile(xs, 0.5)

/** Exponentially weighted moving average over an evenly spaced series. */
export function ewma(xs: readonly number[], span: number): number[] {
  const k = 2 / (span + 1)
  const out: number[] = []
  let prev = xs.length ? xs[0] : 0
  for (const x of xs) {
    prev = prev + k * (x - prev)
    out.push(prev)
  }
  return out
}

export function rolling(xs: readonly number[], window: number, fn: (w: number[]) => number): number[] {
  return xs.map((_, i) => fn(xs.slice(Math.max(0, i - window + 1), i + 1) as number[]))
}

/** Linear map of x from [a0,a1] to [b0,b1], clamped. */
export function mapRange(x: number, a0: number, a1: number, b0: number, b1: number): number {
  const t = clamp((x - a0) / (a1 - a0), 0, 1)
  return lerp(b0, b1, t)
}
