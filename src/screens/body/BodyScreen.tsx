import { differenceInCalendarDays, parseISO } from 'date-fns'
import { Plus } from 'lucide-react'
import { useMemo } from 'react'
import { TrendChart } from '../../components/charts/charts'
import { Sparkline } from '../../components/charts/primitives'
import { IconButton, Screen } from '../../components/ui/Screen'
import { Delta, Empty, SampleBadge, Section } from '../../components/ui/bits'
import { Ticker } from '../../components/ui/Ticker'
import type { BodyEntry, Daily } from '../../data/types'
import { useUi } from '../../data/ui'
import { useWorld } from '../../data/world'
import { fmt, thousands } from '../../lib/format'
import { mean, quantile, round } from '../../lib/math'

const hm = (s: number) => `${Math.floor(s / 3600)}h${String(Math.round((s % 3600) / 60)).padStart(2, '0')}`

export function BodyScreen() {
  const w = useWorld()
  const open = useUi((s) => s.open)
  return (
    <Screen
      title="Body"
      kicker={<span className="flex items-center gap-2">Weight, recovery, measurements {w.mode === 'sample' && <SampleBadge />}</span>}
      actions={
        <IconButton label="Weigh in" onClick={() => open({ type: 'logBody' })}>
          <Plus size={18} />
        </IconButton>
      }
    >
      <WeightCard body={w.body} now={w.now} />
      <Recovery dailies={w.dailies} />
      <Measurements body={w.body} />
    </Screen>
  )
}

function WeightCard({ body, now }: { body: BodyEntry[]; now: Date }) {
  const open = useUi((s) => s.open)
  const data = useMemo(() => {
    const ws = body.filter((b) => b.weightKg && differenceInCalendarDays(now, parseISO(b.date)) <= 84).sort((a, b) => a.date.localeCompare(b.date))
    // each point's average is the mean of every weigh-in in the 7 days up to it
    const points = ws.map((b) => ({ t: Date.parse(b.date), v: b.weightKg! }))
    const avg = points.map((p) => ({ t: p.t, v: round(mean(points.filter((q) => q.t <= p.t && q.t > p.t - 7 * 86_400_000).map((q) => q.v)), 2) }))
    return { ws, points, avg }
  }, [body, now])
  if (!data.ws.length) {
    return (
      <Empty
        title="No weigh-ins yet"
        action={
          <button className="btn-primary mt-2" onClick={() => open({ type: 'logBody' })}>
            Weigh in
          </button>
        }
      >
        Weigh in a few mornings a week. The 7-day average smooths out water and salt.
      </Empty>
    )
  }
  const last = data.avg[data.avg.length - 1]
  const monthAgo = [...data.avg].reverse().find((p) => p.t <= last.t - 28 * 86_400_000) ?? data.avg[0]
  const change = last.v - monthAgo.v
  const weeks = Math.max(1, (last.t - monthAgo.t) / (7 * 86_400_000))
  const latest = data.ws[data.ws.length - 1]
  return (
    <section className="chamfer relative overflow-hidden rounded-card border border-line bg-ink-1">
      <div className="spectrum absolute inset-x-0 top-0 h-[2px] opacity-80" />
      <div className="p-4">
        <div className="flex items-center justify-between">
          <span className="label">Weight · 7-day average</span>
          <Delta value={change} unit=" kg" better="down" />
        </div>
        <div className="mt-2 flex items-end gap-2">
          <Ticker value={last.v} dp={1} className="num text-[84px] leading-[0.8]" duration={1000} />
          <span className="mb-1 font-mono text-[12px] text-fg-3">kg</span>
          <span className="mb-1 ml-auto text-right font-mono text-[11px] leading-snug text-fg-3">
            {Math.abs(change / weeks) < 0.005 ? 'Steady' : `${change < 0 ? '−' : '+'}${Math.abs(change / weeks).toFixed(2)} kg a week`}
            <br />
            over {Math.round(weeks)} weeks
          </span>
        </div>
        <div className="mt-4">
          <TrendChart points={data.points} avg={data.avg} height={160} format={(v) => v.toFixed(1)} xLabel={(t) => fmt(new Date(t).toISOString(), 'd MMM')} />
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-line px-4 py-2.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-fg-3">
        <span>
          Last {latest.weightKg?.toFixed(1)} kg · {fmt(latest.date, 'EEE d MMM HH:mm')}
        </span>
        {latest.bodyFat && <span>{latest.bodyFat.toFixed(1)}% fat</span>}
      </div>
    </section>
  )
}

interface MetricDef {
  key: string
  label: string
  unit: string
  better: 'up' | 'down'
  pick: (d: Daily) => number | undefined
  show: (v: number) => string
  dp?: number
}

const METRICS: MetricDef[] = [
  { key: 'hrv', label: 'HRV', unit: 'ms', better: 'up', pick: (d) => d.hrv, show: (v) => String(Math.round(v)) },
  { key: 'rhr', label: 'Resting HR', unit: 'bpm', better: 'down', pick: (d) => d.rhr, show: (v) => String(Math.round(v)) },
  { key: 'sleep', label: 'Sleep', unit: '', better: 'up', pick: (d) => d.sleepS, show: hm, dp: 0 },
  { key: 'steps', label: 'Steps', unit: '', better: 'up', pick: (d) => d.steps, show: (v) => thousands(v) },
]

/** Last 7 days against your own previous 3 weeks, never a population norm. */
function Recovery({ dailies }: { dailies: Daily[] }) {
  const recent = dailies.slice(-28)
  if (recent.length < 8) return null
  const last = recent[recent.length - 1]
  return (
    <Section title="Recovery" action={<span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-fg-3">4 weeks</span>}>
      <div className="flex flex-col gap-2">
        {METRICS.map((m) => {
          const vals = recent.map(m.pick).filter((v): v is number => v !== undefined)
          if (vals.length < 8) return null
          const week = mean(vals.slice(-7))
          const before = mean(vals.slice(0, -7))
          const lo = quantile(vals.slice(0, -7), 0.15)
          const hi = quantile(vals.slice(0, -7), 0.85)
          const diff = m.key === 'sleep' ? (week - before) / 60 : week - before
          return (
            <div key={m.key} className="card grid grid-cols-[1fr_132px] items-center gap-4 p-4">
              <div className="min-w-0">
                <div className="label">{m.label}</div>
                <div className="mt-1.5 flex items-baseline gap-1">
                  <span className="num text-[32px]">{m.show(week)}</span>
                  {m.unit && <span className="font-mono text-[11px] text-fg-3">{m.unit}</span>}
                </div>
                <div className="mt-1 whitespace-nowrap">
                  <Delta value={diff} unit={m.key === 'sleep' ? ' min' : m.key === 'steps' ? '' : ` ${m.unit}`} better={m.better} dp={0} />
                </div>
                <div className="mt-0.5 whitespace-nowrap font-mono text-[9.5px] uppercase tracking-[0.06em] text-fg-4">this week vs 3 before</div>
              </div>
              <Sparkline values={vals} band={[lo, hi]} height={54} area={false} />
            </div>
          )
        })}
        {last.sleepS && last.deepS !== undefined && <SleepStages d={last} />}
      </div>
    </Section>
  )
}

function SleepStages({ d }: { d: Daily }) {
  const parts = [
    { key: 'Deep', s: d.deepS ?? 0, color: 'rgb(var(--z1))' },
    { key: 'REM', s: d.remS ?? 0, color: 'rgb(var(--strength))' },
    { key: 'Light', s: d.lightS ?? 0, color: 'rgb(var(--fg-3))' },
    { key: 'Awake', s: d.awakeS ?? 0, color: 'rgb(var(--z4))' },
  ]
  const total = parts.reduce((a, p) => a + p.s, 0) || 1
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between">
        <span className="label">Last night</span>
        <span className="font-mono text-[10.5px] text-fg-3">
          {hm(d.sleepS ?? 0)}
          {d.sleepScore ? ` · score ${d.sleepScore}` : ''}
        </span>
      </div>
      <div className="mt-3 flex h-3 gap-[2px] overflow-hidden rounded-full">
        {parts.map((p) => (
          <span key={p.key} style={{ width: `${(p.s / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <div className="mt-2.5 grid grid-cols-4 gap-2">
        {parts.map((p) => (
          <div key={p.key}>
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-fg-3">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: p.color }} />
              {p.key}
            </div>
            <div className="num mt-0.5 text-[18px]">{hm(p.s)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

const MEASURES: { key: keyof BodyEntry; label: string }[] = [
  { key: 'waistCm', label: 'Waist' },
  { key: 'chestCm', label: 'Chest' },
  { key: 'armCm', label: 'Arm' },
  { key: 'thighCm', label: 'Thigh' },
]

function Measurements({ body }: { body: BodyEntry[] }) {
  const rows = MEASURES.map((m) => {
    const list = body.filter((b) => typeof b[m.key] === 'number').sort((a, b) => a.date.localeCompare(b.date))
    if (!list.length) return null
    const first = list[0][m.key] as number
    const last = list[list.length - 1][m.key] as number
    return { ...m, first, last, n: list.length, since: list[0].date, values: list.map((b) => b[m.key] as number) }
  }).filter((x): x is NonNullable<typeof x> => !!x)
  if (!rows.length) return null
  return (
    <Section title="Measurements" action={<span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-fg-3">since {fmt(rows[0].since, 'd MMM')}</span>}>
      <div className="grid grid-cols-2 gap-2">
        {rows.map((r) => (
          <div key={r.key} className="card p-3.5">
            <div className="label">{r.label}</div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className="num text-[28px]">{r.last.toFixed(1)}</span>
              <span className="font-mono text-[11px] text-fg-3">cm</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <Delta value={r.last - r.first} unit=" cm" better={r.key === 'waistCm' ? 'down' : 'up'} />
              <div className="w-16">
                <Sparkline values={r.values} height={22} area={false} dot={false} strokeWidth={1.5} color="rgb(var(--fg-3))" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}
