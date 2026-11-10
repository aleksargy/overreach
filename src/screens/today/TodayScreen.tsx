import { addDays, differenceInCalendarDays, format, getDay, isSameDay, parseISO, startOfWeek } from 'date-fns'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ActivityList, RatingBadge } from '../../components/ActivityRow'
import { RangeBar } from '../../components/charts/primitives'
import { SportDot, SportIcon, SPORT_LABEL, sportColor } from '../../components/icons/SportIcon'
import { IconButton, Screen } from '../../components/ui/Screen'
import { StandoutLine } from '../../components/ui/Standout'
import { SampleBadge, Section } from '../../components/ui/bits'
import { Underline } from '../../components/ui/chalk'
import { Swipeable } from '../../components/ui/Swipe'
import type { Sport } from '../../data/types'
import { useSkipRating, useUi } from '../../data/ui'
import { useWorld, type World } from '../../data/world'
import { dur, fmt, km } from '../../lib/format'
import { readiness, type Readiness, type Tone } from '../../lib/readiness'

const TONE_VAR: Record<Tone, string> = { good: '--z2', ok: '--z3', warn: '--z4', bad: '--z5' }
const toneColor = (t: Tone) => `rgb(var(${TONE_VAR[t]}))`
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
            className="display press grid h-9 w-9 place-items-center rounded-full text-[17px] font-bold text-fg-2 ring-1 ring-inset ring-fg/25"
          >
            {w.profile.name.trim().charAt(0).toUpperCase() || '·'}
          </button>
        </>
      }
    >
      {w.readiness ? <ReadinessHero r={w.readiness} w={w} /> : <p className="text-[15px] text-fg-3">Readiness shows up after a week of watch data.</p>}
      {w.news.today && <StandoutLine s={w.news.today} className="mt-9" />}
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

/** Readiness for each of the last seven mornings, judged the same way as today's: past days as of 8 am. */
function useReadinessWeek(w: World) {
  return useMemo(() => {
    const out: { date: string; score: number; tone: Tone }[] = []
    for (let k = 6; k >= 0; k--) {
      const days = w.dailies.slice(0, w.dailies.length - k)
      const day = days[days.length - 1]?.date
      const at = k === 0 || !day ? w.now : new Date(`${day}T08:00:00`)
      const r = readiness(days, w.activities, w.load.ratio[w.load.ratio.length - 2 - k] ?? 1, at)
      if (r) out.push({ date: r.date, score: r.score, tone: r.tone })
    }
    return out
  }, [w])
}

/**
 * The call for today, chalked up as a word, underlined in its colour, with the
 * week behind it. A sentence only appears when a session is holding the day
 * back, and it names the session. The numbers it's judged on are a tap away,
 * not recited every morning.
 */
function ReadinessHero({ r, w }: { r: Readiness; w: World }) {
  const week = useReadinessWeek(w)
  const [why, setWhy] = useState(false)
  return (
    <section>
      <button onClick={() => setWhy((x) => !x)} aria-expanded={why} className="label -my-2 flex items-center gap-2 py-2">
        Readiness <span className="num text-[17px] text-fg-2">{r.score}</span>
        <ChevronDown size={14} strokeWidth={2} className={`transition-transform duration-200 ${why ? 'rotate-180' : ''}`} />
      </button>
      <h2 className="display mt-3 text-[62px] font-extrabold leading-[0.9]">
        <span className="relative inline-block pb-2">
          {r.label}
          <Underline color={toneColor(r.tone)} seed={r.score} className="bottom-[-3px]" />
        </span>
      </h2>
      {r.verdict && <p className="mt-5 text-[17px] leading-snug text-fg-2">{r.verdict}</p>}
      <AnimatePresence initial={false}>
        {why && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="list mt-5">
              {r.factors.map((f) => {
                const good = f.today > f.hi ? f.better === 'up' : f.today < f.lo ? f.better === 'down' : null
                return (
                  <div key={f.key} className="grid grid-cols-[96px_1fr_64px] items-center gap-3 py-2.5">
                    <span className="text-[14.5px] text-fg-2">{f.label}</span>
                    <RangeBar min={f.min} max={f.max} lo={f.lo} hi={f.hi} today={f.today} good={good} />
                    <span className="num text-right text-[21px]">{f.display}</span>
                  </div>
                )
              })}
            </div>
            <p className="meta mt-2 text-fg-4">The shaded band on each line is your normal.</p>
          </motion.div>
        )}
      </AnimatePresence>
      {week.length > 2 && (
        <div className="mt-7 grid grid-cols-7 gap-2" aria-label="Readiness over the last week">
          {week.map((d, i) => {
            const today = i === week.length - 1
            return (
              <div key={d.date} className="flex flex-col items-center gap-1.5" title={`${format(parseISO(d.date), 'EEEE')}: ${d.score}`}>
                <span className="flex h-[52px] w-full items-end">
                  <span
                    className={today ? 'solid w-full' : 'hatch w-full'}
                    style={{ height: `${Math.max(8, (d.score / 100) * 52)}px`, ['--h' as string]: today ? `var(${TONE_VAR[d.tone]})` : undefined }}
                  />
                </span>
                <span className={`font-mono text-[10.5px] leading-none ${today ? 'text-fg-2' : 'text-fg-4'}`}>{format(parseISO(d.date), 'EEEEE')}</span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function Football({ w }: { w: World }) {
  const open = useUi((s) => s.open)
  const skip = useSkipRating()
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
      <AnimatePresence initial={false}>
        {unrated && (
          <Swipeable key={unrated.id} hint="Skip" onSwipe={() => skip(unrated.id)} surface="card" className="mb-2 rounded-card">
            <button onClick={() => open({ type: 'logMatch', activityId: unrated.id })} className="press flex w-full items-center gap-3 p-4 text-left">
              <SportDot sport="football" size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-semibold leading-5">Rate {what}</span>
                <span className="meta block truncate">
                  {km(unrated.distanceM, 1)} km{unrated.football ? ` · ${unrated.football.sprints} sprints` : ''} · {dur(unrated.durationS)}
                </span>
              </span>
              <span className="btn-primary h-9 px-4 text-[17px]">Rate</span>
            </button>
          </Swipeable>
        )}
      </AnimatePresence>
      {(last || next) && (
        <div className="grid grid-cols-2 gap-2">
          {last && (
            <Link to={`/match/${last.id}`} className={`press card flex flex-col p-4 ${next ? '' : 'col-span-2'}`}>
              <span className="flex items-center justify-between gap-2">
                <span className="label">Last match</span>
                <RatingBadge rating={last.rating} size="sm" />
              </span>
              <span className="num-hero mt-4 text-[56px] leading-none">
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
              <span className="display mt-4 text-[27px] font-bold leading-[1.02]">{cap(next.label)}</span>
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
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const acts = byDay(d)
          const isToday = isSameDay(d, w.now)
          const future = differenceInCalendarDays(d, w.now) > 0
          const planned = future || isToday ? w.slots.filter((s) => s.dow === getDay(d) && !acts.some((a) => a.sport === s.sport)) : []
          return (
            <div key={d.toISOString()} className="flex flex-col items-center">
              <span className="text-[11.5px] font-medium text-fg-4">{format(d, 'EEEEE')}</span>
              <span className={`num mt-1.5 grid h-8 w-8 place-items-center rounded-full text-[21px] ${isToday ? 'bg-fg text-ink-0' : future ? 'text-fg-4' : 'text-fg-2'}`}>
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
  const last14 = w.load.days.slice(-14)
  const sports = SPORTS.filter((s) => last14.some((d) => d.bySport[s]))
  // the smoothed numbers readiness is judged on, so the line adds up with it
  const acuteWeek = (w.load.acute[w.load.acute.length - 2] ?? 0) * 7
  const chronicWeek = (w.load.chronic[w.load.chronic.length - 2] ?? 0) * 7
  if (!last14.some((d) => d.load)) return null
  return (
    <Section title="Load" action={<span className="meta">{`${Math.round(acuteWeek)} this week · usually ${Math.round(chronicWeek)}`}</span>}>
      <StackedLoad days={last14} sports={sports} />
      {sports.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {sports.map((s) => (
            <span key={s} className="flex items-center gap-1.5 text-[12.5px] text-fg-3">
              <span className="h-2 w-2" style={{ background: sportColor(s) }} />
              {SPORT_LABEL[s]}
            </span>
          ))}
        </div>
      )}
    </Section>
  )
}

function StackedLoad({ days, sports }: { days: World['load']['days']; sports: Sport[] }) {
  const max = Math.max(...days.map((d) => d.load), 1)
  return (
    <div className="flex h-[104px] items-end">
      {days.map((d, i) => (
        <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end">
          <div className="flex w-[14px] flex-col-reverse gap-[2px]" style={{ height: `${(d.load / max) * 78}%` }}>
            {sports.map((s) =>
              d.bySport[s] ? (
                <span key={s} className="hatch min-h-[4px]" style={{ height: `${((d.bySport[s] ?? 0) / (d.load || 1)) * 100}%`, ['--h' as string]: `var(--${s})` }} />
              ) : null,
            )}
          </div>
          {!d.load && <span className="h-px w-[14px] bg-fg/25" />}
          <span className={`mt-2 text-center font-mono text-[10.5px] ${i === days.length - 1 ? 'text-fg-2' : 'text-fg-4'}`}>{format(parseISO(d.date), 'EEEEE')}</span>
        </div>
      ))}
    </div>
  )
}
