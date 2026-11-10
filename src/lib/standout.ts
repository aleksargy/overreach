// What's worth saying. Nothing in here knows what a good HRV is, or a long run,
// or a heavy squat: a reading is news when it's the highest or the lowest you've
// had in a long while, judged only against your own readings, and it's said in
// those terms ("lowest in 3 weeks"). So there are no thresholds to tune and no
// stock sentences to get tired of, and most days most things say nothing.

export interface Reading {
  /** when, epoch ms */
  t: number
  v: number
}

export interface Series {
  key: string
  /** what it's called mid-sentence: "HRV", "run", "bench press" */
  what: string
  /** oldest first */
  points: Reading[]
  /** the word for a new high ("Highest", "Longest", "Heaviest"); leave out to stay quiet at that end */
  top?: string
  /** the word for a new low ("Lowest", "Shortest") */
  bottom?: string
  /** which end is good news, if either */
  good?: 'top' | 'bottom'
  format: (v: number) => string
  /** earlier readings it has to beat to be worth a mention (14 unless said) */
  min?: number
  /** the latest reading only counts if it's this recent (days) */
  fresh?: number
  /** how the stretch is said: by the calendar ("in 3 weeks") or by count ("in 9 games") */
  count?: string
}

export interface Standout {
  key: string
  /** "Lowest HRV in 3 weeks", "Heaviest bench press yet" */
  text: string
  /** the reading itself, formatted: the number that gets circled */
  value: string
  tone: 'good' | 'bad' | 'plain'
  /** how many earlier readings it beats, against how many it needed to */
  beaten: number
  rarity: number
  t: number
}

const DAY = 86_400_000

/** "9 days", "3 weeks", "4 months": a stretch of time said the way you'd say it. */
export function stretch(days: number): string {
  if (days < 14) return `${Math.max(2, Math.round(days))} days`
  if (days < 56) return `${Math.round(days / 7)} weeks`
  if (days < 345) return `${Math.round(days / 30.4)} months`
  return days < 550 ? 'a year' : `${Math.round(days / 365)} years`
}

/** The latest reading of one series, if it's the most extreme in long enough to mention. */
export function standoutOf(s: Series, now: number): Standout | undefined {
  const n = s.points.length
  const min = s.min ?? 14
  if (n <= min) return undefined
  const last = s.points[n - 1]
  if (now - last.t > (s.fresh ?? 1.5) * DAY) return undefined
  let best: Standout | undefined
  for (const end of ['top', 'bottom'] as const) {
    const word = s[end]
    if (!word) continue
    const beats = (v: number) => (end === 'top' ? last.v > v : last.v < v)
    let i = n - 2
    while (i >= 0 && beats(s.points[i].v)) i--
    const beaten = n - 2 - i
    if (beaten < min) continue
    // beaten everything there is: only "yet" once there's a fair run of history behind it
    const ever = i < 0
    const days = (last.t - s.points[Math.max(0, i)].t) / DAY
    const span = ever && (s.count ? n >= 2 * min : days >= 120) ? 'yet' : `in ${s.count ? `${beaten + 1} ${s.count}` : stretch(days)}`
    const candidate: Standout = {
      key: s.key,
      text: `${word} ${s.what} ${span}`,
      value: s.format(last.v),
      tone: !s.good ? 'plain' : s.good === end ? 'good' : 'bad',
      beaten,
      rarity: (beaten / min) * (ever ? 1.5 : 1),
      t: last.t,
    }
    if (!best || candidate.rarity > best.rarity) best = candidate
  }
  return best
}

/** The rarest thing among several series, or nothing: most days there's nothing to say, and that's the point. */
export function standout(series: Series[], now: number): Standout | undefined {
  let best: Standout | undefined
  for (const s of series) {
    const x = standoutOf(s, now)
    if (x && (!best || x.rarity > best.rarity)) best = x
  }
  return best
}

/**
 * The one for the front page (Today), from each tab's own: the rarest of them,
 * if it's twice as rare as its tab asks for and no more than a day and a half
 * old. A tab mentions what's unusual for that tab; Today only what's unusual
 * full stop, and only while it's still news. On Alex's data that's about two
 * mornings a week.
 */
export function headline(list: (Standout | undefined)[], now: number): Standout | undefined {
  let best: Standout | undefined
  for (const x of list) if (x && x.rarity >= 2 && now - x.t <= 1.5 * DAY && (!best || x.rarity > best.rarity)) best = x
  return best
}
