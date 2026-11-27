import { Pause, Play } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { cssRgb, pitchBase, pitchEdge } from '../../components/charts/PitchHeatmap'
import { useMeasure } from '../../components/charts/primitives'
import { Section } from '../../components/ui/bits'
import type { Format, Stream } from '../../data/types'
import { HI_MPS, PITCH, SPRINT_MPS, replayOf } from '../../lib/football'

/** the whole game plays back in this many seconds */
const PLAY_S = 40
/** the trail behind the dot, in seconds of play */
const TRAIL_S = 120
/** an arrow key moves this many seconds of play */
const STEP_S = 60

/**
 * Your game played back on the pitch, from the watch's GPS: a dot for you, the last two minutes of play trailing
 * behind it, brighter the faster you went and sage at a sprint. Under it the play button, the minute played, and a
 * track for each half, a tick on it for every sprint; drag along it to go anywhere in the game. Placed the way the
 * heatmap above it is, turned round with it, and minutes are minutes played, without half time.
 */
export function MatchReplay({ stream, format, flip }: { stream: Stream; format: Format; flip?: boolean }) {
  const r = useMemo(() => replayOf(stream), [stream])
  const [wrap, w] = useMeasure<HTMLDivElement>()
  const canvas = useRef<HTMLCanvasElement>(null)
  const halves = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)]
  const [t, setT] = useState(0)
  // where the replay is, for the frames of play to go on from (the state is what's drawn)
  const now = useRef(0)
  const move = (x: number) => {
    now.current = x
    setT(x)
  }
  const [playing, setPlaying] = useState(false)
  const [L, W] = PITCH[format]
  const h = Math.round(w * (W / L))
  const n = r?.x.length ?? 0
  const at = Math.min(Math.max(0, n - 1), Math.floor(t))

  // play: the game in PLAY_S seconds, from the start again once it's over
  useEffect(() => {
    if (!playing || !n) return
    let last = 0
    let id = requestAnimationFrame(function frame(ts) {
      const next = Math.min(n - 1, now.current + (last ? ((ts - last) / 1000) * (n / PLAY_S) : 0))
      last = ts
      move(next)
      if (next >= n - 1) return setPlaying(false)
      id = requestAnimationFrame(frame)
    })
    // a replay doesn't run on in a hidden app
    const hide = () => document.visibilityState === 'hidden' && setPlaying(false)
    document.addEventListener('visibilitychange', hide)
    return () => {
      cancelAnimationFrame(id)
      document.removeEventListener('visibilitychange', hide)
    }
  }, [playing, n])

  useEffect(() => {
    const c = canvas.current
    if (!c || !w || !r) return
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    c.width = w * dpr
    c.height = h * dpr
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const [px, py, pw, ph] = [1, 1, w - 2, h - 2]
    const X = (i: number) => px + (flip ? 1 - r.x[i] : r.x[i]) * pw
    const Y = (i: number) => py + r.y[i] * ph
    // the colours read once a frame, not once a stroke
    const [fg, sage] = [cssRgb('--fg').join(','), cssRgb('--football').join(',')]
    const rgba = (c: string, a: number) => `rgba(${c},${a.toFixed(3)})`
    pitchBase(ctx, px, py, pw, ph, format)
    // the last two minutes, not back across half time: fading with age, sage when you ran, solid at a sprint
    const from = Math.max(at >= r.half ? r.half : 0, at - Math.round(TRAIL_S / r.dt))
    ctx.lineCap = 'butt'
    for (let i = from + 1; i <= at; i++) {
      const age = (i - from) / (at - from + 1)
      const v = r.v[i]
      ctx.strokeStyle = v >= SPRINT_MPS ? rgba(sage, 0.2 + 0.8 * age) : v > HI_MPS ? rgba(sage, 0.1 + 0.6 * age) : rgba(fg, 0.06 + 0.4 * age)
      ctx.lineWidth = v >= SPRINT_MPS ? 3.5 : 2.5
      ctx.beginPath()
      ctx.moveTo(X(i - 1), Y(i - 1))
      ctx.lineTo(X(i), Y(i))
      ctx.stroke()
    }
    ctx.fillStyle = rgba(r.v[at] >= SPRINT_MPS ? sage : fg, 1)
    ctx.beginPath()
    ctx.arc(X(at), Y(at), 5.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    pitchEdge(ctx, px, py, pw, ph)
  }, [r, at, w, h, flip, format])

  if (!r || n < 60) return null
  const total = Math.ceil((n * r.dt) / 60)
  const minute = Math.min(total, Math.floor((at * r.dt) / 60) + 1)
  const sprinting = r.v[at] >= SPRINT_MPS
  const lengths = [r.half, n - r.half]

  // where along the track a press is: the half it's on, and how far into it
  const seek = (e: PointerEvent<HTMLDivElement>) => {
    const [a, b] = halves.map((x) => x.current?.getBoundingClientRect())
    if (!a || !b) return
    const into = e.clientX <= a.right + (b.left - a.right) / 2 ? (e.clientX - a.left) / a.width : (e.clientX - b.left) / b.width
    const k = e.clientX <= a.right + (b.left - a.right) / 2 ? 0 : 1
    move(Math.round((k ? r.half : 0) + Math.max(0, Math.min(1, into)) * lengths[k]))
  }
  const toggle = () => {
    if (!playing && at >= n - 1) move(0)
    setPlaying(!playing)
  }

  return (
    <Section title="Replay" action={sprinting && <span className="label num tabular-nums">{Math.round(r.v[at] * 3.6)} km/h</span>}>
      <div ref={wrap} className="relative w-full" style={{ height: h || undefined, aspectRatio: h ? undefined : `${L} / ${W}` }}>
        <canvas ref={canvas} style={{ width: w, height: h }} className="block" role="img" aria-label={`Where you were in minute ${minute}`} />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} className="round">
          {playing ? <Pause size={16} fill="currentColor" strokeWidth={0} /> : <Play size={16} fill="currentColor" strokeWidth={0} className="translate-x-px" />}
        </button>
        <span className="num w-[44px] shrink-0 text-[20px] leading-none tabular-nums">{minute}′</span>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Minute of the game"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={minute}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            setPlaying(false)
            seek(e)
          }}
          onPointerMove={(e) => e.buttons && seek(e)}
          onKeyDown={(e) => {
            const step = Math.round(STEP_S / r.dt)
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              e.preventDefault()
              move(Math.max(0, Math.min(n - 1, Math.floor(now.current) + (e.key === 'ArrowRight' ? step : -step))))
            }
          }}
          className="flex h-7 min-w-0 flex-1 cursor-pointer touch-none items-center gap-[5px]"
        >
          {lengths.map((len, k) => {
            const start = k ? r.half : 0
            const done = Math.max(0, Math.min(1, (at - start) / Math.max(1, len - 1)))
            return (
              <div key={k} ref={halves[k]} className="relative flex h-full min-w-0 items-center" style={{ flexGrow: len, flexBasis: 0 }}>
                {/* a tick for every sprint in the half */}
                {r.sprints
                  .filter((i) => i >= start && i < start + len)
                  .map((i) => (
                    <span key={i} className="absolute top-0.5 h-1 w-0.5 rounded-full bg-football/80" style={{ left: `${((i - start) / len) * 100}%` }} />
                  ))}
                <div className="h-2 w-full overflow-hidden rounded-full bg-football/[0.16]">
                  <div className="h-full rounded-full bg-football" style={{ width: `${done * 100}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Section>
  )
}
