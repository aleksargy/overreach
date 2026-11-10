import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { ZoneSeconds } from '../../data/types'
import { Hatch } from '../ui/chalk'

export function useMeasure<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.clientWidth)
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

export const ZONE_VAR = ['--z1', '--z2', '--z3', '--z4', '--z5']
export const zoneColor = (z: number, a = 1) => `rgb(var(${ZONE_VAR[Math.max(0, Math.min(4, z))]}) / ${a})`
export const ZONE_NAMES = ['Easy', 'Aerobic', 'Tempo', 'Threshold', 'Max']

/** Today's value against your normal (p15–p85) range. */
export function RangeBar({ min, max, lo, hi, today, good }: { min: number; max: number; lo: number; hi: number; today: number; good: boolean | null }) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, ((v - min) / (max - min || 1)) * 100))}%`
  const color = good === null ? 'rgb(var(--fg))' : good ? 'rgb(var(--good))' : 'rgb(var(--bad))'
  return (
    <div className="relative h-4">
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-fg/20" />
      <div className="hatch absolute top-1/2 h-[9px] -translate-y-1/2" style={{ left: pct(lo), width: `calc(${pct(hi)} - ${pct(lo)})` }} />
      <div
        className="absolute top-1/2 h-[13px] w-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-0"
        style={{ left: pct(today), boxShadow: `inset 0 0 0 2px ${color}` }}
      />
    </div>
  )
}

export function ZoneBar({ zones, height = 8, labels }: { zones: ZoneSeconds; height?: number; labels?: boolean }) {
  const total = zones.reduce((a, b) => a + b, 0) || 1
  return (
    <div>
      <div className="flex w-full gap-[2px] overflow-hidden rounded-[1.5px]" style={{ height }}>
        {zones.map((s, i) =>
          s > 0 ? <span key={i} style={{ width: `${(s / total) * 100}%`, background: zoneColor(i) }} title={`Z${i + 1} ${Math.round((s / total) * 100)}%`} /> : null,
        )}
      </div>
      {labels && (
        <div className="mt-3 grid grid-cols-5 gap-1">
          {zones.map((s, i) => (
            <div key={i} className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: zoneColor(i) }} />
                <span className="text-[12px] font-medium text-fg-3">Z{i + 1}</span>
              </div>
              <div className="num mt-1.5 text-[17px]">{Math.round((s / total) * 100)}%</div>
              <div className="meta mt-0.5 text-[12px]">{Math.round(s / 60)} min</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface SparkProps {
  values: number[]
  height?: number
  color?: string
  band?: [number, number]
  dot?: boolean
  min?: number
  max?: number
  strokeWidth?: number
}

export function Sparkline({ values, height = 44, color = 'rgb(var(--fg))', band, dot = true, min, max, strokeWidth = 1.5 }: SparkProps) {
  const [ref, w] = useMeasure<HTMLDivElement>()
  const id = useId()
  const vals = values.filter((v) => Number.isFinite(v))
  const lo = min ?? Math.min(...vals, ...(band ?? []))
  const hi = max ?? Math.max(...vals, ...(band ?? []))
  const pad = 5
  const x = (i: number) => (values.length < 2 ? w / 2 : (i / (values.length - 1)) * (w - pad * 2) + pad)
  const y = (v: number) => height - pad - ((v - lo) / (hi - lo || 1)) * (height - pad * 2)
  const pts = values.map((v, i) => [x(i), y(v)] as const).filter(([, py]) => Number.isFinite(py))
  const d = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('')
  const last = pts[pts.length - 1]
  return (
    <div ref={ref} style={{ height }} className="w-full">
      {w > 0 && pts.length > 1 && (
        <svg width={w} height={height} className="block overflow-visible">
          {band && (
            <>
              <defs>
                <Hatch id={id} opacity={0.2} />
              </defs>
              <rect x={pad} width={w - pad * 2} y={y(band[1])} height={Math.max(1, y(band[0]) - y(band[1]))} fill={`url(#${id})`} />
            </>
          )}
          <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
          {dot && last && <circle cx={last[0]} cy={last[1]} r={3} fill="rgb(var(--ink-0))" stroke={color} strokeWidth={1.5} />}
        </svg>
      )}
    </div>
  )
}

export function Legend({ items }: { items: { label: ReactNode; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5 text-[12.5px] text-fg-3">
          <span className="h-[2px] w-3 rounded-full" style={{ background: it.dashed ? 'transparent' : it.color, borderTop: it.dashed ? `2px dashed ${it.color}` : undefined }} />
          {it.label}
        </span>
      ))}
    </div>
  )
}
