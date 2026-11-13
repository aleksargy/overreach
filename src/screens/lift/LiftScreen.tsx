import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { ChevronRight, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { IconButton, Screen } from '../../components/ui/Screen'
import { StandoutLine } from '../../components/ui/Standout'
import { Empty, SampleBadge, Section, inputCls } from '../../components/ui/bits'
import { MUSCLES } from '../../data/exercises'
import { useStore } from '../../data/store'
import type { Muscle, Routine } from '../../data/types'
import { useUi } from '../../data/ui'
import { useWorld, type World } from '../../data/world'
import { amount, focusOf, historyFor, lastDone, nextRoutine, progressOf, recordsIn, targetFor, targetText, topOf } from '../../lib/lift'
import { uid } from '../../lib/rng'
import { EQUIPMENT_LABEL, MUSCLE_LABEL, MoveNote, WorkoutRow, daysAgo, useBegin } from './parts'

/** How long ago a workout was last done, in days; undefined if never. */
const sinceDone = (r: Routine, w: World) => {
  const last = lastDone(r, w.workouts)
  return last ? differenceInCalendarDays(w.now, parseISO(last.start)) : undefined
}

/** Make a blank workout and open it for editing. */
export function useNewWorkout() {
  const save = useStore((s) => s.saveRoutine)
  const nav = useNavigate()
  return () => {
    const id = `r-${uid()}`
    save({ id, name: 'New workout', focus: '', items: [] })
    nav(`/lift/workout/${id}?edit=1`)
  }
}

/** Lifting: what to do next, your workouts, and how the weights are moving. */
export function LiftScreen() {
  const w = useWorld()
  const active = useStore((s) => s.active)
  const create = useNewWorkout()
  const next = useMemo(() => nextRoutine(w.routines, w.workouts), [w])
  // a workout that was started and left with nothing in it is tidied away on the way back here
  useEffect(() => {
    const { routines, deleteRoutine } = useStore.getState()
    for (const r of routines) if (!r.items.length) deleteRoutine(r.id)
  }, [])
  const month = w.workouts.filter((x) => differenceInCalendarDays(w.now, parseISO(x.start)) < 28).length
  return (
    <Screen
      title="Lift"
      kicker={
        <span className="flex items-center gap-2">
          {w.workouts.length ? `${month} ${month === 1 ? 'session' : 'sessions'} in 4 weeks` : 'Your workouts, and what to lift'} {w.mode === 'sample' && <SampleBadge />}
        </span>
      }
      actions={
        <IconButton label="New workout" onClick={create} active>
          <Plus size={18} strokeWidth={2.2} />
        </IconButton>
      }
    >
      {active ? (
        <InProgress />
      ) : next ? (
        <NextUp w={w} routine={next} />
      ) : (
        <section className="hero flex flex-col gap-1 bg-strength-tint">
          <h2 className="text-[13px] font-bold text-strength-label">Start here</h2>
          <p className="display mt-1 text-balance text-[44px] font-extrabold leading-none tracking-[-0.035em] text-strength-head">Make your first workout</p>
          <p className="mt-2 text-[14px] leading-snug text-strength-head/80">Your exercises, in the order you do them. From the second session it tells you what to lift.</p>
          <button onClick={create} className="btn mt-3 w-full bg-strength-head font-extrabold text-ink-0">
            New workout
          </button>
        </section>
      )}
      {w.news.lift && !active && <StandoutLine s={w.news.lift} className="mt-2.5" />}
      <Workouts w={w} next={active ? undefined : next?.id} onNew={create} />
      <ProgressList w={w} />
      {w.workouts.length > 0 && (
        <Section
          title="Recent"
          action={
            <Link to="/lift/history" className="link">
              History <ChevronRight size={14} strokeWidth={2.2} />
            </Link>
          }
        >
          <div className="list">
            {w.workouts.slice(0, 3).map((x) => (
              <WorkoutRow key={x.id} w={x} records={recordsIn(x, w.workouts, w.exerciseById).length} />
            ))}
          </div>
        </Section>
      )}
    </Screen>
  )
}

/** The workout that's waited longest, on the lilac tint, with what to lift on every exercise. */
function NextUp({ w, routine }: { w: World; routine: Routine }) {
  const begin = useBegin()
  const since = sinceDone(routine, w)
  const focus = focusOf(routine, w.exerciseById)
  return (
    <section className="hero flex flex-col gap-1 bg-strength-tint">
      <div className="flex items-center justify-between gap-3 text-strength-label">
        <h2 className="text-[13px] font-bold">Next up</h2>
        <span className="text-[12.5px] font-semibold">{since === undefined ? 'Not done yet' : `Last done ${daysAgo(since).toLowerCase()}`}</span>
      </div>
      <Link to={`/lift/workout/${routine.id}`} className="press mt-1 block">
        <h3 className="display text-balance text-[44px] font-extrabold leading-none tracking-[-0.035em] text-strength-head">{routine.name}</h3>
      </Link>
      {focus && <span className="mb-2.5 text-[13px] text-strength-head/80">{focus}</span>}
      <Targets w={w} routine={routine} tinted />
      <button onClick={() => begin(routine)} className="btn mt-2.5 w-full bg-strength-head font-extrabold text-ink-0">
        Start workout
      </button>
    </section>
  )
}

/** A workout's exercises, each with its sets, the rule in play and the weight and reps to go for. `tinted` sets it on the lilac hero. */
export function Targets({ w, routine, className = '', tinted }: { w: World; routine: Routine; className?: string; tinted?: boolean }) {
  return (
    <div className={`${tinted ? '' : 'list ruled'} ${className}`}>
      {routine.items.map((it, i) => {
        const ex = w.exerciseById.get(it.exerciseId)
        if (!ex) return null
        const t = targetFor(ex, historyFor(ex.id, w.workouts))
        return (
          <Link
            key={`${it.exerciseId}-${i}`}
            to={`/lift/exercise/${ex.id}`}
            className={`flex items-center gap-3 transition-colors duration-150 ${tinted ? 'border-t border-strength/[0.14] py-[9px]' : 'py-[10px] active:bg-ink-2'}`}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-bold leading-5">{ex.name}</span>
              <span className={`block text-[12px] ${tinted ? 'text-strength-head/80' : 'text-fg-3'}`}>
                {it.sets} {it.sets === 1 ? 'set' : 'sets'} · <MoveNote t={t} plain={tinted} />
              </span>
            </span>
            <span className={`num shrink-0 text-right text-[18px] ${tinted ? 'text-strength-head' : ''}`}>{targetText(ex, t)}</span>
          </Link>
        )
      })}
    </div>
  )
}

function InProgress() {
  const active = useStore((s) => s.active)!
  const setOpen = useUi((s) => s.setWorkoutOpen)
  const done = active.exercises.reduce((a, we) => a + we.sets.filter((s) => s.done).length, 0)
  const total = active.exercises.reduce((a, we) => a + we.sets.length, 0)
  return (
    <section className="hero flex flex-col gap-1 bg-strength-tint">
      <h2 className="flex items-center gap-2 text-[13px] font-bold text-strength-label">
        <span className="h-2 w-2 animate-pulse rounded-full bg-bad" /> In progress
      </h2>
      <p className="display mt-1 text-balance text-[44px] font-extrabold leading-none tracking-[-0.035em] text-strength-head">{active.name}</p>
      <span className="text-[13px] text-strength-head/80">
        {done} of {total} sets · started {format(parseISO(active.start), 'HH:mm')}
      </span>
      <button onClick={() => setOpen(true)} className="btn mt-3 w-full bg-strength-head font-extrabold text-ink-0">
        Carry on
      </button>
    </section>
  )
}

/** Your workouts as chips that scroll sideways: the next one up tinted, and a dashed one to make another. */
function Workouts({ w, next, onNew }: { w: World; next?: string; onNew: () => void }) {
  if (!w.routines.length) return null
  return (
    <div className="no-scrollbar -mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4">
      {w.routines.map((r) => (
        <Link key={r.id} to={`/lift/workout/${r.id}`} className={`chip shrink-0 px-3.5 text-[14px] ${r.id === next ? 'bg-strength-tint text-strength-head' : 'text-fg'}`}>
          {r.name}
        </Link>
      ))}
      <button onClick={onNew} className="chip shrink-0 border-[1.5px] border-dashed border-line-2 bg-transparent px-3.5 text-[14px] text-fg-3">
        <Plus size={14} strokeWidth={2.2} /> New
      </button>
    </div>
  )
}

/** The lifts you do most, each with a step line, where it's got to and what it's gained over eight weeks. */
function ProgressList({ w }: { w: World }) {
  const list = useMemo(() => progressOf(w.workouts, w.exerciseById, w.now).slice(0, 5), [w])
  if (!list.length) return null
  return (
    <Section
      title="Progress · last 8 weeks"
      action={
        <Link to="/lift/exercises" className="link">
          All lifts <ChevronRight size={14} strokeWidth={2.2} />
        </Link>
      }
    >
      <div className="list -mb-1">
        {list.map((p) => (
          <Link
            key={p.ex.id}
            to={`/lift/exercise/${p.ex.id}`}
            className="grid grid-cols-[minmax(0,1fr)_70px_92px] items-center gap-2.5 py-2 transition-colors duration-150 active:bg-ink-2"
          >
            <span className="truncate text-[14.5px] font-bold">{p.ex.name}</span>
            <Steps values={p.points.filter((x) => x.t >= w.now.getTime() - 56 * 86_400_000).map((x) => x.v)} />
            <span className="flex flex-col items-end">
              <span className="num text-[17px] leading-[1.25]">{amount(p.ex, p.now)}</span>
              <span className={`text-[11.5px] font-bold ${p.change > 0 ? 'text-good' : p.change < 0 ? 'text-bad' : 'text-fg-3'}`}>
                {p.change ? amount(p.ex, p.change, true) : 'Holding'}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </Section>
  )
}

/** Each session's top set as a step: flat until it moves. */
function Steps({ values }: { values: number[] }) {
  if (values.length < 2) return <span />
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const X = (i: number) => 1 + (i / (values.length - 1)) * 68
  const Y = (v: number) => (hi === lo ? 11 : 19 - ((v - lo) / (hi - lo)) * 16)
  const d = values.map((v, i) => (i ? `H${X(i).toFixed(1)}V${Y(v).toFixed(1)}` : `M${X(0)},${Y(v).toFixed(1)}`)).join('') + `H69`
  return (
    <svg width={70} height={22} viewBox="0 0 70 22" aria-hidden="true">
      <path d={d} fill="none" stroke="rgb(var(--strength))" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Every session you've logged, newest first, by month. */
export function LiftHistoryScreen() {
  const w = useWorld()
  const groups = useMemo(() => {
    const out = new Map<string, typeof w.workouts>()
    for (const x of w.workouts) {
      const k = format(parseISO(x.start), 'MMMM yyyy')
      out.set(k, [...(out.get(k) ?? []), x])
    }
    return [...out.entries()]
  }, [w])
  const records = useMemo(() => new Map(w.workouts.map((x) => [x.id, recordsIn(x, w.workouts, w.exerciseById).length])), [w])
  return (
    <Screen title="History" back>
      {!w.workouts.length && <Empty title="Nothing yet">Finish a workout and it shows up here.</Empty>}
      {groups.map(([k, list], i) => (
        <Section key={k} title={k} action={<span className="meta">{`${list.length} ${list.length === 1 ? 'session' : 'sessions'}`}</span>} className={i ? '' : '!mt-0'}>
          <div className="list">
            {list.map((x) => (
              <WorkoutRow key={x.id} w={x} records={records.get(x.id)} />
            ))}
          </div>
        </Section>
      ))}
    </Screen>
  )
}

/** Every exercise, the ones you've done lately first. */
export function ExercisesScreen() {
  const w = useWorld()
  const open = useUi((s) => s.open)
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState<Muscle | 'all'>('all')
  const stats = useMemo(() => {
    const out = new Map<string, { last: string; top: number }>()
    for (const ex of w.exercises) {
      const h = historyFor(ex.id, w.workouts)
      if (h.length) out.set(ex.id, { last: h[0].date, top: topOf(ex, h[0].sets) })
    }
    return out
  }, [w])
  const list = w.exercises
    .filter((e) => (muscle === 'all' || e.muscle === muscle) && e.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (stats.get(b.id)?.last ?? '').localeCompare(stats.get(a.id)?.last ?? '') || a.name.localeCompare(b.name))
  return (
    <Screen
      title="Lifts"
      back
      actions={
        <IconButton label="New exercise" onClick={() => open({ type: 'exercise' })} active>
          <Plus size={18} strokeWidth={2.2} />
        </IconButton>
      }
    >
      <div className="relative">
        <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className={`${inputCls} pl-10`} />
      </div>
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        {[{ key: 'all' as const, label: 'All' }, ...MUSCLES].map((m) => (
          <button key={m.key} onClick={() => setMuscle(m.key)} className={`chip shrink-0 ${muscle === m.key ? 'chip-on' : ''}`}>
            {m.label}
          </button>
        ))}
      </div>
      <div className="list mt-3">
        {list.map((e) => {
          const st = stats.get(e.id)
          return (
            <Link key={e.id} to={`/lift/exercise/${e.id}`} className="flex items-center gap-3 py-3 transition-colors duration-150 active:bg-ink-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-semibold leading-5">{e.name}</span>
                <span className="meta block truncate">
                  {MUSCLE_LABEL[e.muscle]} · {EQUIPMENT_LABEL[e.equipment]}
                  {st ? ` · ${format(parseISO(st.last), 'd MMM')}` : ''}
                </span>
              </span>
              {st && st.top > 0 && <span className="num text-[17px]">{amount(e, st.top)}</span>}
              <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-fg-4" />
            </Link>
          )
        })}
        {!list.length && <p className="meta py-6 text-center">Nothing matches. Tap + to make it your own.</p>}
      </div>
    </Screen>
  )
}
