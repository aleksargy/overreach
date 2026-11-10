// The marks a stick of chalk makes: a loop round the number worth a look, an
// underline, a tick, shading. They're drawn as paths with a hand's wobble and
// overshoot, never filtered, so they stay sharp on a phone.

import { motion } from 'motion/react'
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'

/** A repeatable wobble: the same seed always draws the same mark. */
function wobble(seed: number) {
  let s = (Math.abs(Math.round(seed)) % 233_280) * 9301 + 49_297
  return () => ((s = (s * 9301 + 49_297) % 233_280), s / 233_280)
}

/** Smooth a run of points into one stroke. */
function stroke(pts: [number, number][]): string {
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
}

/** Once round an ellipse and a little further, drifting outwards: a loop drawn in one go that never quite closes. */
export function loopPath(w: number, h: number, seed = 1): string {
  const r = wobble(seed)
  const n = 26
  const start = -2.25 + r() * 0.3
  const pts: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const a = start + (i / n) * (Math.PI * 2 + 0.5)
    const out = (0.94 + (i / n) * 0.08) * (1 + (r() - 0.5) * 0.03)
    pts.push([w / 2 + Math.cos(a) * (w / 2) * out, h / 2 + Math.sin(a) * (h / 2) * out])
  }
  return stroke(pts)
}

/** A line under something, drawn left to right with a slight dip. */
export function underPath(w: number, seed = 1): string {
  const r = wobble(seed)
  const n = 5
  const pts: [number, number][] = []
  for (let i = 0; i <= n; i++) pts.push([1 + (i / n) * (w - 2), 3 + (r() - 0.5) * 1.6 + Math.sin((i / n) * Math.PI) * 0.8])
  return stroke(pts)
}

function useBox<T extends HTMLElement>(): [React.RefObject<T | null>, { w: number; h: number } | null] {
  const ref = useRef<T>(null)
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => setBox((b) => (b && b.w === el.offsetWidth && b.h === el.offsetHeight ? b : { w: el.offsetWidth, h: el.offsetHeight }))
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, box]
}

/**
 * The one thing on a screen worth a look, circled. Wrap the number itself;
 * the loop is drawn around it once the screen has settled.
 */
export function Circled({
  children,
  seed = 3,
  className = '',
  delay = 0.35,
  color = 'rgb(var(--mark))',
  on = true,
}: {
  children: ReactNode
  seed?: number
  className?: string
  delay?: number
  color?: string
  /** hold the loop back until something's finished, a count-up say */
  on?: boolean
}) {
  const [ref, box] = useBox<HTMLSpanElement>()
  const geo = useMemo(() => {
    if (!box) return null
    // an ellipse has to be a good deal bigger than the box it clears
    const w = box.w * 1.24 + 18
    const h = box.h * 1.3 + 12
    return { w, h, d: loopPath(w, h, seed) }
  }, [box, seed])
  return (
    <span ref={ref} className={`relative inline-block ${className}`}>
      {children}
      {on && geo && box && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute overflow-visible"
          width={geo.w}
          height={geo.h}
          style={{ left: (box.w - geo.w) / 2, top: (box.h - geo.h) / 2 }}
        >
          <motion.path
            d={geo.d}
            fill="none"
            stroke={color}
            strokeWidth={1.75}
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ pathLength: { duration: 0.6, delay, ease: [0.3, 0.1, 0.3, 1] }, opacity: { duration: 0.01, delay } }}
          />
        </svg>
      )}
    </span>
  )
}

/** A chalk line under whatever is picked: the tab you're on, the option you chose. */
export function Underline({ seed = 2, color = 'rgb(var(--fg))', className = '' }: { seed?: number; color?: string; className?: string }) {
  const [ref, box] = useBox<HTMLSpanElement>()
  return (
    <span ref={ref} aria-hidden="true" className={`pointer-events-none absolute inset-x-0 block h-[6px] ${className}`}>
      {box && (
        <svg width={box.w} height={6} className="block overflow-visible">
          <path d={underPath(box.w, seed)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
        </svg>
      )}
    </span>
  )
}

/** A tick, the way you'd chalk one: down a little, then up and away. */
export function Tick({ size = 20, className = '', strokeWidth = 2 }: { size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4.5 12.8c1.6 1.3 3 3 4.3 5.2C11.6 12.6 15.2 8 20 4.8" />
    </svg>
  )
}

/** Shading for chart bars and areas: diagonal strokes in one colour. Put it in an svg's defs and fill with url(#id). */
export function Hatch({ id, color = 'rgb(var(--fg))', opacity = 0.5, gap = 5 }: { id: string; color?: string; opacity?: number; gap?: number }) {
  return (
    <pattern id={id} width={gap} height={gap} patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
      <line x1="0" y1="0" x2={gap} y2="0" stroke={color} strokeOpacity={opacity} strokeWidth="1.1" />
    </pattern>
  )
}

/** Figures that tick over, each digit the same width: the display face has no tabular set, so a running clock would jitter. */
export function Digits({ children, className = '' }: { children: string | number; className?: string }) {
  return (
    <span className={className}>
      {[...String(children)].map((c, i) =>
        /\d/.test(c) ? (
          <span key={i} className="digit">
            {c}
          </span>
        ) : (
          c
        ),
      )}
    </span>
  )
}

/** Noughts and crosses, as on a tactics board: a nought for what went well, a cross for what didn't. */
export function Mark({ good, size = 13, className = '' }: { good: boolean; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      className={`${good ? 'text-z2' : 'text-z5'} ${className}`}
      aria-hidden="true"
    >
      {good ? <circle cx="7" cy="7" r="5" /> : <path d="M2.5 2.5l9 9M11.5 2.5l-9 9" />}
    </svg>
  )
}
