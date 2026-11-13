import { addDays, addWeeks, differenceInCalendarDays, format, getDay, isSameDay, parseISO, startOfISOWeek } from 'date-fns'
import { ChevronRight, Plus } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { Ball, SportIcon, sportColor } from '../../components/icons/SportIcon'
import { IconButton, Screen } from '../../components/ui/Screen'
import { SampleBadge } from '../../components/ui/bits'
import type { Activity, Sport } from '../../data/types'
import { useUi } from '../../data/ui'
import { useWorld, type World } from '../../data/world'
import { dayLabel, isoDay, km, kmh, pace, swimPace } from '../../lib/format'
import { ratingTone, result, usualFormatAt } from '../../lib/football'
import { mean } from '../../lib/math'
import { BEST_NAME } from '../../lib/running'
import type { Standout } from '../../lib/standout'
import { RateTile, formatOfGame } from '../football/RateTile'

/** Today: the week so far, the next game and the one reading worth a look, a game to rate, and the latest session. */
export function TodayScreen() {
  const w = useWorld()
  const nav = useNavigate()
  const open = useUi((s) => s.open)
  const h = w.now.getHours()
  const greeting = h < 5 ? 'Late one' : h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening'
  const name = w.profile.name.trim()
  return (
    <Screen
      title={name ? `${greeting}, ${name}` : greeting}
      kicker={
        <span className="flex items-center gap-2">
          {format(w.now, 'EEEE d MMM')}
          {w.mode === 'sample' && <SampleBadge />}
        </span>
      }
      actions={
        <>
          <IconButton label="Log something" onClick={() => open({ type: 'log' })} active>
            <Plus size={18} strokeWidth={2.2} />
          </IconButton>
          <button aria-label="Settings" title="Settings" onClick={() => nav('/settings')} className="round text-[14px] font-bold">
            {name.charAt(0).toUpperCase() || '·'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-2.5">
        <Week w={w} />
        <Glance w={w} />
        <ToRate w={w} />
        <Latest w={w} />
      </div>
    </Screen>
  )
}

interface Day {
  date: Date
  today: boolean
  /** the day's biggest session, and another sport done that day too */
  main?: Activity
  also?: Sport
  /** a game usually played that day, not played yet: its format ("11s"), or "" when that's not known */
  planned?: string
}

/** This week so far: how many sessions, how far you've run, and the load against a usual week (the eleven whole weeks before it). */
function useWeek(w: World) {
  return useMemo(() => {
    const start = startOfISOWeek(w.now)
    const end = addDays(start, 7)
    const acts = w.activities.filter((a) => {
      const t = parseISO(a.start)
      return t >= start && t < end
    })
    const days: Day[] = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i)
      const today = isSameDay(date, w.now)
      const list = acts.filter((a) => isSameDay(parseISO(a.start), date)).sort((a, b) => b.load - a.load)
      const main = list[0]
      const also = list.find((a) => a.sport !== main?.sport)?.sport
      const ahead = differenceInCalendarDays(date, w.now) > 0 || (today && !list.some((a) => a.sport === 'football'))
      const slot = ahead ? w.slots.find((s) => s.sport === 'football' && s.dow === getDay(date)) : undefined
      let planned: string | undefined
      if (slot) {
        const f = usualFormatAt(new Date(date.getFullYear(), date.getMonth(), date.getDate(), slot.hour, slot.minute), w.matches) ?? (Number(slot.kind) || undefined)
        planned = f ? `${f}s` : ''
      }
      return { date, today, main, also, planned }
    })
    const n = acts.length
    const runKm = acts.filter((a) => a.sport === 'run').reduce((s, a) => s + (a.distanceM ?? 0), 0) / 1000
    const loadOn = new Map(w.load.days.map((d) => [d.date, d.load]))
    const weekLoad = (from: Date) => Array.from({ length: 7 }, (_, i) => loadOn.get(isoDay(addDays(from, i))) ?? 0).reduce((a, b) => a + b, 0)
    // only whole weeks since your first session count towards the usual one
    const first = w.activities.length ? parseISO(w.activities[w.activities.length - 1].start) : w.now
    const past = Array.from({ length: 11 }, (_, k) => addWeeks(start, -(k + 1)))
      .filter((from) => from >= startOfISOWeek(first))
      .map(weekLoad)
    return { days, n, runKm, load: weekLoad(start), usual: past.length ? mean(past) : undefined }
  }, [w])
}

/** What a session's circle says: R for a run, L for lifting, the format for a game. */
function shortName(a: Activity, w: World): string {
  switch (a.sport) {
    case 'run':
      return 'R'
    case 'strength':
      return 'L'
    case 'football': {
      const f = formatOfGame(a, w)
      return f ? `${f}s` : ''
    }
    case 'ride':
      return 'B'
    case 'swim':
      return 'S'
    default:
      return a.name.trim().charAt(0).toUpperCase() || '·'
  }
}

function Week({ w }: { w: World }) {
  const wk = useWeek(w)
  return (
    <section className="hero flex flex-col gap-3.5 bg-football-tint">
      <div className="flex items-center justify-between gap-3 text-football-label">
        <h2 className="text-[13px] font-bold">This week</h2>
        {wk.load > 0 && (
          <span className="text-[12.5px] font-bold">
            Load {Math.round(wk.load)}
            {wk.usual ? ` · usually ${Math.round(wk.usual)}` : ''}
          </span>
        )}
      </div>
      <p className="display text-[44px] font-extrabold leading-[0.95] tracking-[-0.035em] text-football-head [font-stretch:85%]">
        {wk.n === 0 ? (
          'Nothing yet'
        ) : (
          <>
            <span className="block">{`${wk.n} ${wk.n === 1 ? 'session' : 'sessions'}${wk.runKm > 0 ? ',' : ''}`}</span>
            {wk.runKm > 0 && <span className="block">{wk.runKm.toFixed(1)} km run</span>}
          </>
        )}
      </p>
      <div className="flex justify-between">
        {wk.days.map((d) => (
          <DayDot key={d.date.toISOString()} d={d} label={d.main ? shortName(d.main, w) : ''} w={w} />
        ))}
      </div>
    </section>
  )
}

/**
 * A day of the week: a session is a circle filled in its sport's colour, today
 * is ringed, a game you usually play is dashed, and an empty day is faint.
 */
function DayDot({ d, label, w }: { d: Day; label: string; w: World }) {
  const dot = 'grid h-[34px] w-[34px] place-items-center rounded-full text-[11px] font-extrabold'
  let circle
  if (d.main)
    circle = (
      <Link
        to={linkTo(d.main, w)}
        aria-label={`${format(d.date, 'EEEE')}: ${d.main.name}`}
        className={`press relative text-ink-0 ${dot}`}
        style={{ background: sportColor(d.main.sport), boxShadow: d.today ? '0 0 0 2px rgb(var(--football-tint)), 0 0 0 4px rgb(var(--football-head))' : undefined }}
      >
        {label || <SportIcon sport={d.main.sport} size={15} strokeWidth={2.2} />}
        {d.also && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-football-tint" style={{ background: sportColor(d.also) }} />}
      </Link>
    )
  else if (d.planned !== undefined)
    circle = (
      <span title="A game you usually play" className={`border-2 border-dashed ${dot} ${d.today ? 'border-football-head text-football-head' : 'border-football text-football'}`}>
        {d.planned || <Ball size={14} strokeWidth={1.8} />}
      </span>
    )
  else circle = <span className={`${dot} ${d.today ? 'border-2 border-football-head' : 'bg-football/10'}`} />
  return (
    <div className="flex flex-col items-center gap-1.5">
      {circle}
      <span className={`text-[12.5px] font-semibold ${d.today ? 'text-football-head' : 'text-football-label'}`}>{format(d.date, 'EEEEE')}</span>
    </div>
  )
}

/** Two tiles side by side: the next game, and the reading worth a look (or, on an ordinary day, your weight). */
function Glance({ w }: { w: World }) {
  const game = <GameTile w={w} />
  const reading = <ReadingTile w={w} />
  const hasGame = !!(w.nextFootball || w.matches[0])
  const hasReading = !!readingFor(w)
  if (!hasGame && !hasReading) return null
  return (
    <div className="grid grid-cols-2 gap-2.5 [&>*:only-child]:col-span-2">
      {hasGame && game}
      {hasReading && reading}
    </div>
  )
}

function GameTile({ w }: { w: World }) {
  const next = w.nextFootball
  if (!next) {
    const last = w.matches[0]
    if (!last) return null
    return (
      <Link to={`/match/${last.id}`} className="press tile flex min-h-[150px] flex-col gap-2">
        <span className="label">Last game</span>
        <span className="display text-[24px] font-bold leading-[1.05]">
          {result(last)} {last.scoreFor}–{last.scoreAgainst}
        </span>
        <span className="truncate text-[13px] text-fg-2">v {last.opponent}</span>
        <span className={`mt-auto text-[13px] font-bold ${ratingTone(last.rating).text}`}>{last.rating.toFixed(1)}</span>
      </Link>
    )
  }
  // the last game in the same format, since 7s and 11s aren't compared like for like
  const last = next.format ? w.matches.find((m) => m.format === next.format) : w.matches[0]
  const days = differenceInCalendarDays(next.at, w.now)
  const day = days === 0 ? (next.at.getHours() >= 17 ? 'Tonight' : 'Today') : days === 1 ? 'Tomorrow' : format(next.at, 'EEEE')
  return (
    <Link to="/football" className="press tile flex min-h-[150px] flex-col gap-2 bg-run-tint">
      <span className="label text-run-label">Next game</span>
      <span className="display text-[24px] font-bold leading-[1.05]">
        <span className="block">{day}</span>
        <span className="block">{format(next.at, 'HH:mm')}</span>
      </span>
      {next.format && <span className="text-[13px] text-run-head/80">{next.format}-a-side</span>}
      {last && (
        <span className="mt-auto text-[13px] font-semibold">
          Last: {result(last)} {last.scoreFor}–{last.scoreAgainst} · <span className={ratingTone(last.rating).text}>{last.rating.toFixed(1)}</span>
        </span>
      )}
    </Link>
  )
}

const READING: Record<string, string> = {
  weight: 'Weight',
  hrv: 'HRV',
  rhr: 'Resting heart rate',
  sleep: 'Sleep',
  long: 'Run',
  week: 'Running',
  rating: 'Match rating',
  sprints: 'Sprints',
  top: 'Top speed',
  ground: 'Ground covered',
}

/** What a reading worth a look is called, and the tab it belongs to. */
function readingOf(s: Standout, w: World): { label: string; to: string } {
  if (s.key.startsWith('best-')) return { label: BEST_NAME[Number(s.key.slice(5))] ?? 'Run', to: '/run' }
  if (s.key.startsWith('lift-')) return { label: w.exerciseById.get(s.key.slice(5))?.name ?? 'Lift', to: '/lift' }
  const to = ['weight', 'hrv', 'rhr', 'sleep'].includes(s.key) ? '/body' : ['long', 'week'].includes(s.key) ? '/run' : '/football'
  return { label: READING[s.key] ?? 'Worth a look', to }
}

/** The reading worth a look, said beside its label; on an ordinary day, your latest weigh-in and when it was. */
function readingFor(w: World): { label: string; to: string; value: string; line: string; lineCls: string } | null {
  const s = w.news.today
  if (s) return { ...readingOf(s, w), value: s.value, line: s.short, lineCls: s.tone === 'bad' ? 'text-bad' : 'text-football' }
  const weighIn = w.body.find((b) => b.weightKg)
  if (weighIn) return { label: 'Weight', to: '/body', value: `${weighIn.weightKg!.toFixed(1)} kg`, line: dayLabel(weighIn.date, w.now), lineCls: 'text-fg-3' }
  return null
}

function ReadingTile({ w }: { w: World }) {
  const r = readingFor(w)
  if (!r) return null
  const { label, to, value, line, lineCls } = r
  const at = value.indexOf(' ')
  const [num, unit] = at < 0 ? [value, ''] : [value.slice(0, at), value.slice(at + 1)]
  return (
    <Link to={to} className="press tile flex min-h-[150px] flex-col gap-2">
      <span className="label truncate">{label}</span>
      <span className={`num whitespace-nowrap tracking-[-0.03em] ${num.length > 5 ? 'text-[30px]' : 'text-[40px]'}`}>
        {num}
        {unit && <span className="unit text-[14px]">{unit}</span>}
      </span>
      {line && <span className={`mt-auto text-balance text-[13px] font-semibold ${lineCls}`}>{line}</span>}
    </Link>
  )
}

/** A game from the last two weeks still to rate, as on Football. */
function ToRate({ w }: { w: World }) {
  const a = w.unrated[0]
  return <AnimatePresence initial={false}>{a && <RateTile key={a.id} a={a} w={w} />}</AnimatePresence>
}

/** Where a session opens: a game's report, a workout's page, or the activity. */
function linkTo(a: Activity, w: World): string {
  const match = w.matchByActivity.get(a.id)
  if (a.sport === 'football' && match) return `/match/${match.id}`
  if (a.sport === 'strength' && a.workoutId) return `/lift/history/${a.workoutId}`
  return `/activity/${a.id}`
}

/** A session's three numbers, the ones that matter for its sport. */
function numbersOf(a: Activity): { v: string; u: string }[] {
  const hr = a.avgHr && a.source !== 'manual' ? [{ v: String(a.avgHr), u: 'bpm' }] : []
  const mins = { v: String(Math.round(a.durationS / 60)), u: 'min' }
  switch (a.sport) {
    case 'run':
      return [{ v: km(a.distanceM, 1), u: 'km' }, { v: pace(a.avgSpeed), u: '/km' }, ...hr]
    case 'ride':
      return [{ v: km(a.distanceM, 1), u: 'km' }, { v: kmh(a.avgSpeed).toFixed(1), u: 'km/h' }, ...hr]
    case 'swim':
      return [{ v: String(a.distanceM ?? 0), u: 'm' }, { v: swimPace(a.avgSpeed), u: '/100m' }, ...hr]
    case 'football':
      return [{ v: km(a.distanceM, 1), u: 'km' }, mins, ...hr]
    case 'strength':
      if (!a.lift) return [mins, ...hr]
      return [
        { v: String(a.lift.sets), u: 'sets' },
        a.lift.volumeKg >= 1000 ? { v: (a.lift.volumeKg / 1000).toFixed(1), u: 't' } : { v: String(Math.round(a.lift.volumeKg)), u: 'kg' },
        mins,
      ]
    default:
      return [mins, ...hr]
  }
}

const THUMB_TINT: Partial<Record<Sport, string>> = { run: 'bg-run-tint', football: 'bg-football-tint', strength: 'bg-strength-tint' }

/** The last session: its route drawn small (or its sport), and its three numbers. */
function Latest({ w }: { w: World }) {
  const a = w.activities[0]
  if (!a) return null
  return (
    <>
      <Link to={linkTo(a, w)} className="press tile flex items-center gap-3.5">
        <span className={`grid h-16 w-16 shrink-0 place-items-center rounded-2xl ${THUMB_TINT[a.sport] ?? 'bg-ink-2'}`} style={{ color: sportColor(a.sport) }}>
          {a.run?.route && a.run.route.length >= 6 ? <RouteThumb xy={a.run.route} /> : <SportIcon sport={a.sport} size={26} strokeWidth={1.8} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[15px] font-bold">{a.name}</span>
            <span className="label shrink-0">{dayLabel(a.start, w.now)}</span>
          </span>
          <span className="mt-1.5 flex gap-4">
            {numbersOf(a)
              .slice(0, 3)
              .map((n) => (
                <span key={n.u} className="num whitespace-nowrap text-[20px]">
                  {n.v}
                  <span className="unit ml-0.5 text-[12px]">{n.u}</span>
                </span>
              ))}
          </span>
        </span>
      </Link>
      <Link to="/feed" className="link self-center px-2 py-1">
        All activity <ChevronRight size={14} strokeWidth={2.2} />
      </Link>
    </>
  )
}

/** A run's outline in a 64 px square, north up, with a dot where it started. */
function RouteThumb({ xy }: { xy: number[] }) {
  const pts: [number, number][] = []
  for (let i = 0; i + 1 < xy.length; i += 2) pts.push([xy[i], -xy[i + 1]])
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const box = 40
  const k = box / Math.max(x1 - x0, y1 - y0, 1)
  const ox = 32 - ((x1 - x0) * k) / 2
  const oy = 32 - ((y1 - y0) * k) / 2
  const P = ([x, y]: [number, number]) => [ox + (x - x0) * k, oy + (y - y0) * k] as const
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${P(p)[0].toFixed(1)},${P(p)[1].toFixed(1)}`).join('')
  const [sx, sy] = P(pts[0])
  return (
    <svg width={64} height={64} viewBox="0 0 64 64" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={sx} cy={sy} r={3} fill="rgb(var(--fg))" />
    </svg>
  )
}
