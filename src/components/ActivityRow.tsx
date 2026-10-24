import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import type { Activity, Match } from '../data/types'
import { dur, fmt, kmh, km, pace, swimPace } from '../lib/format'
import { ratingTone } from '../lib/football'
import { SportIcon } from './icons/SportIcon'
import { ZoneBar } from './charts/primitives'

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
  const s = size === 'lg' ? 'h-16 w-16 text-[34px]' : size === 'sm' ? 'h-7 w-9 text-[16px]' : size === 'row' ? 'h-8 w-10 text-[18px]' : 'h-10 w-12 text-[22px]'
  return <span className={`num chamfer-sm grid shrink-0 place-items-center ${s} ${t.cls} text-ink-0`}>{rating.toFixed(1)}</span>
}

export function ActivityRow({ a, match }: { a: Activity; match?: Match }) {
  const h = headline(a)
  const to = a.sport === 'football' && match ? `/match/${match.id}` : a.sport === 'strength' && a.workoutId ? `/lift/history/${a.workoutId}` : `/activity/${a.id}`
  return (
    <Link to={to} className="press card flex items-center gap-3 p-3 pr-2.5">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[8px] bg-ink-2 text-fg-2">
        <SportIcon sport={a.sport} size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-[15px] font-semibold">{a.name}</span>
        </span>
        <span className="mt-0.5 block truncate font-mono text-[10.5px] uppercase tracking-[0.06em] text-fg-3">{fmt(a.start, 'EEE d MMM · HH:mm')}</span>
        <span className="mt-1.5 block w-24">
          <ZoneBar zones={a.zoneS} height={3} />
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2.5">
        {a.sport === 'football' &&
          (match ? (
            <RatingBadge rating={match.rating} size="sm" />
          ) : (
            <span className="rounded-full border border-warn/50 px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-warn">Rate</span>
          ))}
        <span className="text-right">
          <span className="num block text-[26px]">
            {h.value}
            <span className="ml-0.5 font-sans text-[11px] font-medium text-fg-3">{h.unit}</span>
          </span>
          <span className="block font-mono text-[10px] text-fg-3">{secondary(a)[0]}</span>
        </span>
        <ChevronRight size={16} className="text-fg-4" />
      </span>
    </Link>
  )
}
