import { addWeeks, format, parseISO, startOfISOWeek } from 'date-fns'
import { ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { ActivityList } from '../../components/ActivityRow'
import { Bars, TrendChart } from '../../components/charts/charts'
import { Screen } from '../../components/ui/Screen'
import { StandoutLine } from '../../components/ui/Standout'
import { Empty, SampleBadge, Section } from '../../components/ui/bits'
import { Circled } from '../../components/ui/chalk'
import type { Activity, Race } from '../../data/types'
import { useRunModel, useWorld } from '../../data/world'
import { clock, dur, fmt, km, pace } from '../../lib/format'
import { mean } from '../../lib/math'
import { daysTo, formatGoal, goalPaceS, raceName, racesIn } from '../../lib/race'
import { BEST_NAME, bestsOf, type RunModel } from '../../lib/running'

const WEEKS = 12
const DAY = 86_400_000

/** Running, kept to what you'd chalk up: the week, whether you're getting fitter, and your best times. */
export function RunScreen() {
  const w = useWorld()
  const m = useRunModel(w)
  const runs = useMemo(() => w.activities.filter((a) => a.sport === 'run'), [w])
  const race = w.profile.race
  const left = race?.date ? daysTo(race, w.now) : undefined
  // for a month after race day the result leads, and it's the number that's circled
  const raced = race && left !== undefined && left < 0 && left >= -30 ? racesIn(w.activities, race).find((x) => x.start.slice(0, 10) === race.date) : undefined
  const news = w.news.run && (!raced || Date.parse(raced.start) !== w.news.run.t) ? w.news.run : undefined

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
          {race && left !== undefined && left >= 0 && <RaceAhead race={race} days={left} />}
          {race && raced && <RaceDone race={race} a={raced} />}
          <Week runs={runs} lead={!race || left === undefined || (left < 0 && !raced)} />
          {news && <StandoutLine s={news} className="mt-9" />}
          {m?.engineNow && <Fitness m={m} />}
          <Bests runs={runs} />
          <Races />
          <Section
            title="Recent"
            action={
              <Link to="/feed?sport=run" className="link">
                All runs <ChevronRight size={15} strokeWidth={2} />
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

/** This week's distance, and the twelve weeks behind it with your usual marked across them. */
function Week({ runs, lead }: { runs: Activity[]; lead: boolean }) {
  const w = useWorld()
  const weeks = useMemo(() => {
    const first = addWeeks(startOfISOWeek(w.now), -(WEEKS - 1))
    return Array.from({ length: WEEKS }, (_, i) => {
      const start = addWeeks(first, i)
      const end = addWeeks(start, 1)
      const list = runs.filter((a) => {
        const t = parseISO(a.start)
        return t >= start && t < end
      })
      return { start, km: list.reduce((s, a) => s + (a.distanceM ?? 0), 0) / 1000, n: list.length, time: list.reduce((s, a) => s + a.durationS, 0) }
    })
  }, [w, runs])
  const now = weeks[WEEKS - 1]
  const usual = mean(weeks.slice(0, -1).map((x) => x.km))
  const body = (
    <>
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-baseline">
          <span className={`num-hero ${lead ? '-ml-0.5 text-[81px]' : 'text-[50px]'}`}>{now.km ? now.km.toFixed(1) : '0'}</span>
          <span className="unit ml-2 text-[16px]">km</span>
        </div>
        <div className="meta pb-1 text-right">
          {now.n > 0 && <div>{`${now.n} ${now.n === 1 ? 'run' : 'runs'} · ${dur(now.time)}`}</div>}
          {Number.isFinite(usual) && <div>Usually {usual.toFixed(0)} km</div>}
        </div>
      </div>
      <div className="mt-6">
        <Bars
          values={weeks.map((x) => Math.round(x.km * 10) / 10)}
          labels={weeks.map((x, i) => (i % 4 === 0 ? format(x.start, 'd MMM') : null))}
          highlight={WEEKS - 1}
          usual={Number.isFinite(usual) ? usual : undefined}
          height={118}
        />
      </div>
    </>
  )
  return lead ? (
    <section>
      <div className="label mb-4">This week</div>
      {body}
    </section>
  ) : (
    <Section title="This week">{body}</Section>
  )
}

/** One number for fitness: the pace you hold at an easy heart rate, and which way it's going. */
function Fitness({ m }: { m: RunModel }) {
  const now = m.engineNow!
  const change = now.change !== undefined ? Math.round(now.change) : undefined
  const pts = m.runs.filter((r) => r.engine > 1.5 && r.engine < 7).map((r) => ({ t: r.t, v: r.engine }))
  const long = pts.length > 1 && pts[pts.length - 1].t - pts[0].t > 200 * DAY
  const steady = change === undefined || Math.abs(change) < 2
  return (
    <Section title="Fitness" action={<span className="meta">Pace at an easy {m.refHr} bpm</span>}>
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline">
          <span className="num-hero text-[50px]">{pace(now.v)}</span>
          <span className="unit ml-2 text-[16px]">/km</span>
        </div>
        {change !== undefined && now.since && (
          <div className={`text-right text-[15px] font-medium ${steady ? 'text-fg-2' : change < 0 ? 'text-good' : 'text-warn'}`}>
            {steady ? `Steady since ${fmt(now.since, 'd MMM')}` : `${Math.abs(change)} s ${change < 0 ? 'quicker' : 'slower'} than ${fmt(now.since, 'd MMM')}`}
          </div>
        )}
      </div>
      {pts.length > 2 && (
        <div className="mt-5">
          <TrendChart points={pts} avg={m.trend} height={132} format={pace} minSpan={0.15} xLabel={(t) => format(new Date(t), long ? 'MMM yyyy' : 'd MMM')} />
        </div>
      )}
    </Section>
  )
}

/** Your fastest time over each distance in the last year. One set in the last month is marked new. */
function Bests({ runs }: { runs: Activity[] }) {
  const w = useWorld()
  const list = useMemo(() => bestsOf(runs, racesIn(w.activities, w.profile.race)), [runs, w])
  if (!list.length) return null
  const fresh = (date: string) => w.now.getTime() - Date.parse(date) < 30 * DAY
  return (
    <Section title="Bests" action={<span className="meta">Last 12 months</span>}>
      <div className="list">
        {list.map((b) => (
          <Link key={b.k} to={`/activity/${b.id}`} className="flex items-baseline gap-3 py-3 transition-colors duration-150 active:bg-ink-2">
            <span className="t-name min-w-0 flex-1 truncate">{BEST_NAME[b.k]}</span>
            {fresh(b.date) && <span className="text-[12.5px] font-semibold text-mark">New</span>}
            <span className="meta">{fmt(b.date, 'd MMM')}</span>
            <span className="num w-[92px] text-right text-[21px]">{clock(b.s)}</span>
          </Link>
        ))}
      </div>
    </Section>
  )
}

/** Only there when you've switched on "Training for a race" in Settings. */
function RaceAhead({ race, days }: { race: Race; days: number }) {
  const goalPace = goalPaceS(race)
  return (
    <section className="mb-9">
      <div className="label mb-4">
        {raceName(race.distanceM)} · {fmt(race.date, 'EEE d MMM')}
      </div>
      <div className="flex items-baseline">
        <span className="num-hero -ml-0.5 text-[81px]">{days}</span>
        <span className="unit ml-3 text-[16px]">{days === 0 ? 'race day' : days === 1 ? 'day to go' : 'days to go'}</span>
      </div>
      {race.goalS && goalPace && (
        <div className="mt-4 text-[16px] font-medium text-fg-2">
          Goal {formatGoal(race.goalS)} · {clock(goalPace)} /km
        </div>
      )}
    </section>
  )
}

/** After race day, for a month: the result, and the way into the report. */
function RaceDone({ race, a }: { race: Race; a: Activity }) {
  const under = race.goalS !== undefined ? race.goalS - a.durationS : undefined
  const time = <span className="num-hero text-[72px]">{clock(a.durationS)}</span>
  return (
    <Link to={`/race/${a.id}`} className="press mb-9 block">
      <div className="label mb-4">
        {raceName(race.distanceM)} · {fmt(race.date, 'EEE d MMM')}
      </div>
      <div>{under !== undefined && under >= 0 ? <Circled seed={a.durationS}>{time}</Circled> : time}</div>
      <div className="mt-4 flex items-baseline justify-between gap-3">
        {under !== undefined && (
          <span className={`text-[16px] font-medium ${under >= 0 ? 'text-good' : 'text-warn'}`}>
            {under >= 0 ? `${clock(under)} inside your goal` : `${clock(-under)} over your goal`}
          </span>
        )}
        <span className="link ml-auto">
          Race report <ChevronRight size={15} strokeWidth={2} />
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
              <span className="block truncate text-[16px] font-semibold leading-5">{a.name}</span>
              <span className="meta block truncate">
                {fmt(a.start, 'EEE d MMM')} · {km(a.distanceM, 1)} km
              </span>
            </span>
            <span className="num text-[19px]">{clock(a.durationS)}</span>
            <ChevronRight size={16} strokeWidth={2} className="text-fg-4" />
          </Link>
        ))}
      </div>
    </Section>
  )
}
