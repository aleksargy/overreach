import { addDays, differenceInCalendarDays, format, getDay, isSameDay, parseISO, startOfWeek } from 'date-fns'
import { ChevronRight, Plus } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { ActivityList, RatingBadge } from '../../components/ActivityRow'
import { RangeBar, Sparkline } from '../../components/charts/primitives'
import { SportDot, SportIcon, SPORT_LABEL, sportColor } from '../../components/icons/SportIcon'
import { IconButton, Screen } from '../../components/ui/Screen'
import { SampleBadge, Section } from '../../components/ui/bits'
import { Ticker } from '../../components/ui/Ticker'
import type { Sport } from '../../data/types'
import { useUi } from '../../data/ui'
import { useWorld, type World } from '../../data/world'
import { dur, fmt, km } from '../../lib/format'
import { acwrLabel } from '../../lib/load'
import { readiness, type Readiness, type Tone } from '../../lib/readiness'

const TONE_VAR: Record<Tone, string> = { good: '--z2', ok: '--z3', warn: '--z4', bad: '--z5' }
const toneColor = (t: Tone, a = 1) => `rgb(var(${TONE_VAR[t]}) / ${a})`
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function TodayScreen() {
  const w = useWorld()
  const nav = useNavigate()
  const open = useUi((s) => s.open)
  const h = w.now.getHours()
  const greeting = h < 5 ? 'Late one' : h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening'
  return (
    <Screen
      title={`${greeting}, ${w.profile.name}`}
      kicker={
        <span className="flex items-center gap-2">
          {format(w.now, 'EEEE d MMMM')}
          {w.mode === 'sample' && <SampleBadge />}
        </span>
      }
      actions={
        <>
          <IconButton label="Log something" onClick={() => open({ type: 'log' })}>
            <Plus size={19} strokeWidth={2} />
          </IconButton>
          <button
            aria-label="Settings"
            title="Settings"
            onClick={() => nav('/settings')}
            className="press grid h-9 w-9 place-items-center rounded-full bg-ink-2 text-[14px] font-semibold text-fg-2"
          >
            {w.profile.name.trim().charAt(0).toUpperCase() || '·'}
          </button>
        </>
      }
    >
      {w.readiness ? <ReadinessHero r={w.readiness} w={w} /> : <p className="text-[15px] text-fg-3">Readiness shows up after a week of watch data.</p>}
      <Football w={w} />
      <Week w={w} />
      <Load w={w} />
      {w.activities.length > 0 && (
        <Section
          title="Latest"
          action={
            <Link to="/feed" className="link">
              All activity <ChevronRight size={15} strokeWidth={2} />
            </Link>
          }
        >
          <ActivityList items={w.activities.slice(0, 3)} matchFor={(a) => w.matchByActivity.get(a.id)} />
        </Section>
      )}
    </Screen>
  )
}

/** Readiness for each of the last seven mornings, judged the same way as today's. */
function useReadinessWeek(w: World) {
  return useMemo(() => {
    const out: { date: string; score: number; tone: Tone }[] = []
    for (let k = 6; k >= 0; k--) {
      const r = readiness(w.dailies.slice(0, w.dailies.length - k), w.load.ratio[w.load.ratio.length - 2 - k] ?? 1)
      if (r) out.push({ date: r.date, score: r.score, tone: r.tone })
    }
    return out
  }, [w])
}

function ReadinessHero({ r, w }: { r: Readiness; w: World }) {
  const week = useReadinessWeek(w)
  return (
    <section>
      <div className="flex items-center justify-between">
        <span className="label">Readiness</span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-[5px] text-[12px] font-medium leading-none"
          style={{ background: toneColor(r.tone, 0.12), color: toneColor(r.tone) }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: toneColor(r.tone) }} />
          {r.label}
        </span>
      </div>
      <div className="mt-4 flex items-end justify-between gap-4">
        <Ticker value={r.score} className="num-hero -ml-1 text-[112px]" duration={1100} />
        {week.length > 2 && (
          <div className="mb-1 flex items-end gap-[9px]" aria-label="Readiness over the last week">
            {week.map((d, i) => {
              const today = i === week.length - 1
              return (
                <div key={d.date} className="flex w-[6px] flex-col items-center gap-2" title={`${format(parseISO(d.date), 'EEEE')}: ${d.score}`}>
                  <span className="flex h-[66px] w-full items-end">
                    <span
                      className="w-full rounded-full"
                      style={{ height: `${Math.max(6, (d.score / 100) * 66)}px`, background: today ? toneColor(d.tone) : 'rgb(var(--fg) / 0.16)' }}
                    />
                  </span>
                  <span className={`font-mono text-[10px] leading-none ${today ? 'text-fg-2' : 'text-fg-4'}`}>{format(parseISO(d.date), 'EEEEE')}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <p className="mt-5 text-[17px] leading-[1.4] tracking-[-0.01em] text-fg-2">{r.verdict}</p>
      <div className="card list mt-6 overflow-hidden">
        {r.factors.map((f) => {
          const good = f.today > f.hi ? f.better === 'up' : f.today < f.lo ? f.better === 'down' : null
          return (
            <div key={f.key} className="grid grid-cols-[88px_1fr_72px] items-center gap-3 px-4 py-3">
              <span className="text-[14px] text-fg-2">{f.label}</span>
              <RangeBar min={f.min} max={f.max} lo={f.lo} hi={f.hi} today={f.today} good={good} />
              <span className="text-right text-[15px] font-medium tabular-nums tracking-[-0.01em]">
                {f.display}
                {(f.key === 'hrv' || f.key === 'rhr') && <span className="ml-1 text-[12px] font-normal text-fg-3">{f.unit}</span>}
              </span>
            </div>
          )
        })}
      </div>
      <p className="mt-2 px-1 text-[12px] text-fg-4">The grey band is your normal over the last 28 days.</p>
    </section>
  )
}

function Football({ w }: { w: World }) {
  const open = useUi((s) => s.open)
  const last = w.matches[0]
  const unrated = w.unrated[0]
  const next = w.nextFootball
  if (!last && !unrated && !next) return null
  const ago = unrated ? differenceInCalendarDays(w.now, parseISO(unrated.start)) : 0
  const what =
    ago === 0 ? 'today’s game' : ago === 1 ? 'yesterday’s game' : ago < 7 ? `${fmt(unrated?.start ?? '', 'EEEE')}’s game` : `the game from ${fmt(unrated?.start ?? '', 'd MMM')}`
  return (
    <Section
      title="Football"
      action={
        <Link to="/football" className="link">
          Season <ChevronRight size={15} strokeWidth={2} />
        </Link>
      }
    >
      {unrated && (
        <button onClick={() => open({ type: 'logMatch', activityId: unrated.id })} className="press card mb-2 flex w-full items-center gap-3 p-4 text-left">
          <SportDot sport="football" size={40} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium leading-5">Rate {what}</span>
            <span className="meta block truncate">
              {km(unrated.distanceM, 1)} km{unrated.football ? ` · ${unrated.football.sprints} sprints` : ''} · {dur(unrated.durationS)}
            </span>
          </span>
          <span className="btn-primary h-9 px-4 text-[14px]">Rate</span>
        </button>
      )}
      {(last || next) && (
        <div className="grid grid-cols-2 gap-2">
          {last && (
            <Link to={`/match/${last.id}`} className={`press card flex flex-col p-4 ${next ? '' : 'col-span-2'}`}>
              <span className="flex items-center justify-between gap-2">
                <span className="label">Last match</span>
                <RatingBadge rating={last.rating} size="sm" />
              </span>
              <span className="num-hero mt-5 text-[44px] leading-none">
                {last.scoreFor}–{last.scoreAgainst}
              </span>
              <span className="meta mt-2 truncate">
                {fmt(last.date, 'EEE d MMM')} · {last.opponent}
              </span>
            </Link>
          )}
          {next && (
            <div className={`card flex flex-col p-4 ${last ? '' : 'col-span-2'}`}>
              <span className="label">Next game</span>
              <span className="mt-5 text-[20px] font-semibold leading-[1.15] tracking-[-0.02em]">{cap(next.label)}</span>
              <span className="meta mt-auto pt-2">{format(next.at, 'EEE HH:mm')}, as usual</span>
            </div>
          )}
        </div>
      )}
    </Section>
  )
}

function Week({ w }: { w: World }) {
  const start = startOfWeek(w.now, { weekStartsOn: 1 })
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const byDay = (d: Date) => w.activities.filter((a) => isSameDay(parseISO(a.start), d))
  const weekActs = days.flatMap(byDay)
  const total = weekActs.reduce((a, x) => a + x.durationS, 0)
  return (
    <Section
      title="This week"
      action={weekActs.length > 0 && <span className="meta">{`${weekActs.length} ${weekActs.length === 1 ? 'session' : 'sessions'} · ${dur(total)}`}</span>}
    >
      <div className="card grid grid-cols-7 px-1.5 pb-3 pt-3.5">
        {days.map((d) => {
          const acts = byDay(d)
          const isToday = isSameDay(d, w.now)
          const future = differenceInCalendarDays(d, w.now) > 0
          const planned = future || isToday ? w.slots.filter((s) => s.dow === getDay(d) && !acts.some((a) => a.sport === s.sport)) : []
          return (
            <div key={d.toISOString()} className="flex flex-col items-center">
              <span className="text-[11px] font-medium text-fg-4">{format(d, 'EEEEE')}</span>
              <span
                className={`mt-1.5 grid h-8 w-8 place-items-center rounded-full text-[15px] font-medium tabular-nums ${isToday ? 'bg-fg text-ink-0' : future ? 'text-fg-4' : 'text-fg-2'}`}
              >
                {format(d, 'd')}
              </span>
              <div className="mt-2.5 flex min-h-[46px] flex-col items-center gap-2">
                {acts.slice(0, 3).map((a) => (
                  <span key={a.id} style={{ color: sportColor(a.sport) }}>
                    <SportIcon sport={a.sport} size={16} />
                  </span>
                ))}
                {planned.slice(0, 2).map((s, i) => (
                  <span
                    key={i}
                    className="grid h-[22px] w-[22px] place-items-center rounded-full border border-dashed border-fg-4 text-fg-4"
                    title={`Usually ${SPORT_LABEL[s.sport].toLowerCase()}`}
                  >
                    <SportIcon sport={s.sport} size={11} />
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

const SPORTS: Sport[] = ['run', 'football', 'ride', 'swim', 'strength', 'other']

function Load({ w }: { w: World }) {
  const ratio = w.acwr
  const l = acwrLabel(ratio)
  const toneVar = l.tone === 'good' ? '--z2' : l.tone === 'warn' ? '--z4' : l.tone === 'bad' ? '--z5' : '--z1'
  const last14 = w.load.days.slice(-14)
  const sports = SPORTS.filter((s) => last14.some((d) => d.bySport[s]))
  // the same smoothed numbers the ratio is built from, so the line under it adds up
  const acuteWeek = (w.load.acute[w.load.acute.length - 2] ?? 0) * 7
  const chronicWeek = (w.load.chronic[w.load.chronic.length - 2] ?? 0) * 7
  return (
    <Section title="Training load">
      <div className="card p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="label">Load ratio, 7 days on 28</div>
            <div className="mt-3 flex items-baseline gap-2.5">
              <Ticker value={ratio} dp={2} className="num-hero text-[44px] leading-none" />
              <span className="text-[13px] font-medium" style={{ color: `rgb(var(${toneVar}))` }}>
                {l.label}
              </span>
            </div>
            <div className="meta mt-2">
              {Math.round(acuteWeek)} this week, usually {Math.round(chronicWeek)}
            </div>
          </div>
          <div className="w-[104px] shrink-0 pt-1">
            <Sparkline values={w.load.ratio.slice(-42, -1)} band={[0.8, 1.3]} height={50} min={0.4} max={1.8} area={false} color="rgb(var(--fg-2))" />
            <div className="mt-1.5 text-right text-[11px] text-fg-4">6 weeks</div>
          </div>
        </div>
        <div className="mt-6">
          <StackedLoad days={last14} sports={sports} />
        </div>
        {sports.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {sports.map((s) => (
              <span key={s} className="flex items-center gap-1.5 text-[12px] text-fg-3">
                <span className="h-2 w-2 rounded-full" style={{ background: sportColor(s) }} />
                {SPORT_LABEL[s]}
              </span>
            ))}
          </div>
        )}
      </div>
    </Section>
  )
}

function StackedLoad({ days, sports }: { days: World['load']['days']; sports: Sport[] }) {
  const max = Math.max(...days.map((d) => d.load), 1)
  return (
    <div className="flex h-[96px] items-end">
      {days.map((d, i) => (
        <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end">
          <div className="flex w-[10px] flex-col-reverse gap-[2px]" style={{ height: `${(d.load / max) * 76}%` }}>
            {sports.map((s) =>
              d.bySport[s] ? (
                <span key={s} className="min-h-[3px] rounded-full" style={{ height: `${((d.bySport[s] ?? 0) / (d.load || 1)) * 100}%`, background: sportColor(s) }} />
              ) : null,
            )}
          </div>
          {!d.load && <span className="h-[3px] w-[10px] rounded-full bg-ink-3" />}
          <span className={`mt-2 text-center font-mono text-[10px] ${i === days.length - 1 ? 'text-fg-2' : 'text-fg-4'}`}>{format(parseISO(d.date), 'EEEEE')}</span>
        </div>
      ))}
    </div>
  )
}
