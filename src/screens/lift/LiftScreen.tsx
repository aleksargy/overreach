import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { ChevronRight, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Sparkline } from '../../components/charts/primitives'
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
        <IconButton label="New workout" onClick={create}>
          <Plus size={18} />
        </IconButton>
      }
    >
      {active ? (
        <InProgress />
      ) : next ? (
        <NextUp w={w} routine={next} />
      ) : (
        <section>
          <div className="label">Start here</div>
          <h2 className="display mt-3 text-balance text-[48px] font-extrabold leading-[0.9]">Make your first workout</h2>
          <p className="mt-5 text-[17px] leading-snug text-fg-2">Your exercises, in the order you do them. From the second session it tells you what to lift.</p>
          <button onClick={create} className="btn-primary mt-6 w-full">
            New workout
          </button>
        </section>
      )}
      {w.news.lift && !active && <StandoutLine s={w.news.lift} className="mt-9" />}
      <Workouts w={w} skip={active ? undefined : next?.id} onNew={create} />
      <ProgressList w={w} />
      {w.workouts.length > 0 && (
        <Section
          title="Recent"
          action={
            <Link to="/lift/history" className="link">
              History <ChevronRight size={15} strokeWidth={2} />
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

/** The workout that's waited longest, with what to lift on every exercise. */
function NextUp({ w, routine }: { w: World; routine: Routine }) {
  const begin = useBegin()
  const since = sinceDone(routine, w)
  return (
    <section>
      <div className="label">Next up</div>
      <Link to={`/lift/workout/${routine.id}`} className="press mt-3 block">
        <h2 className="display text-balance text-[48px] font-extrabold leading-[0.9]">{routine.name}</h2>
      </Link>
      <div className="meta mt-3">{[focusOf(routine, w.exerciseById), daysAgo(since)].filter(Boolean).join(' · ')}</div>
      <Targets w={w} routine={routine} className="mt-5" />
      <button onClick={() => begin(routine)} className="btn-primary mt-6 w-full">
        Start
      </button>
    </section>
  )
}

/** A workout's exercises, each with the weight and reps to go for and what's changed since last time. */
export function Targets({ w, routine, className = '' }: { w: World; routine: Routine; className?: string }) {
  return (
    <div className={`list ruled ${className}`}>
      {routine.items.map((it, i) => {
        const ex = w.exerciseById.get(it.exerciseId)
        if (!ex) return null
        const t = targetFor(ex, historyFor(ex.id, w.workouts))
        return (
          <Link key={`${it.exerciseId}-${i}`} to={`/lift/exercise/${ex.id}`} className="flex items-center gap-3 py-[10px] transition-colors duration-150 active:bg-ink-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-semibold leading-5">{ex.name}</span>
              <span className="meta block">
                {it.sets} {it.sets === 1 ? 'set' : 'sets'} · <MoveNote t={t} />
              </span>
            </span>
            <span className="num shrink-0 text-right text-[21px]">{targetText(ex, t)}</span>
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
    <section>
      <div className="label flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-bad" /> In progress
      </div>
      <h2 className="display mt-3 text-balance text-[48px] font-extrabold leading-[0.9]">{active.name}</h2>
      <div className="meta mt-3">
        {done} of {total} sets · started {format(parseISO(active.start), 'HH:mm')}
      </div>
      <button onClick={() => setOpen(true)} className="btn-primary mt-6 w-full">
        Carry on
      </button>
    </section>
  )
}

function Workouts({ w, skip, onNew }: { w: World; skip?: string; onNew: () => void }) {
  const list = w.routines.filter((r) => r.id !== skip)
  if (!w.routines.length) return null
  return (
    <Section
      title="Workouts"
      action={
        <button onClick={onNew} className="link">
          <Plus size={15} strokeWidth={2} /> New
        </button>
      }
    >
      <div className="list">
        {list.map((r) => (
          <Link key={r.id} to={`/lift/workout/${r.id}`} className="flex items-center gap-3 py-3 transition-colors duration-150 active:bg-ink-2">
            <span className="min-w-0 flex-1">
              <span className="t-name block truncate">{r.name}</span>
              <span className="meta mt-0.5 block truncate">
                {r.items.length} {r.items.length === 1 ? 'exercise' : 'exercises'} · {daysAgo(sinceDone(r, w)).toLowerCase()}
              </span>
            </span>
            <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-fg-4" />
          </Link>
        ))}
        {!list.length && <p className="meta py-3">That’s your only one. Add another and they’ll take turns.</p>}
      </div>
    </Section>
  )
}

/** The lifts you do most, and where each has got to over the last eight weeks. */
function ProgressList({ w }: { w: World }) {
  const list = useMemo(() => progressOf(w.workouts, w.exerciseById, w.now).slice(0, 5), [w])
  if (!list.length) return null
  return (
    <Section
      title="Progress"
      action={
        <Link to="/lift/exercises" className="link">
          All lifts <ChevronRight size={15} strokeWidth={2} />
        </Link>
      }
    >
      <div className="list">
        {list.map((p) => (
          <Link
            key={p.ex.id}
            to={`/lift/exercise/${p.ex.id}`}
            className="grid grid-cols-[minmax(0,1fr)_72px_auto] items-center gap-3 py-3 transition-colors duration-150 active:bg-ink-2"
          >
            <span className="min-w-0">
              <span className="block truncate text-[16px] font-semibold leading-5">{p.ex.name}</span>
              <span className={`block text-[13px] font-semibold ${p.change > 0 ? 'text-good' : p.change < 0 ? 'text-warn' : 'text-fg-3'}`}>
                {p.change ? `${amount(p.ex, p.change, true)} in 8 weeks` : 'Holding'}
              </span>
            </span>
            <Sparkline values={p.points.map((x) => x.v)} height={30} color="rgb(var(--fg-2))" />
            <span className="num min-w-[84px] text-right text-[19px]">{amount(p.ex, p.now)}</span>
          </Link>
        ))}
      </div>
    </Section>
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
        <IconButton label="New exercise" onClick={() => open({ type: 'exercise' })}>
          <Plus size={18} />
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
