import { parseISO } from 'date-fns'
import type { Match } from '../../data/types'
import type { World } from '../../data/world'
import { playerCard, result, type Physical } from '../../lib/football'
import { mean } from '../../lib/math'

export function seasonStart(now: Date): Date {
  const y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
  return new Date(y, 7, 1)
}

export function seasonLabel(now: Date): string {
  const y = seasonStart(now).getFullYear() % 100
  return `${String(y).padStart(2, '0')}/${String((y + 1) % 100).padStart(2, '0')}`
}

export function rowsFor(w: World, matches: Match[]): { match: Match; analysis?: Physical }[] {
  return matches.map((m) => ({ match: m, analysis: m.activityId ? w.byId.get(m.activityId)?.football : undefined }))
}

export function season(w: World) {
  const from = seasonStart(w.now)
  const ms = w.matches.filter((m) => parseISO(m.date) >= from)
  const rows = rowsFor(w, ms)
  const res = ms.map(result)
  const physical = rows.filter((r) => r.analysis).map((r) => ({ m: r.match, a: r.analysis! }))
  const best = <T,>(xs: T[], f: (x: T) => number) => xs.reduce<T | undefined>((b, x) => (b === undefined || f(x) > f(b) ? x : b), undefined)
  const top = best(physical, (x) => x.a.topSpeedKmh)
  const sprints = best(physical, (x) => x.a.sprints)
  const far = best(physical, (x) => x.a.distanceM / Math.max(1, x.a.minutes))
  const bestRating = best(ms, (m) => m.rating)
  const ga = best(ms, (m) => m.goals + m.assists)
  return {
    label: seasonLabel(w.now),
    matches: ms,
    apps: ms.length,
    goals: ms.reduce((a, m) => a + m.goals, 0),
    assists: ms.reduce((a, m) => a + m.assists, 0),
    w: res.filter((r) => r === 'W').length,
    d: res.filter((r) => r === 'D').length,
    l: res.filter((r) => r === 'L').length,
    avgRating: ms.length ? mean(ms.map((m) => m.rating)) : 0,
    card: playerCard(rows, w.profile.position),
    records: { top, sprints, far, bestRating, ga },
  }
}
