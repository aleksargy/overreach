import { differenceInCalendarWeeks, endOfISOWeek, format, parseISO, startOfISOWeek } from 'date-fns'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { ActivityList } from '../../components/ActivityRow'
import { SportIcon } from '../../components/icons/SportIcon'
import { Screen } from '../../components/ui/Screen'
import { SampleBadge } from '../../components/ui/bits'
import type { Activity, Sport } from '../../data/types'
import { useWorld } from '../../data/world'
import { dur, km } from '../../lib/format'

/** Weeks drawn at a time: two years of history is a long list to lay out on a phone. */
const PAGE = 8

const FILTERS: { key: Sport | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'run', label: 'Run' },
  { key: 'football', label: 'Football' },
  { key: 'ride', label: 'Ride' },
  { key: 'swim', label: 'Swim' },
  { key: 'strength', label: 'Lift' },
]

export function FeedScreen() {
  const w = useWorld()
  const [params] = useSearchParams()
  const initial = FILTERS.find((x) => x.key === params.get('sport'))?.key ?? 'all'
  const [f, setF] = useState<Sport | 'all'>(initial)
  const [shown, setShown] = useState(PAGE)
  const list = w.activities.filter((a) => f === 'all' || a.sport === f)
  const weeks = new Map<string, Activity[]>()
  for (const a of list) {
    const k = format(startOfISOWeek(parseISO(a.start)), 'yyyy-MM-dd')
    weeks.set(k, [...(weeks.get(k) ?? []), a])
  }
  const oldest = w.activities.at(-1)
  const span = oldest ? differenceInCalendarWeeks(w.now, parseISO(oldest.start), { weekStartsOn: 1 }) + 1 : 0
  // only offer the sports that are actually in the history
  const filters = FILTERS.filter((x) => x.key === 'all' || x.key === f || w.activities.some((a) => a.sport === x.key))
  return (
    <Screen
      title="All activity"
      back
      kicker={
        <span className="flex items-center gap-2">
          {w.activities.length} sessions{oldest && (span <= 26 ? ` in ${span} weeks` : ` since ${format(parseISO(oldest.start), 'MMMM yyyy')}`)}
          {w.mode === 'sample' && <SampleBadge />}
        </span>
      }
    >
      <div className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4">
        {filters.map((x) => (
          <button
            key={x.key}
            onClick={() => {
              setF(x.key)
              setShown(PAGE)
            }}
            className={`chip shrink-0 ${f === x.key ? 'chip-on' : ''}`}
          >
            {x.key !== 'all' && <SportIcon sport={x.key} size={14} />}
            {x.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-8">
        {[...weeks.entries()].slice(0, shown).map(([k, acts]) => {
          const start = parseISO(k)
          const dist = acts.reduce((s, a) => s + (a.sport === 'swim' ? 0 : (a.distanceM ?? 0)), 0)
          const time = acts.reduce((s, a) => s + a.durationS, 0)
          return (
            <section key={k}>
              <div className="mb-2.5 flex items-baseline justify-between gap-3 px-1">
                <h2 className="text-[15px] font-semibold tracking-[-0.01em]">
                  {format(start, 'd MMM')} – {format(endOfISOWeek(start), 'd MMM')}
                </h2>
                <span className="meta">
                  {dur(time)}
                  {dist > 0 && ` · ${km(dist, 0)} km`}
                </span>
              </div>
              <ActivityList items={acts} matchFor={(a) => w.matchByActivity.get(a.id)} />
            </section>
          )
        })}
        {weeks.size > shown && (
          <button onClick={() => setShown((n) => n + PAGE)} className="btn-ghost w-full">
            Show older weeks
          </button>
        )}
      </div>
    </Screen>
  )
}
