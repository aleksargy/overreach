import { useEffect, useRef, useState } from 'react'

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Counts up to `value` when it first renders (and eases to new values after). */
export function Ticker({ value, dp = 0, duration = 900, delay = 0, format, className }: { value: number; dp?: number; duration?: number; delay?: number; format?: (v: number) => string; className?: string }) {
  const [shown, setShown] = useState(() => (reduced() ? value : 0))
  const from = useRef(shown)
  useEffect(() => {
    if (reduced()) {
      setShown(value)
      return
    }
    let raf = 0
    const start = performance.now() + delay
    const a = from.current
    const tick = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - start) / duration))
      const e = 1 - Math.pow(1 - p, 3)
      const v = a + (value - a) * e
      setShown(v)
      from.current = v
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration, delay])
  return <span className={className}>{format ? format(shown) : shown.toFixed(dp)}</span>
}
