import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { ZoneSeconds } from '../../data/types'

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

/** 40-tick VU meter that lights up to the score. */
export function TickMeter({ value, color, ticks = 40, height = 30 }: { value: number; color: string; ticks?: number; height?: number }) {
  const [lit, setLit] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setLit(Math.round((value / 100) * ticks)))
    return () => cancelAnimationFrame(id)
  }, [value, ticks])
  return (
    <div className="flex items-end gap-[3px]" style={{ height }} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      {Array.from({ length: ticks }, (_, i) => {
        const on = i < lit
        const major = i % 10 === 0
        return (
          <span
            key={i}
            className="flex-1 rounded-[1px]"
            style={{
              height: major ? '100%' : '78%',
              background: on ? color : 'rgb(var(--line-2))',
              opacity: on ? 0.55 + 0.45 * (i / ticks) : 1,
              transition: `background-color 0.25s ${i * 16}ms, opacity 0.25s ${i * 16}ms`,
            }}
          />
        )
      })}
    </div>
  )
}

/** Today's value against your normal (p15–p85) range. */
export function RangeBar({ min, max, lo, hi, today, good }: { min: number; max: number; lo: number; hi: number; today: number; good: boolean | null }) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, ((v - min) / (max - min || 1)) * 100))}%`
  const color = good === null ? 'rgb(var(--fg))' : good ? 'rgb(var(--good))' : 'rgb(var(--bad))'
  return (
    <div className="relative h-5">
      <div className="absolute inset-x-0 top-1/2 h-[4px] -translate-y-1/2 rounded-full bg-ink-3" />
      <div className="absolute top-1/2 h-[4px] -translate-y-1/2 rounded-full bg-fg-4" style={{ left: pct(lo), width: `calc(${pct(hi)} - ${pct(lo)})` }} />
      <div className="absolute top-1/2 h-4 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: pct(today), background: color, boxShadow: `0 0 10px ${color}` }} />
    </div>
  )
}

export function ZoneBar({ zones, height = 8, labels }: { zones: ZoneSeconds; height?: number; labels?: boolean }) {
  const total = zones.reduce((a, b) => a + b, 0) || 1
  return (
    <div>
      <div className="flex w-full gap-[2px] overflow-hidden rounded-[3px]" style={{ height }}>
        {zones.map((s, i) =>
          s > 0 ? <span key={i} style={{ width: `${(s / total) * 100}%`, background: zoneColor(i) }} title={`Z${i + 1} ${Math.round((s / total) * 100)}%`} /> : null,
        )}
      </div>
      {labels && (
        <div className="mt-2 grid grid-cols-5 gap-1">
          {zones.map((s, i) => (
            <div key={i} className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: zoneColor(i) }} />
                <span className="font-mono text-[10px] text-fg-3">Z{i + 1}</span>
              </div>
              <div className="num mt-0.5 text-[17px]">{Math.round((s / total) * 100)}%</div>
              <div className="font-mono text-[10px] text-fg-4">{Math.round(s / 60)}m</div>
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
  area?: boolean
  band?: [number, number]
  dot?: boolean
  min?: number
  max?: number
  strokeWidth?: number
}

export function Sparkline({ values, height = 44, color = 'rgb(var(--fg))', area = true, band, dot = true, min, max, strokeWidth = 1.75 }: SparkProps) {
  const [ref, w] = useMeasure<HTMLDivElement>()
  const id = useRef(`g${Math.random().toString(36).slice(2, 8)}`).current
  const vals = values.filter((v) => Number.isFinite(v))
  const lo = min ?? Math.min(...vals, ...(band ?? []))
  const hi = max ?? Math.max(...vals, ...(band ?? []))
  const pad = 4
  const x = (i: number) => (values.length < 2 ? w / 2 : (i / (values.length - 1)) * (w - pad * 2) + pad)
  const y = (v: number) => height - pad - ((v - lo) / (hi - lo || 1)) * (height - pad * 2)
  const pts = values.map((v, i) => [x(i), y(v)] as const).filter(([, py]) => Number.isFinite(py))
  const d = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('')
  const last = pts[pts.length - 1]
  return (
    <div ref={ref} style={{ height }} className="w-full">
      {w > 0 && pts.length > 1 && (
        <svg width={w} height={height} className="block overflow-visible">
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.28" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {band && <rect x={pad} width={w - pad * 2} y={y(band[1])} height={Math.max(1, y(band[0]) - y(band[1]))} fill="rgb(var(--fg) / 0.06)" />}
          {area && <path d={`${d}L${last[0]},${height}L${pts[0][0]},${height}Z`} fill={`url(#${id})`} />}
          <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
          {dot && last && (
            <>
              <circle cx={last[0]} cy={last[1]} r={6} fill={color} opacity={0.2} />
              <circle cx={last[0]} cy={last[1]} r={3} fill={color} />
            </>
          )}
        </svg>
      )}
    </div>
  )
}

export function Legend({ items }: { items: { label: ReactNode; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-3">
          <span className="h-[2px] w-3" style={{ background: it.dashed ? 'transparent' : it.color, borderTop: it.dashed ? `2px dashed ${it.color}` : undefined }} />
          {it.label}
        </span>
      ))}
    </div>
  )
}
