import { differenceInCalendarDays, parseISO } from 'date-fns'
import { Plus } from 'lucide-react'
import { useMemo } from 'react'
import { useMeasure } from '../../components/charts/primitives'
import { IconButton, Screen } from '../../components/ui/Screen'
import { StandoutLine } from '../../components/ui/Standout'
import { Empty, SampleBadge } from '../../components/ui/bits'
import { Ticker } from '../../components/ui/Ticker'
import type { BodyEntry, Daily } from '../../data/types'
import { useUi } from '../../data/ui'
import { useWorld } from '../../data/world'
import { fmt } from '../../lib/format'
import { mean, round } from '../../lib/math'
import type { Standout } from '../../lib/standout'

const DAY = 86_400_000
/** a stretch of sleep the way a clock shows it: 7:42 */
const hm = (s: number) => {
  const m = Math.round(s / 60)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

/** Weight and sleep: the weight trend, last night, and the last week against your usual. */
export function BodyScreen() {
  const w = useWorld()
  const open = useUi((s) => s.open)
  const last = w.dailies[w.dailies.length - 1]
  return (
    <Screen
      title="Body"
      kicker={<span className="flex items-center gap-2">Weight and sleep {w.mode === 'sample' && <SampleBadge />}</span>}
      actions={
        <IconButton label="Weigh in" onClick={() => open({ type: 'logBody' })} active>
          <Plus size={18} strokeWidth={2.2} />
        </IconButton>
      }
    >
      <Weight body={w.body} now={w.now} news={w.news.body} />
      {last?.sleepS && last.deepS !== undefined && <LastNight d={last} />}
      {w.news.recovery && <StandoutLine s={w.news.recovery} className="mt-2.5" />}
      <Week dailies={w.dailies} />
    </Screen>
  )
}

/** The 7-day average big on the mauve tint, the weigh-ins as dots under the trend, and the one thing worth a look. */
function Weight({ body, now, news }: { body: BodyEntry[]; now: Date; news?: Standout }) {
  const open = useUi((s) => s.open)
  const data = useMemo(() => {
    const ws = body.filter((b) => b.weightKg && differenceInCalendarDays(now, parseISO(b.date)) <= 84).sort((a, b) => a.date.localeCompare(b.date))
    // each point's average is the mean of every weigh-in in the 7 days up to it
    const points = ws.map((b) => ({ t: Date.parse(b.date), v: b.weightKg! }))
    const avg = points.map((p) => ({ t: p.t, v: round(mean(points.filter((q) => q.t <= p.t && q.t > p.t - 7 * DAY).map((q) => q.v)), 2) }))
    return { ws, points, avg }
  }, [body, now])
  if (!data.ws.length) {
    return (
      <Empty
        title="No weigh-ins yet"
        action={
          <button className="btn-primary mt-3 w-full" onClick={() => open({ type: 'logBody' })}>
            Weigh in
          </button>
        }
      >
        Weigh in a few mornings a week. The 7-day average smooths out water and salt.
      </Empty>
    )
  }
  const last = data.avg[data.avg.length - 1]
  const monthAgo = [...data.avg].reverse().find((p) => p.t <= last.t - 28 * DAY) ?? data.avg[0]
  const change = last.v - monthAgo.v
  const weeks = Math.max(1, Math.round((last.t - monthAgo.t) / (7 * DAY)))
  const latest = data.ws[data.ws.length - 1]
  const ago = differenceInCalendarDays(now, parseISO(latest.date))
  const when = ago === 0 ? 'this morning' : ago === 1 ? 'yesterday' : `on ${fmt(latest.date, ago < 7 ? 'EEEE' : 'd MMM')}`
  return (
    <section className="hero flex flex-col gap-2.5 bg-body-tint">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-bold text-body-label">Weight · 7-day average</h2>
        {data.avg.length > 1 && Math.abs(change) >= 0.05 && (
          <span className="pill [--p:var(--body-head)]">
            {change < 0 ? '↓' : '↑'} {Math.abs(change).toFixed(1)} kg in {weeks} {weeks === 1 ? 'week' : 'weeks'}
          </span>
        )}
      </div>
      <div className="num-hero text-[58px] text-body-head">
        <Ticker value={last.v} dp={1} duration={1000} className="tabular-nums" />
        <span className="ml-1 font-sans text-[18px] font-semibold tracking-normal text-body-label">kg</span>
      </div>
      <WeightChart points={data.points.filter((p) => p.t >= last.t - 56 * DAY)} />
      {news ? (
        <span className="text-[13px] font-semibold text-body-head">
          {news.value} {when}, the {news.short.charAt(0).toLowerCase() + news.short.slice(1)}
        </span>
      ) : (
        <span className="text-[13px] font-semibold text-body-label">
          {latest.weightKg!.toFixed(1)} kg {when}
        </span>
      )}
    </section>
  )
}

/** The weigh-ins as faint dots under a smooth trend (each day's weigh-ins weighted by how near they are, about a week either side), and the latest ringed. No axes. */
function WeightChart({ points }: { points: { t: number; v: number }[] }) {
  const [ref, w] = useMeasure<HTMLDivElement>()
  const height = 70
  const geo = useMemo(() => {
    if (!w || points.length < 2) return null
    const ts = points.map((p) => p.t)
    const vs = points.map((p) => p.v)
    const t0 = Math.min(...ts)
    const t1 = Math.max(...ts)
    let lo = Math.min(...vs)
    let hi = Math.max(...vs)
    if (hi - lo < 1) [lo, hi] = [(lo + hi) / 2 - 0.5, (lo + hi) / 2 + 0.5]
    const pad = 7
    const X = (t: number) => pad + ((t - t0) / (t1 - t0 || 1)) * (w - pad * 2)
    const Y = (v: number) => pad + ((hi - v) / (hi - lo)) * (height - pad * 2)
    const trend = Array.from({ length: 40 }, (_, i) => {
      const t = t0 + ((t1 - t0) * i) / 39
      let sw = 0
      let sv = 0
      for (const p of points) {
        const k = Math.exp(-0.5 * ((p.t - t) / (5 * DAY)) ** 2)
        sw += k
        sv += k * p.v
      }
      return { t, v: sv / sw }
    })
    const line = trend.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join('')
    return { X, Y, line }
  }, [points, w])
  const latest = points[points.length - 1]
  return (
    <div ref={ref} className="w-full" style={{ height }}>
      {geo && (
        <svg width={w} height={height} className="block overflow-visible" role="img" aria-label="Your weigh-ins over eight weeks, with the 7-day average">
          {points.slice(0, -1).map((p) => (
            <circle key={p.t} cx={geo.X(p.t)} cy={geo.Y(p.v)} r={2} fill="rgb(var(--body))" fillOpacity={0.4} />
          ))}
          <path d={geo.line} fill="none" stroke="rgb(var(--body))" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={geo.X(latest.t)} cy={geo.Y(latest.v)} r={5} fill="rgb(var(--body-tint))" stroke="rgb(var(--body-head))" strokeWidth={2} />
        </svg>
      )}
    </div>
  )
}

/** Last night: how long you slept, the score, and the stages as one bar with each time under it. */
function LastNight({ d }: { d: Daily }) {
  const parts = [
    { key: 'Deep', s: d.deepS ?? 0, color: 'rgb(var(--sleep-deep))' },
    { key: 'REM', s: d.remS ?? 0, color: 'rgb(var(--strength))' },
    { key: 'Light', s: d.lightS ?? 0, color: 'rgb(var(--sleep-light))' },
    { key: 'Awake', s: d.awakeS ?? 0, color: 'rgb(var(--bad))' },
  ]
  return (
    <section className="tile mt-2.5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="t-section">Last night</h2>
        {d.sleepScore ? <span className="rounded-full bg-run/[0.14] px-2.5 py-1 text-[12.5px] font-bold leading-4 text-run-head">Sleep score {d.sleepScore}</span> : null}
      </div>
      <div className="num text-[40px] tracking-[-0.03em]">
        {hm(d.sleepS ?? 0)}
        <span className="unit text-[14px]">asleep</span>
      </div>
      <div className="flex h-3 gap-[3px]">
        {parts.map((p) => (p.s > 0 ? <span key={p.key} className="min-w-2 rounded-md" style={{ flex: p.s, background: p.color }} /> : null))}
      </div>
      <div className="grid grid-cols-4">
        {parts.map((p) => (
          <div key={p.key} className="flex flex-col gap-[3px]">
            <span className="label flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
              {p.key}
            </span>
            <span className="text-[14px] font-bold">{hm(p.s)}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

interface MetricDef {
  key: string
  label: string
  /** which way is better; steps are neither */
  better?: 'up' | 'down'
  pick: (d: Daily) => number | undefined
  show: (v: number) => string
  /** the change, said the way it reads best */
  delta: (week: number, before: number) => { value: number; text: string }
}

const sign = (x: number) => (x > 0 ? '+' : x < 0 ? '−' : '')

const METRICS: MetricDef[] = [
  {
    key: 'hrv',
    label: 'HRV',
    better: 'up',
    pick: (d) => d.hrv,
    show: (v) => String(Math.round(v)),
    delta: (a, b) => ((x) => ({ value: x, text: `${sign(x)}${Math.abs(x)} ms` }))(Math.round(a - b)),
  },
  {
    key: 'rhr',
    label: 'Resting HR',
    better: 'down',
    pick: (d) => d.rhr,
    show: (v) => String(Math.round(v)),
    delta: (a, b) => ((x) => ({ value: x, text: `${sign(x)}${Math.abs(x)} bpm` }))(Math.round(a - b)),
  },
  {
    key: 'sleep',
    label: 'Sleep',
    better: 'up',
    pick: (d) => d.sleepS,
    show: hm,
    delta: (a, b) => ((x) => ({ value: x, text: `${sign(x)}${Math.abs(x)} min` }))(Math.round((a - b) / 60)),
  },
  {
    key: 'steps',
    label: 'Steps',
    pick: (d) => d.steps,
    show: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v))),
    delta: (a, b) => ((x) => ({ value: x, text: `${sign(x)}${Math.abs(x)}%` }))(b ? Math.round(((a - b) / b) * 100) : 0),
  },
]

/** The last 7 days against your own 3 weeks before, never a population norm: a small tile each. */
function Week({ dailies }: { dailies: Daily[] }) {
  const recent = dailies.slice(-28)
  if (recent.length < 8) return null
  const tiles = METRICS.map((m) => {
    const vals = recent.map(m.pick).filter((v): v is number => v !== undefined)
    if (vals.length < 8) return null
    const week = mean(vals.slice(-7))
    const d = m.delta(week, mean(vals.slice(0, -7)))
    const better = !m.better || !d.value ? undefined : d.value > 0 === (m.better === 'up')
    return { m, week, d, better }
  }).filter((x): x is NonNullable<typeof x> => !!x)
  if (!tiles.length) return null
  return (
    <section className="mt-3.5">
      <h2 className="t-section mb-2.5 px-0.5">Last 7 days, against your usual</h2>
      <div className="grid grid-cols-4 gap-2">
        {tiles.map(({ m, week, d, better }) => (
          <div key={m.key} className="flex min-w-0 flex-col gap-[3px] rounded-[18px] bg-ink-1 px-2.5 py-3">
            <span className="truncate text-[11.5px] font-semibold text-fg-3">{m.label}</span>
            <span className="num text-[21px] leading-[1.2]">{m.show(week)}</span>
            <span className={`truncate text-[12px] font-bold ${better === undefined ? 'text-fg-3' : better ? 'text-good' : 'text-bad'}`}>{d.value ? d.text : 'Steady'}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
