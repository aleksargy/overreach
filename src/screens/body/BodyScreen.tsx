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

const hm = (s: number) => {
  const m = Math.round(s / 60)
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

export function BodyScreen() {
  const w = useWorld()
  const open = useUi((s) => s.open)
  return (
    <Screen
      title="Body"
      kicker={<span className="flex items-center gap-2">Weight, recovery and sleep {w.mode === 'sample' && <SampleBadge />}</span>}
      actions={
        <IconButton label="Weigh in" onClick={() => open({ type: 'logBody' })}>
          <Plus size={19} strokeWidth={2} />
        </IconButton>
      }
    >
      <Weight body={w.body} now={w.now} />
      <Recovery dailies={w.dailies} />
    </Screen>
  )
}

function Weight({ body, now }: { body: BodyEntry[]; now: Date }) {
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
          <button className="btn-primary mt-3 h-10 px-4 text-[14px]" onClick={() => open({ type: 'logBody' })}>
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
  const weeks = Math.max(1, Math.round((last.t - monthAgo.t) / (7 * 86_400_000)))
  const latest = data.ws[data.ws.length - 1]
  const perWeek = change / weeks
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <span className="label">Weight, 7-day average</span>
        {data.avg.length > 1 && Math.abs(change) >= 0.05 && (
          <span className="flex items-center gap-1.5">
            <Delta value={change} unit=" kg" better="down" />
            <span className="text-[13px] text-fg-3">in {weeks} weeks</span>
          </span>
        )}
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <Ticker value={last.v} dp={1} className="num-hero -ml-1 text-[96px]" duration={1000} />
        <span className="text-[17px] font-medium text-fg-3">kg</span>
      </div>
      <div className="meta mt-4">{Math.abs(perWeek) < 0.05 ? 'Holding steady' : `${perWeek < 0 ? 'Losing' : 'Gaining'} ${Math.abs(perWeek).toFixed(2)} kg a week`}</div>
      <div className="mt-6">
        <TrendChart points={data.points} avg={data.avg} height={150} format={(v) => v.toFixed(1)} minSpan={1} xLabel={(t) => fmt(new Date(t).toISOString(), 'd MMM')} />
      </div>
      <div className="meta mt-3">
        Last {latest.weightKg?.toFixed(1)} kg, {fmt(latest.date, 'EEE d MMM')}
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
  /** how the change reads: sleep in minutes, the rest in their own unit */
  delta: (diff: number) => { value: number; unit: string }
}

const METRICS: MetricDef[] = [
  { key: 'hrv', label: 'HRV', unit: 'ms', better: 'up', pick: (d) => d.hrv, show: (v) => String(Math.round(v)), delta: (d) => ({ value: d, unit: ' ms' }) },
  { key: 'rhr', label: 'Resting HR', unit: 'bpm', better: 'down', pick: (d) => d.rhr, show: (v) => String(Math.round(v)), delta: (d) => ({ value: d, unit: ' bpm' }) },
  { key: 'sleep', label: 'Sleep', unit: '', better: 'up', pick: (d) => d.sleepS, show: hm, delta: (d) => ({ value: d / 60, unit: ' min' }) },
  { key: 'steps', label: 'Steps', unit: '', better: 'up', pick: (d) => d.steps, show: (v) => thousands(v), delta: (d) => ({ value: d, unit: '' }) },
]

/** Last 7 days against your own previous 3 weeks, never a population norm. */
function Recovery({ dailies }: { dailies: Daily[] }) {
  const recent = dailies.slice(-28)
  if (recent.length < 8) return null
  const last = recent[recent.length - 1]
  const tiles = METRICS.map((m) => {
    const vals = recent.map(m.pick).filter((v): v is number => v !== undefined)
    if (vals.length < 8) return null
    const week = mean(vals.slice(-7))
    const before = vals.slice(0, -7)
    const d = m.delta(week - mean(before))
    return { m, vals, week, d, band: [quantile(before, 0.15), quantile(before, 0.85)] as [number, number] }
  }).filter((x): x is NonNullable<typeof x> => !!x)
  return (
    <>
      {tiles.length > 0 && (
        <Section title="Recovery" action={<span className="meta">Last 7 days vs the 3 before</span>}>
          <div className="grid grid-cols-2 gap-2">
            {tiles.map(({ m, vals, week, d, band }) => (
              <div key={m.key} className="card flex flex-col p-4">
                <div className="label">{m.label}</div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="num text-[28px]">{m.show(week)}</span>
                  {m.unit && <span className="text-[13px] text-fg-3">{m.unit}</span>}
                </div>
                <div className="mt-1.5">
                  <Delta value={d.value} unit={d.unit} better={m.better} dp={0} />
                </div>
                <div className="mt-3">
                  <Sparkline values={vals} band={band} height={36} area={false} color="rgb(var(--fg-2))" />
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
      {last.sleepS && last.deepS !== undefined && <SleepStages d={last} />}
    </>
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
    <Section title="Last night" action={d.sleepScore ? <span className="meta">Sleep score {d.sleepScore}</span> : undefined}>
      <div className="card p-4">
        <div className="num text-[28px]">{hm(d.sleepS ?? 0)}</div>
        <div className="mt-4 flex h-2 gap-[3px]">
          {parts.map((p) => (p.s > 0 ? <span key={p.key} className="rounded-full" style={{ width: `${(p.s / total) * 100}%`, background: p.color }} /> : null))}
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {parts.map((p) => (
            <div key={p.key}>
              <div className="flex items-center gap-1.5 text-[12px] text-fg-3">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
                {p.key}
              </div>
              <div className="mt-1.5 text-[15px] font-medium tabular-nums">{hm(p.s)}</div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}
