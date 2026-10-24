import { addDays, differenceInCalendarDays, format, getDay, getISOWeek, isSameDay, parseISO, startOfWeek } from 'date-fns'
import { Dumbbell, RefreshCw, Scale, Settings2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { ActivityRow, RatingBadge } from '../../components/ActivityRow'
import { RangeBar, Sparkline, TickMeter } from '../../components/charts/primitives'
import { Ball, SportIcon, SPORT_COLOR, SPORT_LABEL } from '../../components/icons/SportIcon'
import { IconButton, Screen } from '../../components/ui/Screen'
import { SampleBadge, Section } from '../../components/ui/bits'
import { Ticker } from '../../components/ui/Ticker'
import { useStore } from '../../data/store'
import type { Sport } from '../../data/types'
import { useUi } from '../../data/ui'
import { useWorld, type World } from '../../data/world'
import { dur, fmt, km } from '../../lib/format'
import { acwrLabel } from '../../lib/load'
import type { Readiness, Tone } from '../../lib/readiness'

const TONE: Record<Tone, { color: string; text: string }> = {
  good: { color: 'rgb(var(--z2))', text: 'text-z2' },
  ok: { color: 'rgb(var(--z3))', text: 'text-z3' },
  warn: { color: 'rgb(var(--z4))', text: 'text-z4' },
  bad: { color: 'rgb(var(--z5))', text: 'text-z5' },
}

export function TodayScreen() {
  const w = useWorld()
  const nav = useNavigate()
  const greeting = (() => {
    const h = w.now.getHours()
    return h < 5 ? 'Late one' : h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening'
  })()
  return (
    <Screen
      title={`${greeting}, ${w.profile.name}`}
      kicker={
        <span className="flex items-center gap-2">
          {format(w.now, 'EEE d MMM')} · Week {getISOWeek(w.now)}
          {w.mode === 'sample' && <SampleBadge />}
        </span>
      }
      actions={
        <IconButton label="Settings" onClick={() => nav('/settings')}>
          <Settings2 size={17} />
        </IconButton>
      }
    >
      {w.readiness ? <ReadinessCard r={w.readiness} /> : <div className="card p-5 text-fg-3">Readiness needs a week of watch data.</div>}
      <FootballStrip w={w} />
      <WeekStrip w={w} />
      <LoadCard w={w} />
      <QuickActions />
      <Section title="Latest" action={<Link to="/feed" className="font-mono text-[11px] uppercase tracking-[0.1em] text-fg-3">All activity →</Link>}>
        <div className="flex flex-col gap-2">
          {w.activities.slice(0, 3).map((a) => (
            <ActivityRow key={a.id} a={a} match={w.matchByActivity.get(a.id)} />
          ))}
        </div>
      </Section>
    </Screen>
  )
}

function ReadinessCard({ r }: { r: Readiness }) {
  const t = TONE[r.tone]
  return (
    <section className="chamfer relative overflow-hidden rounded-card border border-line bg-ink-1">
      <div className="spectrum absolute inset-x-0 top-0 h-[2px] opacity-80" />
      <div className="p-4 pb-3">
        <div className="flex items-center justify-between">
          <span className="label">Readiness</span>
          <span className={`font-mono text-[11px] font-semibold uppercase tracking-[0.14em] ${t.text}`}>{r.label}</span>
        </div>
        <div className="mt-2 flex items-end gap-2">
          <Ticker value={r.score} className="num text-[104px] leading-[0.8]" duration={1100} />
          <span className="mb-1 font-mono text-[12px] text-fg-3">/100</span>
        </div>
        <div className="mt-4">
          <TickMeter value={r.score} color={t.color} />
        </div>
        <p className="mt-4 text-[17px] font-medium leading-snug text-fg">{r.verdict}</p>
      </div>
      <div className="border-t border-line">
        {r.factors.map((f) => {
          const good = f.today > f.hi ? f.better === 'up' : f.today < f.lo ? f.better === 'down' : null
          return (
            <div key={f.key} className="grid grid-cols-[86px_1fr_auto] items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
              <span className="label">{f.label}</span>
              <RangeBar min={f.min} max={f.max} lo={f.lo} hi={f.hi} today={f.today} good={good} />
              <span className="min-w-[64px] text-right">
                <span className="num text-[20px]">{f.display}</span>
                <span className="ml-1 font-mono text-[9.5px] text-fg-3">{f.key === 'sleep' ? '' : f.unit}</span>
              </span>
            </div>
          )
        })}
        <div className="flex items-center gap-2 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-4">
          <span className="inline-block h-1 w-4 rounded-full bg-fg-4" /> your normal, last 28 days
        </div>
      </div>
    </section>
  )
}

function FootballStrip({ w }: { w: World }) {
  const open = useUi((s) => s.open)
  const last = w.matches[0]
  const unrated = w.unrated[0]
  return (
    <section className="mt-3 grid grid-cols-2 gap-2">
      {unrated ? (
        <button onClick={() => open({ type: 'logMatch', activityId: unrated.id })} className="press card relative col-span-2 flex items-center gap-3 overflow-hidden p-3.5 text-left">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-football/15 text-football">
            <Ball size={24} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="label block text-warn">Needs a rating</span>
            <span className="mt-0.5 block font-display text-[22px] font-extrabold uppercase leading-none">
              {unrated.name}, {fmt(unrated.start, 'EEE')}
            </span>
            <span className="mt-1 block font-mono text-[11px] text-fg-3">
              {km(unrated.distanceM, 1)} km{unrated.football ? ` · ${unrated.football.sprints} sprints` : ''}
            </span>
          </span>
          <span className="btn-primary h-10 px-4 text-[14px]">Rate it</span>
        </button>
      ) : null}
      {last && (
        <Link to={`/match/${last.id}`} className="press card flex flex-col justify-between gap-3 p-3.5">
          <span className="label">Last match</span>
          <span className="flex items-end justify-between">
            <span>
              <span className="num block text-[30px]">
                {last.scoreFor}–{last.scoreAgainst}
              </span>
              <span className="font-mono text-[10px] uppercase text-fg-3">{fmt(last.date, 'EEE d MMM')}</span>
            </span>
            <RatingBadge rating={last.rating} />
          </span>
        </Link>
      )}
      {w.nextFootball && (
        <div className="card flex flex-col justify-between gap-3 p-3.5">
          <span className="label">Next game</span>
          <span>
            <span className="block font-display text-[24px] font-extrabold uppercase leading-[0.95]">{w.nextFootball.label}</span>
            <span className="font-mono text-[10px] uppercase text-fg-3">{format(w.nextFootball.at, 'EEE HH:mm')} · usual slot</span>
          </span>
        </div>
      )}
    </section>
  )
}

function WeekStrip({ w }: { w: World }) {
  const start = startOfWeek(w.now, { weekStartsOn: 1 })
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const byDay = (d: Date) => w.activities.filter((a) => isSameDay(parseISO(a.start), d))
  const maxLoad = 320
  const weekActs = days.flatMap(byDay)
  const total = weekActs.reduce((a, x) => a + x.durationS, 0)
  return (
    <Section title="This week" action={<span className="font-mono text-[11px] text-fg-3">{weekActs.length} sessions · {dur(total)}</span>}>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const acts = byDay(d)
          const isToday = isSameDay(d, w.now)
          const future = differenceInCalendarDays(d, w.now) > 0
          const planned = future || isToday ? w.slots.filter((s) => s.dow === getDay(d) && !acts.some((a) => a.sport === s.sport)) : []
          const load = acts.reduce((a, x) => a + x.load, 0)
          return (
            <div key={d.toISOString()} className={`flex flex-col items-center rounded-[8px] border px-1 pb-2 pt-2 ${isToday ? 'border-fg/70 bg-ink-1' : 'border-line bg-ink-1/50'}`}>
              <span className={`font-mono text-[9.5px] uppercase ${isToday ? 'text-fg' : 'text-fg-3'}`}>{format(d, 'EEEEE')}</span>
              <span className={`num text-[19px] ${future ? 'text-fg-4' : ''}`}>{format(d, 'd')}</span>
              <div className="mt-1.5 flex min-h-[44px] flex-col items-center gap-1">
                {acts.slice(0, 3).map((a) => (
                  <SportIcon key={a.id} sport={a.sport} size={14} className="text-fg-2" />
                ))}
                {planned.slice(0, 2).map((s, i) => (
                  <span key={i} className="grid h-[18px] w-[18px] place-items-center rounded-full border border-dashed border-fg-4 text-fg-4">
                    <SportIcon sport={s.sport} size={10} />
                  </span>
                ))}
              </div>
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-ink-3">
                <div className="h-full rounded-full bg-fg-2" style={{ width: `${Math.min(100, (load / maxLoad) * 100)}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

function LoadCard({ w }: { w: World }) {
  const ratio = w.acwr
  const l = acwrLabel(ratio)
  const tone = l.tone === 'good' ? 'text-z2' : l.tone === 'warn' ? 'text-z4' : l.tone === 'bad' ? 'text-z5' : 'text-z1'
  const last14 = w.load.days.slice(-14)
  const sports: Sport[] = ['run', 'football', 'ride', 'swim', 'strength']
  // same smoothed numbers the ratio is built from, so the line under it adds up
  const acuteWeek = (w.load.acute[w.load.acute.length - 2] ?? 0) * 7
  const chronicWeek = (w.load.chronic[w.load.chronic.length - 2] ?? 0) * 7
  return (
    <Section title="Training load">
      <div className="card p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="label mb-1">Acute : chronic</div>
            <div className="flex items-baseline gap-2">
              <Ticker value={ratio} dp={2} className="num text-[48px]" />
              <span className={`font-mono text-[11px] font-semibold uppercase tracking-[0.12em] ${tone}`}>{l.label}</span>
            </div>
            <div className="mt-1 font-mono text-[11px] text-fg-3">
              Weekly load {Math.round(acuteWeek)} vs usual {Math.round(chronicWeek)}
            </div>
          </div>
          <div className="w-28 pt-1">
            <Sparkline values={w.load.ratio.slice(-42, -1)} band={[0.8, 1.3]} height={52} min={0.4} max={1.8} area={false} />
            <div className="mt-1 text-right font-mono text-[9px] uppercase tracking-[0.08em] text-fg-4">6 weeks</div>
          </div>
        </div>
        <div className="mt-4">
          <StackedLoad days={last14} sports={sports} />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
          {sports.map((s) => (
            <span key={s} className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-3">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: SPORT_COLOR[s] }} />
              {SPORT_LABEL[s]}
            </span>
          ))}
        </div>
      </div>
    </Section>
  )
}

function StackedLoad({ days, sports }: { days: World['load']['days']; sports: Sport[] }) {
  const max = Math.max(...days.map((d) => d.load), 1)
  return (
    <div className="flex h-[96px] items-end gap-[5px]">
      {days.map((d, i) => (
        <div key={d.date} className="flex h-full flex-1 flex-col justify-end">
          <div className="flex flex-col-reverse overflow-hidden rounded-[2px]" style={{ height: `${(d.load / max) * 80}%` }}>
            {sports.map((s) =>
              d.bySport[s] ? <span key={s} style={{ height: `${((d.bySport[s] ?? 0) / (d.load || 1)) * 100}%`, background: SPORT_COLOR[s] }} /> : null,
            )}
          </div>
          <span className={`mt-1 text-center font-mono text-[9px] ${i === days.length - 1 ? 'text-fg' : 'text-fg-4'}`}>{format(parseISO(d.date), 'EEEEE')}</span>
        </div>
      ))}
    </div>
  )
}

function QuickActions() {
  const open = useUi((s) => s.open)
  const active = useStore((s) => s.active)
  const setOpen = useUi((s) => s.setWorkoutOpen)
  const nav = useNavigate()
  const items = [
    { label: 'Log match', icon: <Ball size={20} />, on: () => open({ type: 'logMatch' }) },
    {
      label: active ? 'Resume lift' : 'Start lift',
      icon: <Dumbbell size={20} />,
      on: () => (active ? setOpen(true) : nav('/lift')),
    },
    { label: 'Weigh in', icon: <Scale size={20} />, on: () => open({ type: 'logBody' }) },
    { label: 'Sync Garmin', icon: <RefreshCw size={20} />, on: () => nav('/settings') },
  ]
  return (
    <Section title="Log">
      <div className="grid grid-cols-4 gap-2">
        {items.map((it) => (
          <button key={it.label} onClick={it.on} className="press card flex aspect-square flex-col items-center justify-center gap-2 p-2 text-fg-2">
            {it.icon}
            <span className="text-center font-mono text-[9.5px] font-semibold uppercase leading-tight tracking-[0.08em]">{it.label}</span>
          </button>
        ))}
      </div>
    </Section>
  )
}
