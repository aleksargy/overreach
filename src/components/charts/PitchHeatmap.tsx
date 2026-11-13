import { useEffect, useRef } from 'react'
import type { Format } from '../../data/types'
import { PITCH } from '../../lib/football'
import { useMeasure } from './primitives'

const cssRgb = (name: string): [number, number, number] => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const [r, g, b] = raw.split(/\s+/).map(Number)
  return [r || 0, g || 0, b || 0]
}

/**
 * Where you were on the pitch: GPS points smoothed into a density field on a
 * small grid, then scaled up so the browser does the blur for free. A dark
 * pitch with its lines in graphite, and soft blobs going from sage to gold.
 */
export function PitchHeatmap({ points, format, flip }: { points: [number, number][]; format: Format; flip?: boolean }) {
  const [wrap, w] = useMeasure<HTMLDivElement>()
  const canvas = useRef<HTMLCanvasElement>(null)
  const [L, W] = PITCH[format]
  const h = Math.round(w * (W / L))

  useEffect(() => {
    const c = canvas.current
    if (!c || !w) return
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    c.width = w * dpr
    c.height = h * dpr
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const px = 1
    const py = 1
    const pw = w - 2
    const ph = h - 2
    const rgb = (name: string, a = 1) => `rgba(${cssRgb(name).join(',')},${a})`

    // the pitch, and its lines under the heat
    ctx.beginPath()
    ctx.roundRect(px, py, pw, ph, 8)
    ctx.fillStyle = rgb('--pitch')
    ctx.fill()
    ctx.save()
    ctx.clip()
    ctx.strokeStyle = rgb('--pitch-line')
    ctx.lineWidth = 1.5
    const sx = pw / L
    const sy = ph / W
    ctx.beginPath()
    ctx.moveTo(px + pw / 2, py)
    ctx.lineTo(px + pw / 2, py + ph)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(px + pw / 2, py + ph / 2, Math.min(W * 0.16, 9.15) * sy, 0, Math.PI * 2)
    ctx.stroke()
    for (const side of [0, 1]) {
      const x = side ? px + pw : px
      if (format <= 6) {
        ctx.beginPath()
        ctx.arc(x, py + ph / 2, W * 0.3 * sy, -Math.PI / 2, Math.PI / 2, side === 1)
        ctx.stroke()
      } else {
        const bd = (format <= 8 ? 10 : 16.5) * sx
        const bw = (format <= 8 ? W * 0.5 : 40.3) * sy
        ctx.strokeRect(side ? x - bd : x, py + ph / 2 - bw / 2, bd, bw)
        const sd = (format <= 8 ? 4 : 5.5) * sx
        const sw = (format <= 8 ? W * 0.25 : 18.3) * sy
        ctx.strokeRect(side ? x - sd : x, py + ph / 2 - sw / 2, sd, sw)
      }
    }

    // density grid
    const GX = 72
    const GY = Math.max(24, Math.round((GX * W) / L))
    const grid = new Float32Array(GX * GY)
    const R = 3
    const kernel: number[] = []
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) kernel.push(Math.exp(-(dx * dx + dy * dy) / (2 * 1.6 * 1.6)))
    for (const [u, v] of points) {
      const gx = Math.round((flip ? 1 - u : u) * (GX - 1))
      const gy = Math.round(v * (GY - 1))
      let k = 0
      for (let dy = -R; dy <= R; dy++)
        for (let dx = -R; dx <= R; dx++, k++) {
          const x = gx + dx
          const y = gy + dy
          if (x >= 0 && y >= 0 && x < GX && y < GY) grid[y * GX + x] += kernel[k]
        }
    }
    let max = 0
    for (const g of grid) max = Math.max(max, g)
    const sage = cssRgb('--football')
    const gold = cssRgb('--gold-head')
    const stops: [number, [number, number, number], number][] = [
      [0, sage, 0],
      [0.18, sage, 0.16],
      [0.45, sage, 0.45],
      [0.75, gold, 0.75],
      [1, gold, 0.92],
    ]
    const off = document.createElement('canvas')
    off.width = GX
    off.height = GY
    const octx = off.getContext('2d')!
    const img = octx.createImageData(GX, GY)
    for (let i = 0; i < grid.length; i++) {
      const t = max ? Math.pow(grid[i] / max, 0.75) : 0
      let j = 1
      while (j < stops.length - 1 && t > stops[j][0]) j++
      const [t0, c0, a0] = stops[j - 1]
      const [t1, c1, a1] = stops[j]
      const f = Math.max(0, Math.min(1, (t - t0) / (t1 - t0)))
      img.data[i * 4] = c0[0] + (c1[0] - c0[0]) * f
      img.data[i * 4 + 1] = c0[1] + (c1[1] - c0[1]) * f
      img.data[i * 4 + 2] = c0[2] + (c1[2] - c0[2]) * f
      img.data[i * 4 + 3] = 255 * (a0 + (a1 - a0) * f)
    }
    octx.putImageData(img, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(off, px, py, pw, ph)
    ctx.restore()
    ctx.beginPath()
    ctx.roundRect(px, py, pw, ph, 8)
    ctx.strokeStyle = rgb('--pitch-line')
    ctx.lineWidth = 1.5
    ctx.stroke()
  }, [points, format, flip, w, h, L, W])

  return (
    <div ref={wrap} className="relative w-full" style={{ height: h || undefined, aspectRatio: h ? undefined : `${L} / ${W}` }}>
      <canvas ref={canvas} style={{ width: w, height: h }} className="block" role="img" aria-label="Heatmap of where you played" />
    </div>
  )
}
