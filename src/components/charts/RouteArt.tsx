import { useMemo, useRef } from 'react'
import type { Stream } from '../../data/types'
import { zoneOf } from '../../lib/load'
import { useMeasure, zoneColor } from './primitives'

/** The route drawn on a dot grid (no map tiles), coloured by HR zone. */
export function RouteArt({ stream, bounds, height = 220, thin }: { stream: Stream; bounds: number[]; height?: number; thin?: boolean }) {
  const [ref, w] = useMeasure<HTMLDivElement>()
  const pid = useRef(`p${Math.random().toString(36).slice(2, 8)}`).current
  const paths = useMemo(() => {
    const lat = stream.lat ?? []
    const lon = stream.lon ?? []
    if (lat.length < 2 || !w) return null
    const lat0 = lat.reduce((a, b) => a + b, 0) / lat.length
    const k = Math.cos((lat0 * Math.PI) / 180)
    const xs = lon.map((v) => v * k)
    const ys = lat.map((v) => -v)
    const x0 = Math.min(...xs)
    const x1 = Math.max(...xs)
    const y0 = Math.min(...ys)
    const y1 = Math.max(...ys)
    const pad = 18
    const s = Math.min((w - pad * 2) / (x1 - x0 || 1e-9), (height - pad * 2) / (y1 - y0 || 1e-9))
    const ox = (w - (x1 - x0) * s) / 2
    const oy = (height - (y1 - y0) * s) / 2
    const P = (i: number) => [ox + (xs[i] - x0) * s, oy + (ys[i] - y0) * s] as const
    const hr = stream.hr ?? []
    const segs: { z: number; d: string }[] = []
    let cur: { z: number; d: string } | null = null
    const step = Math.max(1, Math.floor(lat.length / 900))
    for (let i = 0; i < lat.length; i += step) {
      const z = hr[i] ? zoneOf(hr[i], bounds) : 1
      const [px, py] = P(i)
      if (!cur || cur.z !== z) {
        if (cur) {
          cur.d += `L${px.toFixed(1)},${py.toFixed(1)}`
          segs.push(cur)
        }
        cur = { z, d: `M${px.toFixed(1)},${py.toFixed(1)}` }
      } else cur.d += `L${px.toFixed(1)},${py.toFixed(1)}`
    }
    if (cur) segs.push(cur)
    const all = segs.map((sg) => sg.d).join('')
    return { segs, all, start: P(0), end: P(lat.length - 1) }
  }, [stream, bounds, w, height])

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {paths && (
        <svg width={w} height={height} className="block" role="img" aria-label="Route, coloured by heart rate zone">
          <defs>
            <pattern id={pid} width="14" height="14" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.9" fill="rgb(var(--fg) / 0.09)" />
            </pattern>
          </defs>
          <rect width={w} height={height} fill={`url(#${pid})`} />
          <path d={paths.all} fill="none" stroke="rgb(var(--fg) / 0.08)" strokeWidth={thin ? 6 : 10} strokeLinecap="round" strokeLinejoin="round" />
          {paths.segs.map((sg, i) => (
            <path key={i} d={sg.d} fill="none" stroke={zoneColor(sg.z)} strokeWidth={thin ? 2 : 3} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          <circle cx={paths.end[0]} cy={paths.end[1]} r={6} fill="none" stroke="rgb(var(--fg))" strokeWidth={2} />
          <circle cx={paths.start[0]} cy={paths.start[1]} r={3.5} fill="rgb(var(--fg))" />
        </svg>
      )}
    </div>
  )
}
