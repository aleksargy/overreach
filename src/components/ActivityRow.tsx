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

export function RatingBadge({ rating, size = 'md' }: { rating: number; size?: 'sm' | 'row' | 'md' | 'lg' }) {
  const t = ratingTone(rating)
  const s =
    size === 'lg'
      ? 'h-14 min-w-[64px] rounded-[5px] px-2 text-[36px]'
      : size === 'sm'
        ? 'h-6 min-w-[34px] rounded-[4px] px-1.5 text-[17px]'
        : size === 'row'
          ? 'h-7 min-w-[38px] rounded-[4px] px-1.5 text-[19px]'
          : 'h-8 min-w-[44px] rounded-[4px] px-2 text-[21px]'
  return <span className={`num grid shrink-0 place-items-center !font-bold ${s} ${t.cls} text-ink-0`}>{rating.toFixed(1)}</span>
}

/** One session as a row in a grouped list: what, when, and the number that matters for its sport. */
export function ActivityRow({ a, match }: { a: Activity; match?: Match }) {
  const h = headline(a)
  const to = a.sport === 'football' && match ? `/match/${match.id}` : a.sport === 'strength' && a.workoutId ? `/lift/history/${a.workoutId}` : `/activity/${a.id}`
  return (
    <Link to={to} className="flex items-center gap-3 py-3 transition-colors duration-150 active:bg-ink-2">
      <SportDot sport={a.sport} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-semibold leading-5">{a.name}</span>
        <span className="meta block truncate">{fmt(a.start, 'EEE d MMM · HH:mm')}</span>
      </span>
      {a.sport === 'football' &&
        (match ? (
          <RatingBadge rating={match.rating} size="sm" />
        ) : (
          <span className="rounded-[4px] px-2 py-1 text-[12px] font-semibold leading-none text-mark ring-1 ring-inset ring-mark/50">Rate</span>
        ))}
      <span className="shrink-0 text-right">
        <span className="num block text-[22px] leading-5">
          {h.value}
          <span className="unit ml-0.5 text-[12px]">{h.unit}</span>
        </span>
        <span className="meta block">{secondary(a)[0]}</span>
      </span>
    </Link>
  )
}

/** Rows straight on the board, split by chalk rules: the way every list in the app is set. */
export function ActivityList({ items, matchFor }: { items: Activity[]; matchFor: (a: Activity) => Match | undefined }) {
  return (
    <div className="list">
      {items.map((a) => (
        <ActivityRow key={a.id} a={a} match={matchFor(a)} />
      ))}
    </div>
  )
}
