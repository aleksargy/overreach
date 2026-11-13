import { useMemo, type ReactNode } from 'react'
import { zoneOf } from '../../lib/load'
import { useMeasure, zoneColor } from './primitives'

/** labels, only where they're needed: small, in the reading face */
const TICK = 'font-mono text-[10.5px]'

function downsample(xs: number[], n: number): number[] {
  if (xs.length <= n) return xs
  const out: number[] = []
  const step = xs.length / n
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * step)
    const b = Math.max(a + 1, Math.floor((i + 1) * step))
    let s = 0
    let c = 0
    for (let j = a; j < b; j++)
      if (Number.isFinite(xs[j])) {
        s += xs[j]
        c++
      }
    out.push(c ? s / c : NaN)
  }
  return out
}

const timeTicks = (totalMin: number) => {
  const step = totalMin > 150 ? 30 : totalMin > 70 ? 15 : totalMin > 25 ? 10 : 5
  const ticks: number[] = []
  for (let m = step; m < totalMin - step * 0.3; m += step) ticks.push(m)
  return ticks
}

interface StreamProps {
  values: number[]
  dt: number
  height?: number
  /** hr colours the line by zone; pace inverts the axis */
  kind: 'hr' | 'pace' | 'alt' | 'power' | 'speed'
  bounds?: number[]
  format?: (v: number) => string
  markers?: { min: number; label: string }[]
}

export function StreamChart({ values, dt, height = 150, kind, bounds, format = (v) => v.toFixed(0), markers }: StreamProps) {
  const [ref, w] = useMeasure<HTMLDivElement>()
  const geo = useMemo(() => {
    if (!w || values.length < 2) return null
    // a heart rate of 0 is the strap or watch dropping out, not a reading
    const ys = downsample(kind === 'hr' ? values.map((v) => (v > 0 ? v : NaN)) : values, Math.min(420, Math.max(60, Math.floor(w / 1.2))))
    const fin = ys.filter(Number.isFinite)
    let lo = Math.min(...fin)
    let hi = Math.max(...fin)
    if (kind === 'pace') {
      lo = Math.max(lo, Math.min(...fin) * 0.98)
    }
    const span = hi - lo || 1
    lo -= span * 0.08
    hi += span * 0.08
    const top = 10
    const bottom = height - 22
    const left = 0
    const right = w - 34
    const X = (i: number) => left + (i / (ys.length - 1)) * (right - left)
    const Y = (v: number) => (kind === 'pace' ? top + ((v - lo) / (hi - lo)) * (bottom - top) : bottom - ((v - lo) / (hi - lo)) * (bottom - top))
    // a gap in the recording (a paused watch, half-time) breaks the line rather than diving to zero
    const runs: [number, number][][] = [[]]
    ys.forEach((v, i) => (Number.isFinite(v) ? runs[runs.length - 1].push([X(i), Y(v)]) : runs[runs.length - 1].length && runs.push([])))
    const line = (r: [number, number][]) => r.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('')
    const filled = runs.filter((r) => r.length)
    const d = filled.map(line).join('')
    const area = filled.map((r) => `${line(r)}L${r[r.length - 1][0].toFixed(1)},${bottom}L${r[0][0].toFixed(1)},${bottom}Z`).join('')
    const segs: { z: number; d: string }[] = []
    if (kind === 'hr' && bounds) {
      let cur: { z: number; d: string } | null = null
      ys.forEach((v, i) => {
        if (!Number.isFinite(v)) {
          if (cur) segs.push(cur)
          cur = null
          return
        }
        const z = zoneOf(v, bounds)
        const p = `${X(i).toFixed(1)},${Y(v).toFixed(1)}`
        if (!cur || cur.z !== z) {
          if (cur) {
            cur.d += `L${p}`
            segs.push(cur)
          }
          cur = { z, d: `M${p}` }
        } else cur.d += `L${p}`
      })
      if (cur) segs.push(cur)
    }
    const totalMin = (values.length * dt) / 60
    const ticks = timeTicks(totalMin).map((m) => ({ m, x: left + (m / totalMin) * (right - left) }))
    const guides =
      kind === 'hr' && bounds
        ? bounds
            .slice(1)
            .map((b, i) => ({ z: i + 1, y: Y(b) }))
            .filter((g) => g.y > top && g.y < bottom)
        : []
    const mk = (markers ?? []).map((m) => ({ ...m, x: left + (m.min / totalMin) * (right - left) }))
    return { d, area, segs, ticks, guides, lo, hi, top, bottom, right, mk, Y }
  }, [values, dt, w, height, kind, bounds, markers])

  const stroke = kind === 'alt' ? 'rgb(var(--fg-3))' : 'rgb(var(--fg))'
  return (
    <div ref={ref} className="w-full" style={{ height }}>
      {geo && (
        <svg width={w} height={height} className="block overflow-visible">
          {kind === 'alt' && <path d={geo.area} fill="rgb(var(--fg) / 0.07)" />}
          {geo.guides.map((g) => (
            <g key={g.z}>
              <line x1={0} x2={geo.right} y1={g.y} y2={g.y} stroke={zoneColor(g.z, 0.35)} strokeDasharray="2 5" strokeLinecap="round" />
              {g.y > geo.top + 16 && g.y < geo.bottom - 16 && (
                <text x={geo.right + 5} y={g.y + 3.5} className={`fill-fg-4 ${TICK}`}>
                  Z{g.z + 1}
                </text>
              )}
            </g>
          ))}
          {geo.segs.length ? (
            geo.segs.map((s, i) => <path key={i} d={s.d} fill="none" stroke={zoneColor(s.z)} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />)
          ) : (
            <path d={geo.d} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
          )}
          {geo.mk.map((m, i) => (
            <g key={i}>
              <line x1={m.x} x2={m.x} y1={geo.top - 4} y2={geo.bottom} stroke="rgb(var(--bad))" strokeDasharray="3 3" />
              <text x={m.x + 4} y={geo.top + 4} className={`fill-bad ${TICK} font-medium`}>
                {m.label}
              </text>
            </g>
          ))}
          <line x1={0} x2={geo.right} y1={geo.bottom} y2={geo.bottom} stroke="rgb(var(--fg) / 0.16)" />
          {geo.ticks.map((t) => (
            <text key={t.m} x={t.x} y={height - 5} textAnchor="middle" className={`fill-fg-4 ${TICK}`}>
              {t.m}′
            </text>
          ))}
          <text x={geo.right + 5} y={geo.top + 6} className={`fill-fg-3 ${TICK}`}>
            {format(kind === 'pace' ? geo.lo : geo.hi)}
          </text>
          <text x={geo.right + 5} y={geo.bottom} className={`fill-fg-3 ${TICK}`}>
            {format(kind === 'pace' ? geo.hi : geo.lo)}
          </text>
        </svg>
      )}
    </div>
  )
}

interface BarsProps {
  values: number[]
  labels?: (string | null)[]
  colors?: string[]
  height?: number
  /** the bar that's filled in: this week, today */
  highlight?: number
  /** a dashed line across at your usual value */
  usual?: number
  /** a line down before one of the bars, with a word on it */
  marker?: { index: number; label: string }
  valueLabels?: boolean
  format?: (v: number) => string
}

/** Capsule bars, faint in their colour, with the one that matters solid. */
export function Bars({ values, labels, colors, height = 120, highlight, usual, marker, valueLabels, format = (v) => v.toFixed(0) }: BarsProps) {
  const [ref, w] = useMeasure<HTMLDivElement>()
  const max = Math.max(...values, usual ?? 0, 1)
  const labelH = labels ? 19 : 0
  const topH = valueLabels ? 16 : 4
  const plot = height - labelH - topH
  const n = values.length
  const slot = w ? w / n : 0
  const bw = Math.max(3, Math.min(slot * 0.66, 22))
  const cx = (i: number) => i * slot + slot / 2
  const base = topH + plot
  return (
    <div ref={ref} style={{ height }} className="w-full">
      {w > 0 && (
        <svg width={w} height={height} className="block overflow-visible">
          {values.map((v, i) => {
            const bh = v > 0 ? Math.max(3, (v / max) * plot) : 0
            const on = i === highlight
            const color = colors?.[i]
            return (
              <g key={i}>
                {bh > 0 ? (
                  <rect
                    x={cx(i) - bw / 2}
                    y={base - bh}
                    width={bw}
                    height={bh}
                    rx={Math.min(5, bw / 2, bh / 2)}
                    fill={color ?? (on ? 'rgb(var(--fg))' : 'rgb(var(--fg) / 0.2)')}
                    fillOpacity={color ? 0.85 : 1}
                  />
                ) : (
                  <rect x={cx(i) - bw / 2} y={base - 3} width={bw} height={3} rx={1.5} fill="rgb(var(--fg) / 0.1)" />
                )}
                {valueLabels && v > 0 && (
                  <text x={cx(i)} y={base - bh - 5} textAnchor="middle" className={`fill-fg-3 ${TICK}`}>
                    {format(v)}
                  </text>
                )}
                {labels?.[i] && (
                  <text x={cx(i)} y={height - 3} textAnchor="middle" className={`${TICK} ${on ? 'fill-fg-2' : 'fill-fg-4'}`}>
                    {labels[i]}
                  </text>
                )}
              </g>
            )
          })}
          {marker && (
            <g>
              <line x1={marker.index * slot} x2={marker.index * slot} y1={0} y2={base} stroke="rgb(var(--bad))" strokeDasharray="3 3" />
              <text x={marker.index * slot + 4} y={8} className={`fill-bad ${TICK} font-medium`}>
                {marker.label}
              </text>
            </g>
          )}
          {usual !== undefined && usual > 0 && (
            <line x1={0} x2={w} y1={base - (usual / max) * plot} y2={base - (usual / max) * plot} stroke="rgb(var(--line-2))" strokeDasharray="4 4" strokeWidth={1.5} />
          )}
        </svg>
      )}
    </div>
  )
}

interface TrendProps {
  points: { t: number; v: number }[]
  avg?: { t: number; v: number }[]
  band?: [number, number]
  height?: number
  xLabel?: (t: number) => string
  color?: string
  /** smallest range the y axis shows, so a flat series doesn't fill the chart with noise and repeat its labels */
  minSpan?: number
  children?: ReactNode
}

/** Raw readings as dots, the rolling average as the line that matters. */
export function TrendChart({ points, avg, band, height = 170, xLabel, color = 'rgb(var(--fg))', minSpan = 0 }: TrendProps) {
  const [ref, w] = useMeasure<HTMLDivElement>()
  const geo = useMemo(() => {
    if (!w || points.length < 2) return null
    const ts = points.map((p) => p.t)
    const vs = [...points.map((p) => p.v), ...(band ?? [])]
    const t0 = Math.min(...ts)
    const t1 = Math.max(...ts)
    let lo = Math.min(...vs)
    let hi = Math.max(...vs)
    if (hi - lo < minSpan) {
      const mid = (hi + lo) / 2
      lo = mid - minSpan / 2
      hi = mid + minSpan / 2
    }
    const pad = (hi - lo) * 0.12 || 1
    lo -= pad
    hi += pad
    const left = 0
    const right = w - 6
    const top = 8
    const bottom = height - 20
    const X = (t: number) => left + ((t - t0) / (t1 - t0 || 1)) * (right - left)
    const Y = (v: number) => bottom - ((v - lo) / (hi - lo)) * (bottom - top)
    const line = (avg ?? []).map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join('')
    const last = avg?.length ? avg[avg.length - 1] : points[points.length - 1]
    return { X, Y, line, last, t0, t1, lo, hi, right, top, bottom }
  }, [points, avg, band, w, height, minSpan])

  return (
    <div ref={ref} className="w-full" style={{ height }}>
      {geo && (
        <svg width={w} height={height} className="block overflow-visible">
          {band && <rect x={0} width={geo.right} y={geo.Y(band[1])} height={geo.Y(band[0]) - geo.Y(band[1])} rx={4} fill="rgb(var(--fg) / 0.06)" />}
          {/* each reading is a small dot, faint in the line's colour */}
          {points.map((p, i) => (
            <circle key={i} cx={geo.X(p.t)} cy={geo.Y(p.v)} r={1.5} fill={color} fillOpacity={0.4} />
          ))}
          {geo.line && <path d={geo.line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
          <circle cx={geo.X(geo.last.t)} cy={geo.Y(geo.last.v)} r={5} fill="rgb(var(--fg))" />
          {xLabel && (
            <>
              <text x={0} y={height - 4} className={`fill-fg-4 ${TICK}`}>
                {xLabel(geo.t0)}
              </text>
              <text x={geo.right} y={height - 4} textAnchor="end" className={`fill-fg-4 ${TICK}`}>
                {xLabel(geo.t1)}
              </text>
            </>
          )}
        </svg>
      )}
    </div>
  )
}
