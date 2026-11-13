import { addWeeks, format, parseISO, startOfISOWeek } from 'date-fns'
import { ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { ActivityList } from '../../components/ActivityRow'
import { Sparkline } from '../../components/charts/primitives'
import { Screen } from '../../components/ui/Screen'
import { StandoutLine } from '../../components/ui/Standout'
import { Empty, SampleBadge, Section } from '../../components/ui/bits'
import type { Activity, Race } from '../../data/types'
import { useRunModel, useWorld } from '../../data/world'
import { clock, fmt, km, pace } from '../../lib/format'
import { mean } from '../../lib/math'
import { daysTo, formatGoal, goalPaceS, raceName, racesIn } from '../../lib/race'
import { BEST_NAME, bestsOf, type RunModel } from '../../lib/running'
import type { Standout } from '../../lib/standout'

const WEEKS = 12
const DAY = 86_400_000

/** Running, kept small: the week, whether you're getting fitter, and your best times. */
export function RunScreen() {
  const w = useWorld()
  const m = useRunModel(w)
  const runs = useMemo(() => w.activities.filter((a) => a.sport === 'run'), [w])
  const weeks = useMemo(() => {
    const first = addWeeks(startOfISOWeek(w.now), -(WEEKS - 1))
    return Array.from({ length: WEEKS }, (_, i) => {
      const start = addWeeks(first, i)
      const end = addWeeks(start, 1)
      return { start, km: runs.filter((a) => parseISO(a.start) >= start && parseISO(a.start) < end).reduce((s, a) => s + (a.distanceM ?? 0), 0) / 1000 }
    })
  }, [w, runs])
  const race = w.profile.race
  const left = race?.date ? daysTo(race, w.now) : undefined
  // for a month after race day the result leads
  const raced = race && left !== undefined && left < 0 && left >= -30 ? racesIn(w.activities, race).find((x) => x.start.slice(0, 10) === race.date) : undefined
  const news = w.news.run && (!raced || Date.parse(raced.start) !== w.news.run.t) ? w.news.run : undefined
  // the runs the bars cover, since the month they start in
  const recent = runs.filter((a) => parseISO(a.start) >= weeks[0].start)
  const since = recent.length ? parseISO(recent[recent.length - 1].start) : undefined

  return (
    <Screen
      title="Run"
      kicker={
        <span className="flex items-center gap-2">
          {since ? `${recent.length} ${recent.length === 1 ? 'run' : 'runs'} since ${format(since, 'MMMM')}` : runs.length ? `${runs.length} runs` : 'From your watch'}
          {w.mode === 'sample' && <SampleBadge />}
        </span>
      }
    >
      {runs.length === 0 ? (
        <Empty title="No runs yet">Runs from your watch show up here after the next sync.</Empty>
      ) : (
        <>
          {race && left !== undefined && left >= 0 && <RaceAhead race={race} days={left} />}
          {race && raced && <RaceDone race={race} a={raced} />}
          <Week weeks={weeks} news={news?.key === 'week' ? news : undefined} />
          {news && news.key === 'long' && <StandoutLine s={news} className="mt-2.5" />}
          {m?.engineNow && <Fitness m={m} />}
          <Bests runs={runs} news={news?.key.startsWith('best-') ? news : undefined} />
          <Races />
          <Section
            title="Recent"
            action={
              <Link to="/feed?sport=run" className="link">
                All runs <ChevronRight size={14} strokeWidth={2.2} />
              </Link>
            }
          >
            <ActivityList items={runs.slice(0, 5)} matchFor={() => undefined} />
          </Section>
        </>
      )}
    </Screen>
  )
}

/** This week's distance, against your usual week and the twelve weeks behind it, with the biggest solid. */
function Week({ weeks, news }: { weeks: { start: Date; km: number }[]; news?: Standout }) {
  const now = weeks[WEEKS - 1]
  const usual = mean(weeks.slice(0, -1).map((x) => x.km))
  const max = Math.max(...weeks.map((x) => x.km), 1)
  const top = weeks.reduce((b, x, i) => (x.km > weeks[b].km ? i : b), 0)
  return (
    <section className="hero flex flex-col gap-2.5 bg-run-tint">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-bold text-run-label">This week</h2>
        {usual >= 1 && <span className="pill [--p:var(--run-label)]">Usually {usual.toFixed(0)} km</span>}
      </div>
      <div className="num-hero text-[64px] text-run-head">
        {now.km ? now.km.toFixed(1) : '0'}
        <span className="ml-1 font-sans text-[20px] font-semibold tracking-normal text-run-label">km</span>
      </div>
      {usual >= 1 && (
        <div className="h-2 overflow-hidden rounded-full bg-run/[0.16]">
          <div className="h-full rounded-full bg-run" style={{ width: `${Math.min(100, (now.km / usual) * 100)}%` }} />
        </div>
      )}
      <div className="mt-1 flex h-10 items-end gap-1" role="img" aria-label="The last twelve weeks of running, this week last">
        {weeks.map((x, i) => (
          <div
            key={x.start.toISOString()}
            className={`min-w-0 flex-1 rounded-[5px] ${i === WEEKS - 1 ? 'bg-run-head' : i === top ? 'bg-run' : 'bg-run/[0.22]'}`}
            style={{ height: `${Math.max(4, (x.km / max) * 40)}px` }}
          />
        ))}
      </div>
      {news && (
        <span className="text-[13px] font-semibold text-run-head/80">
          {news.value} was your biggest week {news.short.replace(/^Biggest /, '')}
        </span>
      )}
    </section>
  )
}

/** One number for fitness: the pace you hold at an easy heart rate, and which way it's gone over eight weeks. */
function Fitness({ m }: { m: RunModel }) {
  const now = m.engineNow!
  const change = now.change !== undefined ? Math.round(now.change) : undefined
  const steady = change === undefined || Math.abs(change) < 2
  const last = m.trend[m.trend.length - 1]?.t ?? 0
  const line = m.trend.filter((x) => x.t >= last - 56 * DAY).map((x) => x.v)
  return (
    <Section title={`Fitness · pace at an easy ${m.refHr} bpm`}>
      <div className="flex items-baseline gap-2.5">
        <span className="num text-[40px] tracking-[-0.03em]">
          {pace(now.v)}
          <span className="unit text-[14px]">/km</span>
        </span>
        {change !== undefined && now.since && (
          <span className={`pill ${steady ? '[--p:var(--fg-3)]' : change < 0 ? '[--p:var(--good)]' : '[--p:var(--bad)]'}`}>
            {steady ? 'Steady' : `${Math.abs(change)} s ${change < 0 ? 'quicker' : 'slower'}`}
          </span>
        )}
      </div>
      {line.length > 2 && (
        <div className="mt-2">
          <Sparkline values={line} height={56} color="rgb(var(--run))" dotR={5} />
        </div>
      )}
    </Section>
  )
}

const SHORT_NAME = ['1 km', '5 km', '10 km', 'Half', 'Marathon']

/** Your fastest time over each distance in the last year, a small tile each. One set in the last month is new, in sage. */
function Bests({ runs, news }: { runs: Activity[]; news?: Standout }) {
  const w = useWorld()
  const list = useMemo(() => bestsOf(runs, racesIn(w.activities, w.profile.race)), [runs, w])
  if (!list.length) return null
  const fresh = (date: string) => w.now.getTime() - Date.parse(date) < 30 * DAY
  return (
    <div className="mt-2.5 grid grid-cols-3 gap-2.5">
      {list.map((b) => {
        const isNew = fresh(b.date) || news?.key === `best-${b.k}`
        return (
          <Link key={b.k} to={`/activity/${b.id}`} title={BEST_NAME[b.k]} className={`press tile flex min-w-0 flex-col gap-1 p-3.5 ${isNew ? 'bg-football-tint' : ''}`}>
            <span className={`truncate text-[12.5px] ${isNew ? 'font-bold text-football' : 'font-semibold text-fg-3'}`}>
              {SHORT_NAME[b.k]}
              {isNew ? ' · new' : ''}
            </span>
            <span className={`num tracking-[-0.02em] ${b.s >= 3600 ? 'text-[20px]' : 'text-[24px]'} ${isNew ? 'font-extrabold text-football-head' : ''}`}>{clock(b.s)}</span>
            <span className={`text-[11.5px] ${isNew ? 'text-football-label' : 'text-fg-3'}`}>{fmt(b.date, 'd MMM')}</span>
          </Link>
        )
      })}
    </div>
  )
}

/** Only there when you've switched on "Training for a race" in Settings. */
function RaceAhead({ race, days }: { race: Race; days: number }) {
  const goalPace = goalPaceS(race)
  return (
    <section className="tile mb-2.5">
      <div className="label">
        {raceName(race.distanceM)} · {fmt(race.date, 'EEE d MMM')}
      </div>
      <div className="mt-3 flex items-baseline">
        <span className="num-hero text-[58px]">{days}</span>
        <span className="unit ml-2 text-[18px]">{days === 0 ? 'race day' : days === 1 ? 'day to go' : 'days to go'}</span>
      </div>
      {race.goalS && goalPace && (
        <div className="mt-3 text-[14px] text-fg-2">
          Goal {formatGoal(race.goalS)} · {clock(goalPace)} /km
        </div>
      )}
    </section>
  )
}

/** After race day, for a month: the result, and the way into the report. */
function RaceDone({ race, a }: { race: Race; a: Activity }) {
  const under = race.goalS !== undefined ? race.goalS - a.durationS : undefined
  const time = <span className="num-hero text-[58px]">{clock(a.durationS)}</span>
  return (
    <Link to={`/race/${a.id}`} className="press tile mb-2.5 block">
      <div className="label mb-3">
        {raceName(race.distanceM)} · {fmt(race.date, 'EEE d MMM')}
      </div>
      <div className={under !== undefined && under >= 0 ? 'text-football' : ''}>{time}</div>
      <div className="mt-3 flex items-baseline justify-between gap-3">
        {under !== undefined && (
          <span className={`text-[14px] font-semibold ${under >= 0 ? 'text-good' : 'text-bad'}`}>
            {under >= 0 ? `${clock(under)} inside your goal` : `${clock(-under)} over your goal`}
          </span>
        )}
        <span className="link ml-auto">
          Race report <ChevronRight size={14} strokeWidth={2.2} />
        </span>
      </div>
    </Link>
  )
}

/** Every race this year, newest first, each with its report. */
function Races() {
  const w = useWorld()
  const yearAgo = w.now.getTime() - 365 * DAY
  const list = racesIn(w.activities, w.profile.race)
    .filter((a) => Date.parse(a.start) >= yearAgo)
    .slice(0, 4)
  if (!list.length) return null
  return (
    <Section title="Races">
      <div className="list">
        {list.map((a) => (
          <Link key={a.id} to={`/race/${a.id}`} className="flex items-center gap-3 py-3 transition-colors duration-150 active:bg-ink-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-bold leading-5">{a.name}</span>
              <span className="meta block truncate">
                {fmt(a.start, 'EEE d MMM')} · {km(a.distanceM, 1)} km
              </span>
            </span>
            <span className="num text-[18px]">{clock(a.durationS)}</span>
            <ChevronRight size={16} strokeWidth={2} className="text-fg-4" />
          </Link>
        ))}
      </div>
    </Section>
  )
}
