import { Pause, Play } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { useMeasure } from '../../components/charts/primitives'
import { GapChart } from '../../components/charts/running'
import { Screen } from '../../components/ui/Screen'
import { Empty, Section, Segmented } from '../../components/ui/bits'
import type { Activity, Stream } from '../../data/types'
import { loadStream, useWorld } from '../../data/world'
import { clock, fmt, km } from '../../lib/format'
import {
  biggestGain,
  coursesOf,
  gapTo,
  hrAlong,
  mineAt,
  pathOf,
  positionAt,
  ROUTE_STEP,
  stretchNeeded,
  theirsAt,
  timeAt,
  type Course,
  type Path,
  type Stretch,
} from '../../lib/ghost'

/** a race plays back in about this many seconds, however long it was */
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
  /** where it ran your course */
  s: Stretch
  /** its clock where the course starts, and its time over the course */
  start: number
  time: number
}

/** This run against your earlier runs where you both ran, played back together. */
export function GhostScreen() {
  const { id } = useParams()
  const w = useWorld()
  const a = id ? w.byId.get(id) : undefined
  const courses = useMemo(() => (a ? coursesOf(a, w.activities) : []), [a, w])
  const [pick, setPick] = useState(0)
  const course = courses[Math.min(pick, courses.length - 1)]
  const streams = useStreams(a && course ? [a, ...course.ghosts.map((g) => g.a)] : [])
  const field = useMemo(() => {
    const own = a && streams?.get(a.id)
    const you = own ? pathOf(own) : undefined
    if (!you || !course) return null
    const ghosts = course.ghosts.flatMap((s): Ghost[] => {
      const st = streams?.get(s.a.id)
      const p = st ? pathOf(st) : undefined
      if (!p) return []
      const start = timeAt(p, theirsAt(s, course.from))
      return [{ a: s.a, p, s, start, time: timeAt(p, theirsAt(s, course.to)) - start }]
    })
    return { you, ghosts }
  }, [a, streams, course])

  if (!a) {
    return (
      <Screen title="Ghosts" back>
        <Empty title="Not found">This run isn’t in your data any more.</Empty>
      </Screen>
    )
  }
  if (!course) {
    return (
      <Screen title="Ghosts" back>
        <Empty title="No ghosts here">
          None of your earlier runs shared {km(stretchNeeded(a.distanceM ?? 0), 0)} km or more of this one, the same way round. Run it again and you’ll have one to race.
        </Empty>
      </Screen>
    )
  }
  return (
    <Screen title="Ghosts" back bare>
      {courses.length > 1 && (
        <div className="pt-2">
          <Segmented
            size="sm"
            value={Math.min(pick, courses.length - 1)}
            onChange={setPick}
            options={courses.map((c, i) => ({ value: i, label: `${km(c.to - c.from, 1)} km, ${c.ghosts.length} ${c.ghosts.length === 1 ? 'run' : 'runs'}` }))}
          />
        </div>
      )}
      {!streams ? (
        <p className="meta pt-4">Loading your runs on this stretch…</p>
      ) : !field?.ghosts.length ? (
        <div className="pt-4">
          <Empty title="Your runs didn’t load">The runs to race didn’t come through. Try again when you have a better signal.</Empty>
        </div>
      ) : (
        <Race key={`${course.from}-${course.to}`} a={a} course={course} you={field.you} ghosts={field.ghosts} />
      )}
    </Screen>
  )
}

function Race({ a, course, you, ghosts }: { a: Activity; course: Course; you: Path; ghosts: Ghost[] }) {
  const mine = useMemo(() => {
    const start = timeAt(you, course.from)
    return { start, time: timeAt(you, course.to) - start }
  }, [you, course])
  const longest = Math.max(mine.time, ...ghosts.map((g) => g.time))
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

  // the quickest earlier run over the course is the one to beat
  const best = ghosts.reduce((b, g) => (g.time < b.time ? g : b), ghosts[0])
  const gaps = useMemo(() => ghosts.map((g) => ({ g, gap: gapTo(you, g.p, g.s, course) })), [you, ghosts, course])
  const vsBest = gaps.find((x) => x.g === best)!.gap
  const finish = vsBest[vsBest.length - 1].s
  const gain = biggestGain(vsBest)
  const hr = useMemo(() => [hrAlong(best.p, course, best.s), hrAlong(you, course)], [best, you, course])
  // everyone's clock starts where the course does
  const youAt = positionAt(you, mine.start + Math.min(t, mine.time))
  const at = (g: Ghost) => positionAt(g.p, g.start + Math.min(t, g.time))
  const field = [
    { key: 'you', label: 'This run', m: youAt.m, done: t >= mine.time, time: mine.time, you: true },
    ...ghosts.map((g) => ({ key: g.a.id, label: fmt(g.a.start, 'EEE d MMM'), m: mineAt(g.s, at(g).m), done: t >= g.time, time: g.time, you: false })),
  ].sort((x, y) => (x.done && y.done ? x.time - y.time : y.m - x.m))
  const dots = [...ghosts.map((g) => ({ key: g.a.id, ...at(g), best: g === best })), { key: 'you', ...youAt, you: true }]

  return (
    <>
      <div className="pt-2">
        <div className="meta">
          {course.from <= ROUTE_STEP && course.to >= you.d[you.d.length - 1] - ROUTE_STEP
            ? `${km(course.to, 1)} km`
            : `${km(course.from, 1)}–${km(course.to, 1)} km of ${km(you.d[you.d.length - 1], 1)} km`}{' '}
          · {fmt(a.start, 'EEE d MMM')}
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
          {gain && gain.s >= 5 ? `You gained most between ${(gain.from / 1000).toFixed(1)} and ${(gain.to / 1000).toFixed(1)} km.` : ''}
        </p>
      </div>

      <div className="card mt-6 overflow-hidden">
        <GhostMap you={you} course={course} dots={dots} />
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
            aria-label="Time into the stretch"
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
            from={course.from}
          />
          <p className="meta mt-3 leading-snug">
            Above the line you’re ahead, on moving time: stops don’t count. The bright line is your best run here; the faint ones are the rest.
          </p>
        </div>
      </Section>

      {hr[0].length > 3 && hr[1].length > 3 && (
        <Section title="Heart rate" action={<span className="meta">Along the stretch</span>}>
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
              from={course.from}
            />
            <p className="meta mt-3 leading-snug">This run against your best here. {hrNote(hr[1], hr[0], finish)}</p>
          </div>
        </Section>
      )}
    </>
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

/** The stretch, framed, with the rest of your run faint around it, and every runner where they were at this point in the race. */
function GhostMap({ you, course, dots }: { you: Path; course: Course; dots: { key: string; lat: number; lon: number; you?: boolean; best?: boolean }[] }) {
  const [ref, w] = useMeasure<HTMLDivElement>()
  const height = 240
  const geo = useMemo(() => {
    if (!w) return null
    const k = Math.cos((you.lat[0] * Math.PI) / 180)
    const on = you.d.map((d) => d >= course.from && d <= course.to)
    const xs = you.lon.map((v) => v * k).filter((_, i) => on[i])
    const ys = you.lat.map((v) => -v).filter((_, i) => on[i])
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const pad = 22
    const s = Math.min((w - pad * 2) / (x1 - x0 || 1e-9), (height - pad * 2) / (y1 - y0 || 1e-9))
    const ox = (w - (x1 - x0) * s) / 2
    const oy = (height - (y1 - y0) * s) / 2
    const P = (lat: number, lon: number) => [ox + (lon * k - x0) * s, oy + (-lat - y0) * s] as const
    const step = Math.max(1, Math.floor(you.lat.length / 700))
    const line = (keep: (i: number) => boolean) => {
      let d = ''
      let pen = false
      for (let i = 0; i < you.lat.length; i += step) {
        if (!keep(i)) {
          pen = false
          continue
        }
        const [px, py] = P(you.lat[i], you.lon[i])
        d += `${pen ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`
        pen = true
      }
      return d
    }
    return { P, run: line(() => true), stretch: line((i) => on[i]) }
  }, [you, course, w])
  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {geo && (
        <svg width={w} height={height} className="block" role="img" aria-label="The stretch you raced on, with each run where it was at this point in time">
          <path d={geo.run} fill="none" stroke="rgb(var(--fg) / 0.12)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          <path d={geo.stretch} fill="none" stroke="rgb(var(--fg) / 0.08)" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
          <path d={geo.stretch} fill="none" stroke="rgb(var(--fg) / 0.35)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          {dots.map((d) => {
            const [x, y] = geo.P(d.lat, d.lon)
            return d.you ? (
              <circle key={d.key} cx={x} cy={y} r={6.5} fill="rgb(var(--run))" stroke="rgb(var(--ink-1))" strokeWidth={2} />
            ) : (
              <circle key={d.key} cx={x} cy={y} r={d.best ? 5 : 4} fill={d.best ? 'rgb(var(--fg))' : 'rgb(var(--fg) / 0.4)'} stroke="rgb(var(--ink-1))" strokeWidth={1.5} />
            )
          })}
        </svg>
      )}
    </div>
  )
}
