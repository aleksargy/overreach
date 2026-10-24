import { addWeeks, format, parseISO, startOfISOWeek } from 'date-fns'
import { ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { ActivityList } from '../../components/ActivityRow'
import { Bars } from '../../components/charts/charts'
import { Screen } from '../../components/ui/Screen'
import { Empty, SampleBadge, Section } from '../../components/ui/bits'
import { Ticker } from '../../components/ui/Ticker'
import { useWorld } from '../../data/world'
import { dur, pace } from '../../lib/format'
import { mean } from '../../lib/math'

const WEEKS = 12

export function RunScreen() {
  const w = useWorld()
  const runs = useMemo(() => w.activities.filter((a) => a.sport === 'run'), [w])
  const weeks = useMemo(() => {
    const first = addWeeks(startOfISOWeek(w.now), -(WEEKS - 1))
    return Array.from({ length: WEEKS }, (_, i) => {
      const start = addWeeks(first, i)
      const end = addWeeks(start, 1)
      const list = runs.filter((a) => {
        const t = parseISO(a.start)
        return t >= start && t < end
      })
      const m = list.reduce((s, a) => s + (a.distanceM ?? 0), 0)
      const t = list.reduce((s, a) => s + a.durationS, 0)
      return { start, km: m / 1000, n: list.length, time: t, speed: t ? m / t : 0 }
    })
  }, [runs, w.now])
  const now = weeks[WEEKS - 1]
  const usual = mean(weeks.slice(0, -1).map((x) => x.km))

  return (
    <Screen
      title="Run"
      kicker={
        <span className="flex items-center gap-2">
          {runs.length ? `${runs.length} runs` : 'From your watch'}
          {w.mode === 'sample' && <SampleBadge />}
        </span>
      }
    >
      {runs.length === 0 ? (
        <Empty title="No runs yet">Runs from your watch show up here after the next sync.</Empty>
      ) : (
        <>
          <section>
            <div className="label">This week</div>
            <div className="mt-4 flex items-baseline gap-2">
              <Ticker value={now.km} dp={1} className="num-hero -ml-1 text-[96px]" duration={1000} />
              <span className="text-[17px] font-medium text-fg-3">km</span>
            </div>
            <div className="meta mt-4">{now.n ? `${now.n} ${now.n === 1 ? 'run' : 'runs'} · ${dur(now.time)} · ${pace(now.speed)} /km` : 'No runs yet this week'}</div>
          </section>

          <div className="card mt-6 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="label">Weekly distance</span>
              {Number.isFinite(usual) && <span className="meta">usually {usual.toFixed(1)} km</span>}
            </div>
            <div className="mt-4">
              <Bars
                values={weeks.map((x) => Math.round(x.km * 10) / 10)}
                labels={weeks.map((x, i) => (i % 4 === 0 ? format(x.start, 'd MMM') : null))}
                highlight={WEEKS - 1}
                height={120}
              />
            </div>
          </div>

          <Section
            title="Recent runs"
            action={
              <Link to="/feed?sport=run" className="link">
                All runs <ChevronRight size={15} strokeWidth={2} />
              </Link>
            }
          >
            <ActivityList items={runs.slice(0, 8)} matchFor={() => undefined} />
          </Section>
        </>
      )}
    </Screen>
  )
}
