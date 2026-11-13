import { Link } from 'react-router'
import type { Activity, Match } from '../data/types'
import { dur, fmt, kmh, km, pace, swimPace } from '../lib/format'
import { ratingTone } from '../lib/football'
import { SportDot } from './icons/SportIcon'

export function headline(a: Activity): { value: string; unit: string } {
  switch (a.sport) {
    case 'run':
    case 'ride':
      return { value: km(a.distanceM), unit: 'km' }
    case 'swim':
      return { value: String(a.distanceM ?? 0), unit: 'm' }
    case 'football':
      return { value: km(a.distanceM, 1), unit: 'km' }
    case 'strength':
      if (a.lift) return { value: String(a.lift.sets), unit: 'sets' }
      return { value: String(Math.round(a.durationS / 60)), unit: 'min' }
    default:
      return { value: String(Math.round(a.durationS / 60)), unit: 'min' }
  }
}

export function secondary(a: Activity): string[] {
  const out: string[] = []
  if (a.sport === 'run') out.push(`${pace(a.avgSpeed)} /km`, dur(a.durationS))
  else if (a.sport === 'ride') out.push(`${kmh(a.avgSpeed).toFixed(1)} km/h`, dur(a.durationS))
  else if (a.sport === 'swim') out.push(`${swimPace(a.avgSpeed)} /100m`, dur(a.durationS))
  else if (a.sport === 'football') out.push(dur(a.durationS), a.football ? `${a.football.sprints} sprints` : '')
  else if (a.sport === 'strength' && a.lift) out.push(a.lift.volumeKg >= 1000 ? `${(a.lift.volumeKg / 1000).toFixed(1)} t · ${dur(a.durationS)}` : dur(a.durationS))
  // anything else already leads with its minutes
  if (a.avgHr) out.push(`${a.avgHr} bpm`)
  return out.filter(Boolean)
}

/** A rating as a pill: the number in its band's colour, on that colour's tint. */
export function RatingBadge({ rating, size = 'md' }: { rating: number; size?: 'sm' | 'row' | 'md' | 'lg' }) {
  const t = ratingTone(rating)
  const s = size === 'lg' ? 'h-12 px-4 text-[26px]' : size === 'sm' ? 'h-6 px-2 text-[12.5px]' : size === 'row' ? 'h-7 px-2.5 text-[13.5px]' : 'h-8 px-3 text-[15px]'
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-full font-extrabold tabular-nums ${s}`}
      style={{ color: `rgb(var(${t.v}))`, background: `rgb(var(${t.v}) / 0.14)` }}
    >
      {rating.toFixed(1)}
    </span>
  )
}

/** One session as a row in a grouped list: what, when, and the number that matters for its sport. */
export function ActivityRow({ a, match }: { a: Activity; match?: Match }) {
  const h = headline(a)
  const to = a.sport === 'football' && match ? `/match/${match.id}` : a.sport === 'strength' && a.workoutId ? `/lift/history/${a.workoutId}` : `/activity/${a.id}`
  return (
    <Link to={to} className="flex items-center gap-3 py-3 transition-colors duration-150 active:bg-ink-2">
      <SportDot sport={a.sport} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold leading-5">{a.name}</span>
        <span className="meta block truncate">{fmt(a.start, 'EEE d MMM · HH:mm')}</span>
      </span>
      {a.sport === 'football' && (match ? <RatingBadge rating={match.rating} size="sm" /> : <span className="pill [--p:var(--run)]">Rate</span>)}
      <span className="shrink-0 text-right">
        <span className="num block text-[18px] leading-5">
          {h.value}
          <span className="unit ml-0.5 text-[12px]">{h.unit}</span>
        </span>
        <span className="meta block">{secondary(a)[0]}</span>
      </span>
    </Link>
  )
}

/** Rows inside a tile, split by hairlines: the way every list in the app is set. */
export function ActivityList({ items, matchFor }: { items: Activity[]; matchFor: (a: Activity) => Match | undefined }) {
  return (
    <div className="list">
      {items.map((a) => (
        <ActivityRow key={a.id} a={a} match={matchFor(a)} />
      ))}
    </div>
  )
}
