// Small deterministic RNG so sample data looks the same on every load.

export function hashString(s: string): number {
  let h = 1779033703 ^ s.length
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^= h >>> 16) >>> 0
}

export type Rng = {
  (): number
  range: (lo: number, hi: number) => number
  int: (lo: number, hi: number) => number
  pick: <T>(xs: readonly T[]) => T
  chance: (p: number) => boolean
  normal: (mean?: number, sd?: number) => number
}

export function rng(seed: number | string): Rng {
  let a = typeof seed === 'string' ? hashString(seed) : seed >>> 0
  const next = (() => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }) as Rng
  next.range = (lo, hi) => lo + (hi - lo) * next()
  next.int = (lo, hi) => Math.floor(next.range(lo, hi + 1))
  next.pick = (xs) => xs[Math.floor(next() * xs.length)]
  next.chance = (p) => next() < p
  next.normal = (mean = 0, sd = 1) => {
    const u = 1 - next()
    const v = next()
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  return next
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}
