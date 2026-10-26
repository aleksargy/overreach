import { addDays, addWeeks, format, parseISO, startOfISOWeek } from 'date-fns'
import { ChevronDown, ChevronRight, Mountain, Thermometer } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ActivityList } from '../../components/ActivityRow'
import { Bars, StackedBars, TrendChart } from '../../components/charts/charts'
import { DriftChart, EffortCurve } from '../../components/charts/running'
import { Screen } from '../../components/ui/Screen'
import { Empty, SampleBadge, Section } from '../../components/ui/bits'
import type { Activity, Race } from '../../data/types'
import { useRunModel, useWorld } from '../../data/world'
import { clock, dur, fmt, km, pace } from '../../lib/format'
import { zoneBounds, zoneOf } from '../../lib/load'
import { mean } from '../../lib/math'
import { blockOf, weeklyMix } from '../../lib/mix'
import { daysTo, formatGoal, goalPaceS, raceName, racesIn, taperShare, weeklyKm } from '../../lib/race'
import { hrAtPace, type RunModel } from '../../lib/running'

const WEEKS = 12

export function RunScreen() {
  const w = useWorld()
  const m = useRunModel(w)
  const runs = useMemo(() => w.activities.filter((a) => a.sport === 'run'), [w])
  const race = w.profile.race

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
          {race && race.date && daysTo(race, w.now) >= 0 && <RaceCard race={race} m={m} />}
          {race && race.date && daysTo(race, w.now) < 0 && daysTo(race, w.now) >= -30 && <RaceDone race={race} />}
          {m?.engineNow ? (
            <Engine m={m} />
          ) : (
            <Empty title="Fitness needs a few more runs">It’s worked out from runs with heart rate, minute by minute. About five is enough to start.</Empty>
          )}
          <Volume />
          <Mix />
          {m?.durability && <Durability d={m.durability} run={(id) => w.byId.get(id)} />}
          {m?.cs && <CriticalSpeed cs={m.cs} />}
          {m && <Costs m={m} />}
          <Races />
          <Section
            title="Recent runs"
            action={
              <Link to="/feed?sport=run" className="link">
                All runs <ChevronRight size={15} strokeWidth={2} />
              </Link>
            }
          >
            <ActivityList items={runs.slice(0, 6)} matchFor={() => undefined} />
          </Section>
        </>
      )}
    </Screen>
  )
}

function Engine({ m }: { m: RunModel }) {
  const now = m.engineNow!
  const change = now.change !== undefined ? Math.round(now.change) : undefined
  const pts = m.runs.filter((r) => r.engine > 1.5 && r.engine < 7).map((r) => ({ t: r.t, v: r.engine }))
  const long = pts.length > 1 && pts[pts.length - 1].t - pts[0].t > 200 * 86_400_000
  const steady = change === undefined || Math.abs(change) < 2
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <span className="label">Fitness</span>
        <span className="meta">Easy pace at {m.refHr} bpm</span>
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="num-hero -ml-1 text-[96px]">{pace(now.v)}</span>
        <span className="text-[17px] font-medium text-fg-3">/km</span>
      </div>
      {change !== undefined && now.since && (
        <div className={`mt-4 text-[15px] font-medium ${steady ? 'text-fg-2' : change < 0 ? 'text-good' : 'text-warn'}`}>
          {steady ? `Holding steady since ${fmt(now.since, 'd MMM')}` : `${Math.abs(change)} s/km ${change < 0 ? 'faster' : 'slower'} than on ${fmt(now.since, 'd MMM')}`}
        </div>
      )}
      <p className="mt-2 text-[15px] leading-snug text-fg-2">
        How fast you run at an easy {m.refHr} bpm, on the flat in cool air. Faster means fitter
        {!steady && change! > 0 ? ', though in a heavy block tiredness shows up here too.' : '.'}
      </p>
      {pts.length > 2 && (
        <div className="card mt-6 p-4">
          <TrendChart points={pts} avg={m.trend} height={150} format={pace} minSpan={0.15} xLabel={(t) => format(new Date(t), long ? 'MMM yyyy' : 'd MMM')} />
          <HowItWorks>
            Each dot is a run. Every run is boiled down, minute by minute, to how your heart rate answers pace, hills and time on your feet, which gives the pace you’d hold at{' '}
            {m.refHr} bpm, about 68% of your heart rate reserve. Heat and the day after football are taken out first. Tiredness from training isn’t, so a heavy block reads slow.
            The line is the trend.
          </HowItWorks>
        </div>
      )}
    </section>
  )
}

/** The method, folded away under the meaning. */
function HowItWorks({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-4 border-t border-line pt-3">
      <button onClick={() => setOpen((x) => !x)} aria-expanded={open} className="flex w-full items-center justify-between text-[13px] font-medium text-fg-3">
        How it’s worked out
        <ChevronDown size={15} strokeWidth={2} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <p className="meta mt-2 leading-snug">{children}</p>}
    </div>
  )
}

function Volume() {
  const w = useWorld()
  const weeks = useMemo(() => {
    const runs = w.activities.filter((a) => a.sport === 'run')
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
  }, [w])
  const now = weeks[WEEKS - 1]
  const usual = mean(weeks.slice(0, -1).map((x) => x.km))
  return (
    <Section title="Weekly distance" action={Number.isFinite(usual) ? <span className="meta">Usually {usual.toFixed(1)} km</span> : undefined}>
      <div className="card p-4">
        <div className="flex items-baseline gap-2">
          <span className="num text-[28px]">{now.km.toFixed(1)}</span>
          <span className="text-[13px] text-fg-3">km this week</span>
          {now.n > 0 && <span className="meta ml-auto">{`${now.n} ${now.n === 1 ? 'run' : 'runs'} · ${dur(now.time)}`}</span>}
        </div>
        <div className="mt-4">
          <Bars
            values={weeks.map((x) => Math.round(x.km * 10) / 10)}
            labels={weeks.map((x, i) => (i % 4 === 0 ? format(x.start, 'd MMM') : null))}
            highlight={WEEKS - 1}
            height={110}
          />
        </div>
      </div>
    </Section>
  )
}

const MIX_COLORS = ['rgb(var(--z2))', 'rgb(var(--z4))', 'rgb(var(--z5))']

/** Easy, steady and hard by heart rate, week by week, and this block against the one before. */
function Mix() {
  const w = useWorld()
  const weeks = useMemo(() => weeklyMix(w.activities, w.now, WEEKS), [w])
  const [now, before] = useMemo(() => [blockOf(w.activities, addDays(w.now, -56), w.now), blockOf(w.activities, addDays(w.now, -112), addDays(w.now, -56))], [w])
  if (now.runs < 3) return null
  const pct = (x: number) => Math.round(x * 100)
  // only against a block your history fully covers
  const compare = before.runs >= 3 && w.activities.some((a) => a.sport === 'run' && Date.parse(a.start) < addDays(w.now, -105).getTime())
  const rows = [
    { k: 'Distance a week', a: `${Math.round(now.kmPerWeek)} km`, b: `${Math.round(before.kmPerWeek)} km` },
    { k: 'Runs of 90 min+', a: String(now.longRuns), b: String(before.longRuns) },
    { k: 'Tempo and up a week', a: `${Math.round(now.hardMin)} min`, b: `${Math.round(before.hardMin)} min` },
  ]
  return (
    <Section title="Easy and hard" action={<span className="meta">By heart rate</span>}>
      <div className="card p-4">
        <div className="flex items-baseline gap-2">
          <span className="num text-[28px]">{pct(now.easy)}%</span>
          <span className="text-[13px] text-fg-3">of your running easy</span>
        </div>
        <p className="meta mt-1.5">
          Over the last 8 weeks, in zones 1 to 3
          {compare && Math.abs(pct(now.easy) - pct(before.easy)) >= 3 ? `, ${pct(now.easy) > pct(before.easy) ? 'up' : 'down'} from ${pct(before.easy)}% the 8 weeks before.` : '.'}
        </p>
        <div className="mt-4">
          <StackedBars
            parts={weeks.map((x) => [x.easyS, x.tempoS, x.hardS].map((s) => s / 60))}
            colors={MIX_COLORS}
            labels={weeks.map((x, i) => (i % 4 === 0 ? format(x.start, 'd MMM') : null))}
            highlight={WEEKS - 1}
            height={110}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-fg-3">
          {['Easy, zones 1–3', 'Tempo, zone 4', 'Hard, zone 5'].map((label, i) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: MIX_COLORS[i] }} /> {label}
            </span>
          ))}
        </div>
      </div>
      {compare && (
        <div className="card mt-2 overflow-hidden">
          <div className="grid grid-cols-[1fr_84px_84px] gap-2 border-b border-line px-4 py-2.5 text-[12px] font-medium text-fg-4">
            <span>This block against the one before</span>
            <span className="text-right">Last 8 wks</span>
            <span className="text-right">8 before</span>
          </div>
          {rows.map((r) => (
            <div key={r.k} className="grid grid-cols-[1fr_84px_84px] gap-2 border-b border-line px-4 py-2.5 last:border-0">
              <span className="text-[14px] text-fg-2">{r.k}</span>
              <span className="text-right text-[15px] font-medium tabular-nums">{r.a}</span>
              <span className="text-right text-[15px] tabular-nums text-fg-3">{r.b}</span>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function CriticalSpeed({ cs }: { cs: NonNullable<RunModel['cs']> }) {
  const reserve = Math.round(cs.dPrime / 5) * 5
  return (
    <Section title="Speed" action={<span className="meta">Threshold pace</span>}>
      <div className="card p-4">
        <div className="flex items-end justify-between gap-4">
          <div className="flex items-baseline gap-1.5">
            <span className={`num text-[44px] leading-none ${cs.solid ? '' : 'text-fg-3'}`}>{pace(cs.cs)}</span>
            <span className="text-[15px] text-fg-3">/km</span>
          </div>
          {!cs.solid && <span className="chip h-7 px-3 text-[12px]">Rough</span>}
        </div>
        <p className="mt-3 text-[15px] leading-snug text-fg-2">
          About the pace you could hold for 30 to 40 minutes flat out, close to your 10K race pace.
          {cs.solid
            ? ` Above it you’ve got roughly ${reserve} m in reserve, the kick you can spend before you have to slow.`
            : ' None of your runs in the last 90 days were all-out, so this reads slow. A parkrun or a hard 3 km would pin it down.'}
        </p>
        {cs.solid && (
          <div className="mt-5 grid grid-cols-3 gap-2">
            {cs.predictions.map((p) => (
              <div key={p.label} className="rounded-[14px] bg-ink-2 px-3 py-3">
                <div className="label">{p.label}</div>
                <div className="num mt-1.5 text-[19px]">{clock(p.s)}</div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-5">
          <EffortCurve envelope={cs.envelope} cs={cs.cs} dPrime={cs.dPrime} height={150} />
        </div>
        <div className="mt-3 text-[12px] text-fg-3">Your best pace for each length of effort, last {cs.days} days</div>
        <HowItWorks>
          The dots are your fastest pace for each length of effort, from 1 minute to an hour, across every run in the last {cs.days} days. The curve through the best of them levels
          off at critical speed; how far your short efforts sit above it is the reserve (D′, about {reserve} m). It’s marked rough until the curve rests on real hard efforts at
          both ends, and race times only show once it does: they assume you’ve trained for the distance.
        </HowItWorks>
      </div>
    </Section>
  )
}

function Durability({ d, run }: { d: NonNullable<RunModel['durability']>; run: (id: string) => Activity | undefined }) {
  const latest = d.latest
  const held = latest.onset === undefined
  const lastHeld = d.last !== latest && d.last.onset === undefined
  const a = run(latest.id)
  // a faster run drifts sooner, so say so when that's part of the story
  const [vNow, vThen] = [a?.avgSpeed, d.first && run(d.first.id)?.avgSpeed]
  const faster = vNow && vThen ? Math.round(1000 / vThen - 1000 / vNow) : 0
  const lines = [
    ...(d.first ? [{ pts: d.first.pts, color: 'rgb(var(--fg-4))', mark: d.first.onset }] : []),
    { pts: latest.pts, color: 'rgb(var(--fg))', width: 2, mark: latest.onset },
  ]
  return (
    <Section title="Endurance" action={<span className="meta">Long, steady runs</span>}>
      <div className="card p-4">
        <div className="flex items-baseline gap-1.5">
          <span className="num text-[44px] leading-none">{held ? latest.minutes : latest.onset}</span>
          <span className="text-[15px] text-fg-3">min</span>
        </div>
        <div className="mt-2 text-[15px] text-fg-2">
          {held ? 'at an even pace, and your heart rate held the whole way' : 'at an even pace before your heart rate started creeping up'}
        </div>
        <p className="mt-2 text-[15px] leading-snug text-fg-2">The longer this gets, the better you hold your pace late in a long run or a race.</p>
        <p className="meta mt-1.5 leading-snug">
          {[
            `From your ${a?.distanceM ? `${km(a.distanceM, 1)} km run` : 'run'} on ${fmt(latest.date, 'd MMM')}.`,
            d.first &&
              `In ${fmt(d.first.date, 'MMMM')} it held for ${d.first.onset} min${faster >= 5 ? `, and this run was ${faster} s/km faster, which brings drift on sooner` : ''}.`,
            lastHeld && `Your last long run held steady for all ${d.last.minutes} minutes.`,
          ]
            .filter(Boolean)
            .join(' ')}
        </p>
        <div className="mt-5">
          <DriftChart lines={lines} threshold={5} height={140} />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-fg-3">
          <span className="flex items-center gap-1.5">
            <span className="h-[2px] w-3 rounded-full bg-fg" /> {fmt(latest.date, 'd MMM')}
          </span>
          {d.first && (
            <span className="flex items-center gap-1.5">
              <span className="h-[2px] w-3 rounded-full bg-fg-4" /> {fmt(d.first.date, 'd MMM')}
            </span>
          )}
          <span>bpm above where it settled</span>
        </div>
        <HowItWorks>
          From your long runs at an even pace. Heart rate should settle and stay put for a given pace and slope; the minute it sits 5 bpm above that on its own is where fatigue
          starts to show, so heat, dehydration and a fast start all bring it earlier. The chart shows how far above it went, minute by minute.
        </HowItWorks>
      </div>
    </Section>
  )
}

function Costs({ m }: { m: RunModel }) {
  const rows: { key: string; icon: ReactNode; title: string; value: string; sub: string }[] = []
  if (m.hills) {
    const net = Math.round(m.hills.netPer10m)
    rows.push({
      key: 'hills',
      icon: <Mountain size={18} strokeWidth={1.75} />,
      title: 'Hills',
      value: `+${Math.round(m.hills.upS)} s/km`,
      sub: `For every 1% of climb. ${
        Math.round(m.hills.downS) > 0 ? `Going down gives back ${Math.round(m.hills.downS)}` : 'Going down gives none of it back'
      }, so a route that climbs 10 m a kilometre costs you ${net > 0 ? `${net} s/km` : 'nothing'} overall.`,
    })
  }
  if (m.heat) {
    const h = m.heat
    const from = `From ${h.runs} runs between ${Math.round(h.range[0])} and ${Math.round(h.range[1])}°C.`
    rows.push({
      key: 'heat',
      icon: <Thermometer size={18} strokeWidth={1.75} />,
      title: 'Heat',
      value: h.clear ? `+${Math.round(h.sPer5C)} s/km` : 'None',
      sub: h.clear ? `For every 5°C above 12°C. ${from}` : `Warm runs look like cool ones at the same heart rate. ${from}`,
    })
  }
  if (!rows.length) return null
  return (
    <Section title="What slows you down" action={<span className="meta">Same heart rate</span>}>
      <div className="card list overflow-hidden [--inset:60px]">
        {rows.map((r) => (
          <div key={r.key} className="flex gap-3 px-4 py-3.5">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink-2 text-fg-2">{r.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] font-medium">{r.title}</span>
                <span className="num text-[17px]">{r.value}</span>
              </div>
              <p className="meta mt-1 leading-snug">{r.sub}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

/** Only there when you've switched on "Training for a race" in Settings. */
function RaceCard({ race, m }: { race: Race; m: RunModel | null }) {
  const w = useWorld()
  const days = daysTo(race, w.now)
  const goalPace = goalPaceS(race)
  const hr = m && goalPace && race.goalS ? hrAtPace(m, 1000 / goalPace, race.goalS / 60) : undefined
  const zone = hr ? zoneOf(hr.settled, zoneBounds(w.profile)) + 1 : undefined
  const weeks = weeklyKm(w.activities, w.now)
  const peak = Math.max(...weeks)
  const coming = taperShare(days, race.distanceM)
  const raceWeek = days > 7 ? taperShare(7, race.distanceM) : undefined
  const longFrom = Math.min(25_000, race.distanceM * 0.6)
  const long = w.activities.filter((a) => a.sport === 'run' && (a.distanceM ?? 0) >= longFrom && w.now.getTime() - Date.parse(a.start) < 56 * 86_400_000).slice(0, 3)
  const kmRange = (share: [number, number]) => `${Math.round(peak * share[0])}–${Math.round(peak * share[1])} km`
  return (
    <section className="mb-10">
      <div className="flex items-center justify-between gap-3">
        <span className="label">{raceName(race.distanceM)}</span>
        <span className="meta">{fmt(race.date, 'EEE d MMM')}</span>
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="num-hero -ml-1 text-[72px]">{days}</span>
        <span className="text-[17px] font-medium text-fg-3">{days === 0 ? 'race day' : days === 1 ? 'day to go' : 'days to go'}</span>
      </div>
      {race.goalS && goalPace && (
        <div className="mt-2 text-[15px] font-medium text-fg-2">
          Goal {formatGoal(race.goalS)} · {clock(goalPace)} /km
        </div>
      )}
      {(hr || long.length > 0 || (coming && peak > 0)) && (
        <div className="card list mt-5 overflow-hidden">
          {hr && (
            <RaceRow label="Goal pace">
              <span className="block text-[15px] font-medium">
                {hr.settled} → {hr.end} bpm
              </span>
              <span className="meta block">
                Your heart rate would settle around {hr.settled}
                {zone ? ` (zone ${zone})` : ''} and drift to about {hr.end} by the finish, on a flat, cool day at today’s fitness.
              </span>
            </RaceRow>
          )}
          {long.length > 0 && (
            <RaceRow label="Long runs">
              {long.map((a) => (
                <span key={a.id} className="block text-[14px] tabular-nums text-fg-2">
                  {km(a.distanceM, 1)} km at {pace(a.avgSpeed)}
                  {a.avgHr ? ` · ${a.avgHr} bpm` : ''} <span className="text-fg-4">· {fmt(a.start, 'd MMM')}</span>
                </span>
              ))}
            </RaceRow>
          )}
          {coming && peak > 0 && (
            <RaceRow label="Taper">
              <span className="block text-[15px] font-medium">{kmRange(coming)} this week</span>
              <span className="meta block">
                Last 7 days: {Math.round(weeks[0])} km{Math.round(weeks[0]) >= Math.round(peak) ? ', your biggest week' : `, against a biggest week of ${Math.round(peak)}`}. A
                taper usually lands at {Math.round(coming[0] * 100)}–{Math.round(coming[1] * 100)}% of it{raceWeek ? `, then ${kmRange(raceWeek)} in race week` : ''}.
              </span>
            </RaceRow>
          )}
        </div>
      )}
    </section>
  )
}

/** After race day, for a month: the result, and the way into the report. */
function RaceDone({ race }: { race: Race }) {
  const w = useWorld()
  const a = racesIn(w.activities, race).find((x) => x.start.slice(0, 10) === race.date)
  if (!a) return null
  const under = race.goalS !== undefined ? race.goalS - a.durationS : undefined
  return (
    <Link to={`/race/${a.id}`} className="press mb-10 block">
      <div className="flex items-center justify-between gap-3">
        <span className="label">{raceName(race.distanceM)}</span>
        <span className="meta">{fmt(race.date, 'EEE d MMM')}</span>
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="num-hero -ml-1 text-[72px]">{clock(a.durationS)}</span>
      </div>
      {under !== undefined && (
        <div className={`mt-2 text-[15px] font-medium ${under >= 0 ? 'text-good' : 'text-warn'}`}>
          {under >= 0 ? `${clock(under)} inside your goal` : `${clock(-under)} over your goal`}
        </div>
      )}
      <div className="link mt-3">
        Race report <ChevronRight size={15} strokeWidth={2} />
      </div>
    </Link>
  )
}

/** Every race this year, newest first, each with its report. */
function Races() {
  const w = useWorld()
  const yearAgo = w.now.getTime() - 365 * 86_400_000
  const list = racesIn(w.activities, w.profile.race)
    .filter((a) => Date.parse(a.start) >= yearAgo)
    .slice(0, 5)
  if (!list.length) return null
  return (
    <Section title="Races">
      <div className="card list overflow-hidden">
        {list.map((a) => (
          <Link key={a.id} to={`/race/${a.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors duration-150 active:bg-ink-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium leading-5">{a.name}</span>
              <span className="meta block truncate">
                {fmt(a.start, 'EEE d MMM')} · {km(a.distanceM, 1)} km
              </span>
            </span>
            <span className="num text-[17px]">{clock(a.durationS)}</span>
            <ChevronRight size={16} strokeWidth={2} className="text-fg-4" />
          </Link>
        ))}
      </div>
    </Section>
  )
}

function RaceRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-3 px-4 py-3.5">
      <span className="text-[14px] text-fg-2">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  )
}
