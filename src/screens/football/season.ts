import { parseISO } from 'date-fns'
import type { Format, Match } from '../../data/types'
import type { World } from '../../data/world'
import { formatOf, playerCard, result, type Physical } from '../../lib/football'
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

/**
 * The season in two layers. The player card and the totals on it cover every
 * format you play. Everything that only makes sense against the same kind of
 * game (results, records, form) is split by format: an 11s team and a 7s
 * team are different sides on different pitches.
 */
export function season(w: World) {
  const from = seasonStart(w.now)
  const ms = w.matches.filter((m) => parseISO(m.date) >= from)
  // physical records come from the watch, so games you haven't rated count too
  const games = w.activities.filter((a) => a.sport === 'football' && parseISO(a.start) >= from)
  const gameFormat = new Map(games.map((a) => [a.id, formatOf(a, w.matches, w.matchByActivity, w.profile.format)]))
  const counts = new Map<Format, number>()
  for (const m of ms) counts.set(m.format, (counts.get(m.format) ?? 0) + 1)
  for (const a of games) if (!w.matchByActivity.has(a.id)) counts.set(gameFormat.get(a.id)!, (counts.get(gameFormat.get(a.id)!) ?? 0) + 1)
  // most played first; the format of your latest game breaks a tie
  const latest = ms[0]?.format
  const formats = [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || (b === latest ? 1 : 0) - (a === latest ? 1 : 0))
  return {
    label: seasonLabel(w.now),
    apps: ms.length,
    /** games the watch recorded this season, rated or not */
    games: games.length,
    goals: ms.reduce((a, m) => a + m.goals, 0),
    assists: ms.reduce((a, m) => a + m.assists, 0),
    card: playerCard(rowsFor(w, ms), w.profile.position),
    formats,
    /** one format's season: results, form and records only against the same kind of game */
    format(f: Format) {
      const fm = ms.filter((m) => m.format === f)
      const res = fm.map(result)
      const physical = games.filter((a) => a.football && gameFormat.get(a.id) === f).map((a) => ({ m: w.matchByActivity.get(a.id), act: a, a: a.football! }))
      const best = <T>(xs: T[], fn: (x: T) => number) => xs.reduce<T | undefined>((b, x) => (b === undefined || fn(x) > fn(b) ? x : b), undefined)
      return {
        matches: fm,
        apps: fm.length,
        goals: fm.reduce((a, m) => a + m.goals, 0),
        assists: fm.reduce((a, m) => a + m.assists, 0),
        w: res.filter((r) => r === 'W').length,
        d: res.filter((r) => r === 'D').length,
        l: res.filter((r) => r === 'L').length,
        avgRating: fm.length ? mean(fm.map((m) => m.rating)) : 0,
        /** where you were in each game the watch recorded, rated or not, with the position you logged */
        pitch: games.filter((a) => a.football?.trace && gameFormat.get(a.id) === f).map((a) => ({ trace: a.football!.trace!, position: w.matchByActivity.get(a.id)?.position })),
        records: {
          top: best(physical, (x) => x.a.topSpeedKmh),
          sprints: best(physical, (x) => x.a.sprints),
          bestRating: best(fm, (m) => m.rating),
          ga: best(fm, (m) => m.goals + m.assists),
        },
      }
    },
  }
}
