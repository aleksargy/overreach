import { useMemo } from 'react'
import { clock } from '../../lib/format'
import { useMeasure } from './primitives'

interface GapLine {
  pts: { m: number; s: number }[]
  color: string
  width?: number
}

/** "+1:20" or "−8s" */
export const gapLabel = (s: number) => `${s > 0 ? '+' : s < 0 ? '−' : ''}${Math.abs(s) >= 60 ? clock(Math.abs(s)) : `${Math.round(Math.abs(s))}s`}`

/**
 * Seconds ahead (up) or behind (down) of a pace or another run, along the
 * distance; or, with `zero` off, any reading along it (heart rate). `at` marks a
 * point, in metres.
 */
export function GapChart({
  lines,
  height = 150,
  at,
  zero = true,
  format = gapLabel,
  from = 0,
}: {
  lines: GapLine[]
  height?: number
  at?: number
  zero?: boolean
  format?: (v: number) => string
  /** where along the run the chart starts (m), for a stretch of it */
  from?: number
}) {
  const [ref, w] = useMeasure<HTMLDivElement>()
  const geo = useMemo(() => {
    const all = lines.flatMap((l) => l.pts)
    if (!w || all.length < 2) return null
    const m1 = Math.max(...all.map((p) => p.m))
    const [min, max] = [Math.min(...all.map((p) => p.s)), Math.max(...all.map((p) => p.s))]
    const pad = zero ? 0 : (max - min) * 0.1 + 1
    const lo = zero ? Math.min(-10, min) * 1.1 : min - pad
    const hi = zero ? Math.max(10, max) * 1.1 : max + pad
    const right = w - 44
    const top = 6
    const bottom = height - 20
    const X = (m: number) => ((m - from) / (m1 - from || 1)) * right
    const Y = (s: number) => bottom - ((s - lo) / (hi - lo)) * (bottom - top)
    const path = (pts: GapLine['pts']) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.m).toFixed(1)},${Y(p.s).toFixed(1)}`).join('')
    const span = m1 - from
    const step = span > 30_000 ? 10_000 : span > 12_000 ? 5000 : span > 6000 ? 2000 : 1000
    const ticks: number[] = []
    for (let m = Math.ceil((from + step / 3) / step) * step; m < m1 - step / 3; m += step) ticks.push(m)
    return { X, Y, path, ticks, right, bottom, min, max }
  }, [lines, w, height, zero, from])
  return (
    <div ref={ref} className="w-full" style={{ height }}>
      {geo && (
        <svg width={w} height={height} className="block overflow-visible">
          {zero && (
            <>
              <line x1={0} x2={geo.right} y1={geo.Y(0)} y2={geo.Y(0)} stroke="rgb(var(--fg-3))" strokeDasharray="2 4" />
              <text x={geo.right + 6} y={geo.Y(0) + 3} className="fill-fg-3 font-mono text-[10.5px]">
                0
              </text>
            </>
          )}
          {(!zero || geo.max > 15) && (
            <text x={geo.right + 6} y={geo.Y(geo.max) + 3} className="fill-fg-4 font-mono text-[10.5px]">
              {format(geo.max)}
            </text>
          )}
          {(!zero || geo.min < -15) && (
            <text x={geo.right + 6} y={geo.Y(geo.min) + 3} className="fill-fg-4 font-mono text-[10.5px]">
              {format(geo.min)}
            </text>
          )}
          {lines.map((l, i) => (
            <path key={i} d={geo.path(l.pts)} fill="none" stroke={l.color} strokeWidth={l.width ?? 1.5} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {at !== undefined && (
            <line
              x1={Math.min(geo.right, geo.X(at))}
              x2={Math.min(geo.right, geo.X(at))}
              y1={0}
              y2={geo.bottom}
              stroke="rgb(var(--fg) / 0.35)"
              strokeDasharray="1 4"
              strokeLinecap="round"
            />
          )}
          {geo.ticks.map((m) => (
            <text key={m} x={geo.X(m)} y={height - 4} textAnchor="middle" className="fill-fg-4 font-mono text-[10.5px]">
              {m / 1000} km
            </text>
          ))}
        </svg>
      )}
    </div>
  )
}
