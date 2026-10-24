import { addWeeks, format, parseISO, startOfISOWeek } from 'date-fns'
import { ChevronRight, Mountain, Thermometer } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ActivityList } from '../../components/ActivityRow'
import { Bars, TrendChart } from '../../components/charts/charts'
import { DriftChart, EffortCurve } from '../../components/charts/running'
import { Ball } from '../../components/icons/SportIcon'
import { Screen } from '../../components/ui/Screen'
import { Empty, SampleBadge, Section } from '../../components/ui/bits'
import { useRunModel, useWorld } from '../../data/world'
import { clock, dur, fmt, pace } from '../../lib/format'
import { mean } from '../../lib/math'
import type { RunModel } from '../../lib/running'

const WEEKS = 12

export function RunScreen() {
  const w = useWorld()
  const m = useRunModel(w)
  const runs = useMemo(() => w.activities.filter((a) => a.sport === 'run'), [w])

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
          {m?.engineNow ? (
            <Engine m={m} />
          ) : (
            <Empty title="Your engine needs a few more runs">It’s worked out from runs with heart rate, minute by minute. About five is enough to start.</Empty>
          )}
          <Volume />
          {m?.cs && <CriticalSpeed cs={m.cs} />}
          {m?.durability && <Durability d={m.durability} />}
          {m && <Costs m={m} />}
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
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <span className="label">Aerobic engine</span>
        <span className="meta">at {m.refHr} bpm</span>
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="num-hero -ml-1 text-[96px]">{pace(now.v)}</span>
        <span className="text-[17px] font-medium text-fg-3">/km</span>
      </div>
      {change !== undefined && now.since && (
        <div className="mt-4 text-[15px] font-medium">
          {change === 0 ? (
            <span className="text-fg-2">Holding steady since {fmt(now.since, 'd MMM')}</span>
          ) : (
            <span className={change < 0 ? 'text-good' : 'text-warn'}>
              {Math.abs(change)} s/km {change < 0 ? 'faster' : 'slower'} than on {fmt(now.since, 'd MMM')}
            </span>
          )}
        </div>
      )}
      <p className="meta mt-2 leading-snug">
        The pace you’d hold at {m.refHr} bpm on flat ground, cool and fresh. Hills, heat, football and tiredness are taken out of every run first.
      </p>
      {pts.length > 2 && (
        <div className="card mt-6 p-4">
          <TrendChart points={pts} avg={m.trend} height={150} format={pace} minSpan={0.15} xLabel={(t) => format(new Date(t), long ? 'MMM yyyy' : 'd MMM')} />
        </div>
      )}
    </section>
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

function CriticalSpeed({ cs }: { cs: NonNullable<RunModel['cs']> }) {
  return (
    <Section title="Critical speed" action={<span className="meta">Last {cs.days} days</span>}>
      <div className="card p-4">
        <div className="flex items-end justify-between gap-4">
          <div className="flex items-baseline gap-1.5">
            <span className={`num text-[44px] leading-none ${cs.solid ? '' : 'text-fg-3'}`}>{pace(cs.cs)}</span>
            <span className="text-[15px] text-fg-3">/km</span>
          </div>
          {!cs.solid && <span className="chip h-7 px-3 text-[12px]">Rough</span>}
          {cs.solid && (
            <div className="text-right">
              <div className="label">D′</div>
              <div className="mt-1 text-[20px] font-medium tabular-nums leading-none">
                {Math.round(cs.dPrime / 5) * 5}
                <span className="ml-0.5 text-[13px] font-normal text-fg-3">m</span>
              </div>
            </div>
          )}
        </div>
        <p className="meta mt-3 leading-snug">
          {cs.solid
            ? `The fastest pace you can keep up for about half an hour. Above it you burn through D′, a reserve of about ${Math.round(cs.dPrime / 5) * 5} m that only easing off refills.`
            : 'None of your runs in this window look flat out, so this reads slow. A parkrun or a 3 km time trial will pin it down.'}
        </p>
        <div className="mt-5">
          <EffortCurve envelope={cs.envelope} cs={cs.cs} dPrime={cs.dPrime} height={150} />
        </div>
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
      </div>
      {cs.solid && <p className="meta mt-3 px-1">Race times assume you’ve trained for the distance. The longer the race, the rougher the guess.</p>}
    </Section>
  )
}

function Durability({ d }: { d: NonNullable<RunModel['durability']> }) {
  const latest = d.latest
  const held = latest.onset === undefined
  const lastHeld = d.last !== latest && d.last.onset === undefined
  const lines = [
    ...(d.first ? [{ pts: d.first.pts, color: 'rgb(var(--fg-4))', mark: d.first.onset }] : []),
    { pts: latest.pts, color: 'rgb(var(--fg))', width: 2, mark: latest.onset },
  ]
  return (
    <Section title="Durability" action={<span className="meta">Long runs</span>}>
      <div className="card p-4">
        <div className="flex items-baseline gap-1.5">
          <span className="num text-[44px] leading-none">{held ? latest.minutes : latest.onset}</span>
          <span className="text-[15px] text-fg-3">min</span>
        </div>
        <div className="mt-2 text-[15px] text-fg-2">{held ? 'on your feet with no drift in heart rate' : 'before your heart rate starts to drift'}</div>
        <p className="meta mt-1.5 leading-snug">
          {[
            `${held ? 'Held steady' : 'Drifted'} on ${fmt(latest.date, 'd MMM')}.`,
            d.first && `In ${fmt(d.first.date, 'MMMM')} it drifted after ${d.first.onset}.`,
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
  if (m.football) {
    const f = m.football
    rows.push({
      key: 'football',
      icon: <Ball size={18} strokeWidth={1.75} />,
      title: 'Football legs',
      value: f.clear ? `+${Math.round(f.sPerKm)} s/km` : 'None',
      sub: f.clear
        ? `Within 36 hours of a game, ${Math.round(f.bpm)} bpm more for the same pace. From ${f.after} runs after games and ${f.without} without.`
        : `Runs within 36 hours of a game look like the rest. From ${f.after} runs after games and ${f.without} without.`,
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
