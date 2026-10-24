import { useMemo } from 'react'
import { pace } from '../../lib/format'
import { useMeasure } from './primitives'

interface DriftLine {
  pts: { m: number; bpm: number }[]
  color: string
  width?: number
  /** minute to mark with a dot */
  mark?: number
}

/** Heart rate above where it settled, minute by minute, for a few long runs. */
export function DriftChart({ lines, threshold, height = 150 }: { lines: DriftLine[]; threshold: number; height?: number }) {
  const [ref, w] = useMeasure<HTMLDivElement>()
  const geo = useMemo(() => {
    const all = lines.flatMap((l) => l.pts)
    if (!w || all.length < 2) return null
    const m1 = Math.ceil(Math.max(...all.map((p) => p.m)) / 15) * 15
    const lo = Math.min(-3, ...all.map((p) => p.bpm))
    const hi = Math.max(threshold + 4, ...all.map((p) => p.bpm)) + 1
    const right = w - 34
    const top = 6
    const bottom = height - 20
    const X = (m: number) => ((m - 10) / (m1 - 10)) * right
    const Y = (b: number) => bottom - ((b - lo) / (hi - lo)) * (bottom - top)
    const path = (pts: DriftLine['pts']) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.m).toFixed(1)},${Y(p.bpm).toFixed(1)}`).join('')
    const ticks: number[] = []
    for (let m = 30; m < m1; m += 30) ticks.push(m)
    return { X, Y, path, ticks, right, bottom }
  }, [lines, threshold, w, height])
  return (
    <div ref={ref} className="w-full" style={{ height }}>
      {geo && (
        <svg width={w} height={height} className="block overflow-visible">
          <line x1={0} x2={geo.right} y1={geo.Y(0)} y2={geo.Y(0)} stroke="rgb(var(--line))" />
          <text x={geo.right + 6} y={geo.Y(0) + 3} className="fill-fg-4 font-mono text-[10px]">
            0
          </text>
          <line x1={0} x2={geo.right} y1={geo.Y(threshold)} y2={geo.Y(threshold)} stroke="rgb(var(--fg-3))" strokeDasharray="2 4" />
          <text x={geo.right + 6} y={geo.Y(threshold) + 3} className="fill-fg-3 font-mono text-[10px]">
            +{threshold}
          </text>
          {lines.map((l, i) => (
            <path key={i} d={geo.path(l.pts)} fill="none" stroke={l.color} strokeWidth={l.width ?? 1.5} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {lines.map((l, i) => {
            const p = l.mark !== undefined ? l.pts.find((x) => x.m === l.mark) : undefined
            return p ? <circle key={i} cx={geo.X(p.m)} cy={geo.Y(p.bpm)} r={3.5} fill={l.color} stroke="rgb(var(--ink-1))" strokeWidth={2} /> : null
          })}
          {geo.ticks.map((m) => (
            <text key={m} x={geo.X(m)} y={height - 4} textAnchor="middle" className="fill-fg-4 font-mono text-[10px]">
              {m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}` : `${m}m`}
            </text>
          ))}
        </svg>
      )}
    </div>
  )
}

const DUR_TICKS = [
  { s: 60, label: '1m' },
  { s: 180, label: '3m' },
  { s: 600, label: '10m' },
  { s: 1200, label: '20m' },
  { s: 3600, label: '1h' },
]

/** Best speed held by duration (log scale), with the critical speed model drawn through it. */
export function EffortCurve({ envelope, cs, dPrime, height = 160 }: { envelope: { s: number; v: number }[]; cs: number; dPrime: number; height?: number }) {
  const [ref, w] = useMeasure<HTMLDivElement>()
  const geo = useMemo(() => {
    if (!w || envelope.length < 2) return null
    const model = Array.from({ length: 40 }, (_, i) => 120 * (2400 / 120) ** (i / 39)).map((s) => ({ s, v: cs + dPrime / s }))
    const vs = [...envelope.map((e) => e.v), cs]
    const lo = Math.min(...vs) * 0.97
    const hi = Math.max(...vs, ...model.map((m) => m.v).slice(0, 1)) * 1.02
    const right = w - 40
    const top = 6
    const bottom = height - 20
    const X = (s: number) => (Math.log(s / 60) / Math.log(3600 / 60)) * right
    const Y = (v: number) => bottom - ((v - lo) / (hi - lo)) * (bottom - top)
    const line = model.map((p, i) => `${i ? 'L' : 'M'}${X(p.s).toFixed(1)},${Y(p.v).toFixed(1)}`).join('')
    return { X, Y, line, right, bottom }
  }, [envelope, cs, dPrime, w, height])
  return (
    <div ref={ref} className="w-full" style={{ height }}>
      {geo && (
        <svg width={w} height={height} className="block overflow-visible">
          <line x1={0} x2={geo.right} y1={geo.Y(cs)} y2={geo.Y(cs)} stroke="rgb(var(--fg-3))" strokeDasharray="2 4" />
          <text x={geo.right + 6} y={geo.Y(cs) + 3} className="fill-fg-3 font-mono text-[10px]">
            {pace(cs)}
          </text>
          <path d={geo.line} fill="none" stroke="rgb(var(--fg) / 0.5)" strokeWidth={1.5} strokeLinecap="round" />
          {envelope.map((e) => (
            <circle key={e.s} cx={geo.X(e.s)} cy={geo.Y(e.v)} r={3.5} fill="rgb(var(--run))" stroke="rgb(var(--ink-1))" strokeWidth={2} />
          ))}
          {envelope.slice(0, 1).map((e) => (
            <text key="top" x={geo.right + 6} y={geo.Y(e.v) + 3} className="fill-fg-4 font-mono text-[10px]">
              {pace(e.v)}
            </text>
          ))}
          {DUR_TICKS.map((t) => (
            <text key={t.s} x={geo.X(t.s)} y={height - 4} textAnchor={t.s === 60 ? 'start' : t.s === 3600 ? 'end' : 'middle'} className="fill-fg-4 font-mono text-[10px]">
              {t.label}
            </text>
          ))}
        </svg>
      )}
    </div>
  )
}
