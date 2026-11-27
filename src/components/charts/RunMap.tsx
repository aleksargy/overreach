import { useMemo } from 'react'
import type { RunMap } from '../../lib/routes'
import { useMeasure } from './primitives'

/** the drawing's height (px): as its runs' shape asks, between these */
const LOW = 160
const HIGH = 340
/** room around the routes (px) */
const PAD = 10

/**
 * Runs drawn on one map, north up and with no map underneath: each route a thin line in the run colour, faint on its
 * own and brighter where routes run over each other, so the streets you run most stand out. A dot where most start.
 */
export function RunMapDrawing({ map }: { map: RunMap }) {
  const [ref, w] = useMeasure<HTMLDivElement>()
  const [x0, y0, x1, y1] = map.box
  const bw = Math.max(1, x1 - x0)
  const bh = Math.max(1, y1 - y0)
  const h = w ? Math.round(Math.min(HIGH, Math.max(LOW, ((w - 2 * PAD) * bh) / bw + 2 * PAD))) : 0
  const drawn = useMemo(() => {
    if (!w || !h) return null
    // metres to pixels, the routes centred in the drawing
    const k = Math.min((w - 2 * PAD) / bw, (h - 2 * PAD) / bh)
    const ox = (w - bw * k) / 2
    const oy = (h - bh * k) / 2
    const X = (x: number) => (ox + (x - x0) * k).toFixed(1)
    const Y = (y: number) => (h - oy - (y - y0) * k).toFixed(1)
    const paths = map.routes.map((r) => {
      let d = ''
      for (let i = 0; i + 1 < r.length; i += 2) d += `${i ? 'L' : 'M'}${X(r[i])},${Y(r[i + 1])}`
      return d
    })
    return { paths, home: map.home && ([X(map.home[0]), Y(map.home[1])] as const) }
  }, [map, w, h, bw, bh, x0, y0])

  return (
    <div ref={ref} className="w-full" style={{ height: h || LOW }}>
      {drawn && (
        <svg width={w} height={h} className="block" role="img" aria-label={`${map.runs} runs drawn on one map`}>
          <g fill="none" stroke="rgb(var(--run))" strokeWidth={2} strokeOpacity={0.3} strokeLinecap="round" strokeLinejoin="round">
            {drawn.paths.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
          {drawn.home && <circle cx={drawn.home[0]} cy={drawn.home[1]} r={4.5} fill="rgb(var(--fg))" />}
        </svg>
      )}
    </div>
  )
}
