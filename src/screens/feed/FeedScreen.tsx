import { differenceInCalendarWeeks, endOfISOWeek, format, parseISO, startOfISOWeek } from 'date-fns'
import { useState } from 'react'
import { ActivityRow } from '../../components/ActivityRow'
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
  const [f, setF] = useState<Sport | 'all'>('all')
  const [shown, setShown] = useState(PAGE)
  const list = w.activities.filter((a) => f === 'all' || a.sport === f)
  const weeks = new Map<string, Activity[]>()
  for (const a of list) {
    const k = format(startOfISOWeek(parseISO(a.start)), 'yyyy-MM-dd')
    weeks.set(k, [...(weeks.get(k) ?? []), a])
  }
  const oldest = w.activities.at(-1)
  const span = oldest ? differenceInCalendarWeeks(w.now, parseISO(oldest.start), { weekStartsOn: 1 }) + 1 : 0
  return (
    <Screen
      title="Feed"
      kicker={
        <span className="flex items-center gap-2">
          {w.activities.length} sessions{oldest && (span <= 26 ? `, ${span} weeks` : ` since ${format(parseISO(oldest.start), 'MMM yyyy')}`)}{' '}
          {w.mode === 'sample' && <SampleBadge />}
        </span>
      }
    >
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {FILTERS.map((x) => (
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
      <div className="flex flex-col gap-7">
        {[...weeks.entries()].slice(0, shown).map(([k, acts]) => {
          const start = parseISO(k)
          const dist = acts.reduce((s, a) => s + (a.sport === 'swim' ? 0 : (a.distanceM ?? 0)), 0)
          const time = acts.reduce((s, a) => s + a.durationS, 0)
          const load = acts.reduce((s, a) => s + a.load, 0)
          return (
            <section key={k}>
              <div className="mb-2.5 flex items-baseline justify-between border-b border-line pb-2">
                <h2 className="font-display text-[20px] font-extrabold uppercase">
                  {format(start, 'd MMM')} – {format(endOfISOWeek(start), 'd MMM')}
                </h2>
                <span className="font-mono text-[10.5px] text-fg-3">
                  {dur(time)} · {km(dist, 0)} km · load {Math.round(load)}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {acts.map((a) => (
                  <ActivityRow key={a.id} a={a} match={w.matchByActivity.get(a.id)} />
                ))}
              </div>
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
