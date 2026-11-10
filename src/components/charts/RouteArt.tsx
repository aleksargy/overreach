import { useMemo } from 'react'
import type { Stream } from '../../data/types'
import { zoneOf } from '../../lib/load'
import { useMeasure, zoneColor } from './primitives'

/** The route as a line of chalk (no map tiles), coloured by HR zone: a dot where it started, a ring where it finished. */
export function RouteArt({ stream, bounds, height = 220, thin }: { stream: Stream; bounds: number[]; height?: number; thin?: boolean }) {
  const [ref, w] = useMeasure<HTMLDivElement>()
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
          {paths.segs.map((sg, i) => (
            <path key={i} d={sg.d} fill="none" stroke={zoneColor(sg.z)} strokeWidth={thin ? 1.75 : 2.25} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          <circle cx={paths.end[0]} cy={paths.end[1]} r={6} fill="rgb(var(--ink-0))" stroke="rgb(var(--fg))" strokeWidth={1.75} />
          <circle cx={paths.start[0]} cy={paths.start[1]} r={3.5} fill="rgb(var(--fg))" />
        </svg>
      )}
    </div>
  )
}
