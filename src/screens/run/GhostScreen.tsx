import { Pause, Play } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { useMeasure } from '../../components/charts/primitives'
import { GapChart } from '../../components/charts/running'
import { Screen } from '../../components/ui/Screen'
import { Empty, Section } from '../../components/ui/bits'
import type { Activity, Stream } from '../../data/types'
import { loadStream, useWorld } from '../../data/world'
import { clock, fmt, km } from '../../lib/format'
import { bestStretch, gapTo, ghostCandidates, hrAlong, pathOf, positionAt, sameRoute, type Path } from '../../lib/ghost'

/** a whole run plays back in about this many seconds, however long it was */
const PLAY_S = 24

function useStreams(list: Activity[]): Map<string, Stream> | null {
  const [got, setGot] = useState<Map<string, Stream> | null>(null)
  const key = list.map((a) => a.id).join()
  useEffect(() => {
    let alive = true
    setGot(null)
    void Promise.all(list.map((a) => loadStream(a).then((s) => [a.id, s] as const))).then((r) => alive && setGot(new Map(r.filter((x): x is [string, Stream] => !!x[1]))))
    return () => {
      alive = false
    }
  }, [key])
  return got
}

interface Ghost {
  a: Activity
  p: Path
}

/** This run against every earlier run on the same route, played back together. */
export function GhostScreen() {
  const { id } = useParams()
  const w = useWorld()
  const a = id ? w.byId.get(id) : undefined
  const candidates = useMemo(() => (a ? ghostCandidates(a, w.activities) : []), [a, w])
  const streams = useStreams(a ? [a, ...candidates] : [])
  const field = useMemo(() => {
    const own = a && streams?.get(a.id)
    const you = own ? pathOf(own) : undefined
    if (!a || !you) return null
    const ghosts = candidates.flatMap((c): Ghost[] => {
      const s = streams?.get(c.id)
      const p = s ? pathOf(s) : undefined
      return p && sameRoute(you, p) ? [{ a: c, p }] : []
    })
    return { you, ghosts }
  }, [a, streams, candidates])

  if (!a) {
    return (
      <Screen title="Ghosts" back>
        <Empty title="Not found">This run isn’t in your data any more.</Empty>
      </Screen>
    )
  }
  if (!streams) {
    return (
      <Screen title="Ghosts" back>
        <p className="meta pt-4">Loading your past runs on this route…</p>
      </Screen>
    )
  }
  if (!field || !field.ghosts.length) {
    return (
      <Screen title="Ghosts" back>
        <Empty title="No ghosts on this route">None of your runs of about this distance went the same way round. Run it again and you’ll have one to race.</Empty>
      </Screen>
    )
  }
  return <Race a={a} you={field.you} ghosts={field.ghosts} />
}

function Race({ a, you, ghosts }: { a: Activity; you: Path; ghosts: Ghost[] }) {
  const end = (p: Path) => p.t[p.t.length - 1]
  const longest = Math.max(end(you), ...ghosts.map((g) => end(g.p)))
  // it opens on the finish, with the result; play runs it again from the start
  const [t, setT] = useState(longest)
  const [playing, setPlaying] = useState(false)
  const last = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = (now: number) => {
      const dt = last.current === undefined ? 0 : (now - last.current) / 1000
      last.current = now
      setT((x) => {
        const next = Math.min(longest, x + (dt * longest) / PLAY_S)
        if (next >= longest) setPlaying(false)
        return next
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      last.current = undefined
    }
  }, [playing, longest])

  // the fastest earlier run on the route is the one to beat
  const best = ghosts.reduce((b, g) => (end(g.p) < end(b.p) ? g : b), ghosts[0])
  const gaps = useMemo(() => ghosts.map((g) => ({ g, gap: gapTo(you, g.p) })), [you, ghosts])
  const vsBest = gaps.find((x) => x.g === best)!.gap
  const finish = vsBest[vsBest.length - 1].s
  const stretch = bestStretch(vsBest)
  const hr = useMemo(() => [hrAlong(best.p, you), hrAlong(you, you)], [best, you])
  const youAt = positionAt(you, you, t)
  const field = [
    { key: 'you', label: 'This run', date: a.start, m: youAt.m, done: t >= end(you), time: end(you), you: true },
    ...ghosts.map((g) => ({ key: g.a.id, label: fmt(g.a.start, 'EEE d MMM'), date: g.a.start, m: positionAt(g.p, you, t).m, done: t >= end(g.p), time: end(g.p), you: false })),
  ].sort((x, y) => (x.done && y.done ? x.time - y.time : y.m - x.m))

  return (
    <Screen title="Ghosts" back bare>
      <div className="pt-2">
        <div className="meta">
          {km(you.d[you.d.length - 1], 1)} km · {fmt(a.start, 'EEE d MMM')}
        </div>
        <h1 className="mt-2 text-balance text-[28px] font-semibold leading-[1.12] tracking-[-0.03em]">
          {ghosts.length === 1 ? 'You against your last run here' : `You against ${ghosts.length} earlier runs here`}
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed text-fg-2">
          {Math.abs(finish) < 1
            ? `Dead level with your best here, ${fmt(best.a.start, 'd MMM')}.`
            : finish > 0
              ? `${clock(finish)} quicker than your best here, ${fmt(best.a.start, 'd MMM')}.`
              : `${clock(-finish)} off your best here, ${fmt(best.a.start, 'd MMM')}.`}{' '}
          {stretch && stretch.s >= 5 ? `You gained most between ${(stretch.from / 1000).toFixed(1)} and ${(stretch.to / 1000).toFixed(1)} km.` : ''}
        </p>
      </div>

      <div className="card mt-6 overflow-hidden">
        <GhostMap you={you} ghosts={ghosts} t={t} best={best} />
        <div className="flex items-center gap-3 border-t border-line px-4 py-3">
          <button
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={() => (t >= longest ? (setT(0), setPlaying(true)) : setPlaying((x) => !x))}
            className="press grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fg text-ink-0"
          >
            {playing ? <Pause size={17} strokeWidth={2.25} /> : <Play size={17} strokeWidth={2.25} className="ml-0.5" />}
          </button>
          <input
            type="range"
            min={0}
            max={longest}
            step={1}
            value={t}
            aria-label="Time into the run"
            onChange={(e) => {
              setPlaying(false)
              setT(Number(e.target.value))
            }}
            className="feel w-full"
            style={{ ['--p' as string]: `${(t / longest) * 100}%` }}
          />
          <span className="w-14 shrink-0 text-right text-[14px] font-medium tabular-nums">{clock(t)}</span>
        </div>
      </div>

      <div className="card list mt-2 overflow-hidden">
        {field.map((x, i) => {
          const ahead = x.m - youAt.m
          return (
            <div key={x.key} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-4 text-[13px] tabular-nums text-fg-4">{i + 1}</span>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${x.you ? 'bg-run' : x.key === best.a.id ? 'bg-fg' : 'bg-fg-4'}`} />
              <span className={`min-w-0 flex-1 truncate text-[15px] ${x.you ? 'font-semibold' : 'text-fg-2'}`}>{x.label}</span>
              <span className="text-[14px] tabular-nums text-fg-3">
                {x.done ? clock(x.time) : x.you ? `${km(x.m, 2)} km` : `${ahead >= 0 ? '+' : '−'}${Math.round(Math.abs(ahead))} m`}
              </span>
            </div>
          )
        })}
      </div>

      <Section title="Where the time went" action={<span className="meta">Against each ghost</span>}>
        <div className="card p-4">
          <GapChart
            lines={[...gaps.filter((x) => x.g !== best).map((x) => ({ pts: x.gap, color: 'rgb(var(--fg) / 0.22)' })), { pts: vsBest, color: 'rgb(var(--run))', width: 2 }]}
            height={160}
            at={youAt.m}
          />
          <p className="meta mt-3 leading-snug">Above the line you’re ahead. The bright line is your best run here; the faint ones are the rest.</p>
        </div>
      </Section>

      {hr[0].length > 3 && hr[1].length > 3 && (
        <Section title="Heart rate" action={<span className="meta">Along the route</span>}>
          <div className="card p-4">
            <GapChart
              zero={false}
              format={(v) => `${Math.round(v)}`}
              lines={[
                { pts: hr[0], color: 'rgb(var(--fg) / 0.4)' },
                { pts: hr[1], color: 'rgb(var(--run))', width: 2 },
              ]}
              height={140}
              at={youAt.m}
            />
            <p className="meta mt-3 leading-snug">This run against your best here. {hrNote(hr[1], hr[0], finish)}</p>
          </div>
        </Section>
      )}
    </Screen>
  )
}

/** Faster with less heart rate is fitness; faster with more is just trying harder. */
function hrNote(you: { s: number }[], best: { s: number }[], ahead: number): string {
  const mean = (xs: { s: number }[]) => xs.reduce((a, x) => a + x.s, 0) / xs.length
  const diff = Math.round(mean(you) - mean(best))
  const hr = Math.abs(diff) < 2 ? 'about the same heart rate' : `${Math.abs(diff)} bpm ${diff > 0 ? 'higher' : 'lower'} on average`
  if (Math.abs(ahead) < 1) return `Level, at ${hr}.`
  if (ahead > 0 && diff < 2) return `Quicker at ${hr}: that’s fitness.`
  if (ahead < 0 && diff > 1) return `Slower at ${hr}: a tired day, or a hot one.`
  return `${ahead > 0 ? 'Quicker' : 'Slower'}, at ${hr}.`
}

/** The route on a dot grid, with you and every ghost where you each were `t` seconds in. */
function GhostMap({ you, ghosts, t, best }: { you: Path; ghosts: Ghost[]; t: number; best: Ghost }) {
  const [ref, w] = useMeasure<HTMLDivElement>()
  const height = 240
  const geo = useMemo(() => {
    if (!w) return null
    const k = Math.cos((you.lat[0] * Math.PI) / 180)
    const xs = you.lon.map((v) => v * k)
    const ys = you.lat.map((v) => -v)
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const pad = 22
    const s = Math.min((w - pad * 2) / (x1 - x0 || 1e-9), (height - pad * 2) / (y1 - y0 || 1e-9))
    const ox = (w - (x1 - x0) * s) / 2
    const oy = (height - (y1 - y0) * s) / 2
    const P = (lat: number, lon: number) => [ox + (lon * k - x0) * s, oy + (-lat - y0) * s] as const
    const step = Math.max(1, Math.floor(you.lat.length / 700))
    let d = ''
    for (let i = 0; i < you.lat.length; i += step) {
      const [px, py] = P(you.lat[i], you.lon[i])
      d += `${d ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`
    }
    return { P, d }
  }, [you, w])
  const dot = (p: Path) => {
    const at = positionAt(p, you, t)
    return geo!.P(at.lat, at.lon)
  }
  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {geo && (
        <svg width={w} height={height} className="block" role="img" aria-label="Your route, with each run where it was at this point in time">
          <path d={geo.d} fill="none" stroke="rgb(var(--fg) / 0.08)" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
          <path d={geo.d} fill="none" stroke="rgb(var(--fg) / 0.3)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          {ghosts.map((g) => {
            const [x, y] = dot(g.p)
            return (
              <circle
                key={g.a.id}
                cx={x}
                cy={y}
                r={g === best ? 5 : 4}
                fill={g === best ? 'rgb(var(--fg))' : 'rgb(var(--fg) / 0.4)'}
                stroke="rgb(var(--ink-1))"
                strokeWidth={1.5}
              />
            )
          })}
          {(() => {
            const [x, y] = dot(you)
            return <circle cx={x} cy={y} r={6.5} fill="rgb(var(--run))" stroke="rgb(var(--ink-1))" strokeWidth={2} />
          })()}
        </svg>
      )}
    </div>
  )
}
