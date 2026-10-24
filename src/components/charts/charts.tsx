import { useMemo, useRef, type ReactNode } from 'react'
import { zoneOf } from '../../lib/load'
import { useMeasure, zoneColor } from './primitives'

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
  const id = useRef(`s${Math.random().toString(36).slice(2, 8)}`).current
  const geo = useMemo(() => {
    if (!w || values.length < 2) return null
    const ys = downsample(values, Math.min(420, Math.max(60, Math.floor(w / 1.2))))
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
    const pts = ys.map((v, i) => (Number.isFinite(v) ? ([X(i), Y(v)] as const) : null))
    let d = ''
    let pen = false
    for (const p of pts) {
      if (!p) {
        pen = false
        continue
      }
      d += `${pen ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`
      pen = true
    }
    const valid = pts.filter((p): p is readonly [number, number] => !!p)
    const area = valid.length ? `${d}L${valid[valid.length - 1][0]},${bottom}L${valid[0][0]},${bottom}Z` : ''
    const segs: { z: number; d: string }[] = []
    if (kind === 'hr' && bounds) {
      let cur: { z: number; d: string } | null = null
      ys.forEach((v, i) => {
        if (!Number.isFinite(v)) return
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
        ? bounds.slice(1).map((b, i) => ({ z: i + 1, y: Y(b) })).filter((g) => g.y > top && g.y < bottom)
        : []
    const mk = (markers ?? []).map((m) => ({ ...m, x: left + (m.min / totalMin) * (right - left) }))
    return { d, area, segs, ticks, guides, lo, hi, top, bottom, right, mk, Y }
  }, [values, dt, w, height, kind, bounds, markers])

  const stroke = kind === 'alt' ? 'rgb(var(--fg-3))' : 'rgb(var(--fg))'
  return (
    <div ref={ref} className="w-full" style={{ height }}>
      {geo && (
        <svg width={w} height={height} className="block overflow-visible">
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="rgb(var(--fg))" stopOpacity={kind === 'alt' ? 0.16 : 0.12} />
              <stop offset="1" stopColor="rgb(var(--fg))" stopOpacity="0" />
            </linearGradient>
          </defs>
          {geo.guides.map((g) => (
            <g key={g.z}>
              <line x1={0} x2={geo.right} y1={g.y} y2={g.y} stroke={zoneColor(g.z, 0.35)} strokeDasharray="2 4" />
              <text x={geo.right + 4} y={g.y + 3} className="fill-fg-4 font-mono text-[9px]">
                Z{g.z + 1}
              </text>
            </g>
          ))}
          <path d={geo.area} fill={`url(#${id})`} />
          {geo.segs.length ? (
            geo.segs.map((s, i) => <path key={i} d={s.d} fill="none" stroke={zoneColor(s.z)} strokeWidth={1.75} strokeLinejoin="round" />)
          ) : (
            <path d={geo.d} fill="none" stroke={stroke} strokeWidth={1.6} strokeLinejoin="round" />
          )}
          {geo.mk.map((m, i) => (
            <g key={i}>
              <line x1={m.x} x2={m.x} y1={geo.top - 4} y2={geo.bottom} stroke="rgb(var(--bad))" strokeDasharray="3 3" />
              <text x={m.x + 4} y={geo.top + 4} className="fill-bad font-mono text-[9px] font-semibold uppercase">
                {m.label}
              </text>
            </g>
          ))}
          <line x1={0} x2={geo.right} y1={geo.bottom} y2={geo.bottom} stroke="rgb(var(--line-2))" />
          {geo.ticks.map((t) => (
            <text key={t.m} x={t.x} y={height - 6} textAnchor="middle" className="fill-fg-4 font-mono text-[9px]">
              {t.m}′
            </text>
          ))}
          <text x={geo.right + 4} y={kind === 'pace' ? geo.top + 6 : geo.top + 6} className="fill-fg-3 font-mono text-[9px]">
            {format(kind === 'pace' ? geo.lo : geo.hi)}
          </text>
          <text x={geo.right + 4} y={geo.bottom} className="fill-fg-3 font-mono text-[9px]">
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
  highlight?: number
  marker?: { index: number; label: string }
  valueLabels?: boolean
  format?: (v: number) => string
}

export function Bars({ values, labels, colors, height = 120, highlight, marker, valueLabels, format = (v) => v.toFixed(0) }: BarsProps) {
  const [ref, w] = useMeasure<HTMLDivElement>()
  const max = Math.max(...values, 1)
  const labelH = labels ? 16 : 0
  const topH = valueLabels ? 14 : 4
  const plot = height - labelH - topH
  const n = values.length
  const gap = n > 30 ? 2 : 4
  const bw = w ? (w - gap * (n - 1)) / n : 0
  return (
    <div ref={ref} style={{ height }} className="w-full">
      {w > 0 && (
        <svg width={w} height={height} className="block overflow-visible">
          {values.map((v, i) => {
            const bh = Math.max(v > 0 ? 2 : 0, (v / max) * plot)
            const x = i * (bw + gap)
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={topH + plot - bh}
                  width={bw}
                  height={bh}
                  rx={Math.min(2, bw / 3)}
                  fill={colors?.[i] ?? (i === highlight ? 'rgb(var(--fg))' : 'rgb(var(--fg-4))')}
                />
                {valueLabels && v > 0 && (
                  <text x={x + bw / 2} y={topH + plot - bh - 4} textAnchor="middle" className="fill-fg-3 font-mono text-[9px]">
                    {format(v)}
                  </text>
                )}
                {labels?.[i] && (
                  <text x={x + bw / 2} y={height - 3} textAnchor="middle" className={`font-mono text-[9px] ${i === highlight ? 'fill-fg' : 'fill-fg-4'}`}>
                    {labels[i]}
                  </text>
                )}
              </g>
            )
          })}
          {marker && (
            <g>
              <line
                x1={marker.index * (bw + gap) - gap / 2}
                x2={marker.index * (bw + gap) - gap / 2}
                y1={0}
                y2={topH + plot}
                stroke="rgb(var(--bad))"
                strokeDasharray="3 3"
              />
              <text x={marker.index * (bw + gap) + 2} y={8} className="fill-bad font-mono text-[9px] font-semibold uppercase">
                {marker.label}
              </text>
            </g>
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
  format?: (v: number) => string
  xLabel?: (t: number) => string
  color?: string
  children?: ReactNode
}

/** Raw readings as dots, the rolling average as the line that matters. */
export function TrendChart({ points, avg, band, height = 170, format = (v) => v.toFixed(1), xLabel, color = 'rgb(var(--fg))' }: TrendProps) {
  const [ref, w] = useMeasure<HTMLDivElement>()
  const geo = useMemo(() => {
    if (!w || points.length < 2) return null
    const ts = points.map((p) => p.t)
    const vs = [...points.map((p) => p.v), ...(band ?? [])]
    const t0 = Math.min(...ts)
    const t1 = Math.max(...ts)
    let lo = Math.min(...vs)
    let hi = Math.max(...vs)
    const pad = (hi - lo) * 0.12 || 1
    lo -= pad
    hi += pad
    const left = 0
    const right = w - 40
    const top = 8
    const bottom = height - 20
    const X = (t: number) => left + ((t - t0) / (t1 - t0 || 1)) * (right - left)
    const Y = (v: number) => bottom - ((v - lo) / (hi - lo)) * (bottom - top)
    const line = (avg ?? []).map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join('')
    const last = avg?.length ? avg[avg.length - 1] : points[points.length - 1]
    const grid = [0.25, 0.5, 0.75].map((f) => lo + (hi - lo) * f)
    return { X, Y, line, last, t0, t1, lo, hi, right, top, bottom, grid }
  }, [points, avg, band, w, height])

  return (
    <div ref={ref} className="w-full" style={{ height }}>
      {geo && (
        <svg width={w} height={height} className="block overflow-visible">
          {geo.grid.map((g, i) => (
            <g key={i}>
              <line x1={0} x2={geo.right} y1={geo.Y(g)} y2={geo.Y(g)} stroke="rgb(var(--line))" />
              <text x={geo.right + 6} y={geo.Y(g) + 3} className="fill-fg-4 font-mono text-[9px]">
                {format(g)}
              </text>
            </g>
          ))}
          {band && <rect x={0} width={geo.right} y={geo.Y(band[1])} height={geo.Y(band[0]) - geo.Y(band[1])} fill="rgb(var(--fg) / 0.06)" />}
          {points.map((p, i) => (
            <circle key={i} cx={geo.X(p.t)} cy={geo.Y(p.v)} r={2} fill="rgb(var(--fg-4))" />
          ))}
          {geo.line && <path d={geo.line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          <circle cx={geo.X(geo.last.t)} cy={geo.Y(geo.last.v)} r={7} fill={color} opacity={0.18} />
          <circle cx={geo.X(geo.last.t)} cy={geo.Y(geo.last.v)} r={3.5} fill={color} />
          {xLabel && (
            <>
              <text x={0} y={height - 4} className="fill-fg-4 font-mono text-[9px]">
                {xLabel(geo.t0)}
              </text>
              <text x={geo.right} y={height - 4} textAnchor="end" className="fill-fg-4 font-mono text-[9px]">
                {xLabel(geo.t1)}
              </text>
            </>
          )}
        </svg>
      )}
    </div>
  )
}
