import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronUp, Minus, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { Sheet } from '../../components/ui/Sheet'
import { NumInput } from '../../components/ui/bits'
import { useStore } from '../../data/store'
import type { SetEntry, WorkoutExercise } from '../../data/types'
import { useUi } from '../../data/ui'
import { useWorld, type World } from '../../data/world'
import { clock, dur } from '../../lib/format'
import { fmtKg, historyFor, loaded, plates, setText, targetFor, targetText } from '../../lib/lift'
import { uid } from '../../lib/rng'
import { MoveNote } from './parts'

function useNow(ms = 1000) {
  const [n, setN] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setN(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return n
}

const blankSet = (): SetEntry => ({ id: uid(), kind: 'working', done: false })
const working = (we: WorkoutExercise) => we.sets.filter((s) => s.kind !== 'warmup')

/** Full-screen logger. Minimise it and it lives on as a bar above the tabs. */
export function WorkoutOverlay() {
  const open = useUi((s) => s.workoutOpen)
  const setOpen = useUi((s) => s.setWorkoutOpen)
  const active = useStore((s) => !!s.active)

  useEffect(() => {
    if (!active && open) setOpen(false)
  }, [active, open, setOpen])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  return createPortal(
    <AnimatePresence>
      {open && active && (
        <motion.div
          key="workout"
          role="dialog"
          aria-label="Workout in progress"
          className="fixed inset-0 z-[45] bg-ink-0"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 380, damping: 42 }}
        >
          <Live />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function Live() {
  const w = useWorld()
  const active = useStore((s) => s.active)
  const update = useStore((s) => s.updateActive)
  const setOpen = useUi((s) => s.setWorkoutOpen)
  const open = useUi((s) => s.open)
  const [finishing, setFinishing] = useState(false)
  const now = useNow()
  if (!active) return null
  const elapsed = (now - Date.parse(active.start)) / 1000
  const done = active.exercises.reduce((a, we) => a + working(we).filter((s) => s.done).length, 0)
  const total = active.exercises.reduce((a, we) => a + working(we).length, 0)

  const addExercise = () =>
    open({
      type: 'pickExercise',
      onPick: (id) => update((x) => ({ ...x, exercises: [...x.exercises, { id: uid(), exerciseId: id, sets: [blankSet(), blankSet(), blankSet()] }] })),
    })

  return (
    <div className="flex h-full flex-col">
      <header className="bg-ink-0 pt-[var(--edge)]">
        <div className="gutter mx-auto flex max-w-app items-center gap-3 pb-3 pt-1">
          <button aria-label="Minimise workout" onClick={() => setOpen(false)} className="round text-fg-2">
            <ChevronDown size={20} strokeWidth={2.2} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="display truncate text-[18px] font-extrabold leading-tight">{active.name}</div>
            <div className="meta">
              {done} of {total} sets
            </div>
          </div>
          <span className="num text-[20px] tabular-nums text-fg-2">{clock(elapsed)}</span>
          <button onClick={() => setFinishing(true)} className="btn-primary h-10 px-4 text-[14px]">
            Finish
          </button>
        </div>
        <div className="gutter mx-auto max-w-app pb-1">
          <div className="h-1 overflow-hidden rounded-full bg-strength/[0.16]">
            <div className="h-full rounded-full bg-strength transition-[width] duration-500" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="gutter mx-auto max-w-app pb-44">
          {active.exercises.map((we, i) => (
            <ExerciseBlock key={we.id} w={w} we={we} index={i} count={active.exercises.length} />
          ))}
          {!active.exercises.length && <p className="meta py-10 text-center">Nothing in it yet. Add your first exercise.</p>}
          <button onClick={addExercise} className="btn-ghost mt-5 w-full">
            <Plus size={18} /> Add exercise
          </button>
        </div>
      </div>

      <RestBar />
      <FinishSheet open={finishing} onClose={() => setFinishing(false)} />
    </div>
  )
}

function ExerciseBlock({ w, we, index, count }: { w: World; we: WorkoutExercise; index: number; count: number }) {
  const update = useStore((s) => s.updateActive)
  const startRest = useUi((s) => s.startRest)
  const say = useUi((s) => s.say)
  const ex = w.exerciseById.get(we.exerciseId)
  const history = useMemo(() => (ex ? historyFor(ex.id, w.workouts) : []), [ex, w.workouts])
  const target = useMemo(() => (ex ? targetFor(ex, history) : null), [ex, history])
  const [menu, setMenu] = useState(false)
  if (!ex || !target) return null

  const weighted = loaded(ex)
  const timed = ex.kind === 'duration'
  const prev = history[0]
  const prevWork = prev?.sets.filter((s) => s.kind !== 'warmup') ?? []
  const prevWarm = prev?.sets.filter((s) => s.kind === 'warmup') ?? []

  const patchEx = (fn: (x: WorkoutExercise) => WorkoutExercise) => update((x) => ({ ...x, exercises: x.exercises.map((e) => (e.id === we.id ? fn(e) : e)) }))
  const patchSet = (id: string, p: Partial<SetEntry>) => patchEx((e) => ({ ...e, sets: e.sets.map((s) => (s.id === id ? { ...s, ...p } : s)) }))
  const move = (d: -1 | 1) =>
    update((x) => {
      const list = [...x.exercises]
      const j = index + d
      if (j < 0 || j >= list.length) return x
      ;[list[index], list[j]] = [list[j], list[index]]
      return { ...x, exercises: list }
    })
  const remove = () => update((x) => ({ ...x, exercises: x.exercises.filter((e) => e.id !== we.id) }))

  let nWork = 0
  let nWarm = 0
  // the weight you last put in on a working set today: the sets after it follow it, whatever the plan said
  let typed: number | undefined
  const rows = we.sets.map((s) => {
    const warm = s.kind === 'warmup'
    const k = warm ? nWarm++ : nWork++
    const previous = warm ? prevWarm[k] : prevWork[k]
    const before = timed ? previous?.secs : previous?.reps
    const row = {
      s,
      label: warm ? 'W' : String(k + 1),
      previous,
      // what ticking the set writes down if you leave it as it is: the target, or for a warm-up what you did last time
      phKg: warm ? previous?.kg : (typed ?? target.kg ?? previous?.kg),
      phCount: warm ? before : target.count,
    }
    if (!warm && s.kg !== undefined) typed = s.kg
    return row
  })

  const tick = (r: (typeof rows)[number]) => {
    const { s } = r
    if (s.done) return patchSet(s.id, { done: false })
    const p: Partial<SetEntry> = { done: true }
    if (timed) {
      if (s.secs === undefined) p.secs = r.phCount
    } else {
      if (s.reps === undefined) p.reps = r.phCount
      if (weighted && s.kg === undefined && r.phKg !== undefined) p.kg = r.phKg
    }
    if (!(timed ? (p.secs ?? s.secs) : (p.reps ?? s.reps))) return say(timed ? 'Add the seconds first' : 'Add your reps first')
    if (ex.kind === 'weight' && !(p.kg ?? s.kg)) return say('Add the weight first')
    patchSet(s.id, p)
    startRest(s.kind === 'warmup' ? Math.round(ex.restS / 2) : ex.restS, ex.name)
  }

  // the bar for the next set you'll lift, for the plates
  const nextUp = rows.find((r) => !r.s.done && r.s.kind !== 'warmup') ?? rows[rows.length - 1]
  const barKg = nextUp ? (nextUp.s.kg ?? nextUp.phKg) : undefined
  const perSide = ex.equipment === 'barbell' && barKg !== undefined && barKg > 20 ? plates(barKg) : []
  const cols = weighted ? 'grid-cols-[24px_minmax(0,1fr)_70px_56px_40px]' : 'grid-cols-[24px_minmax(0,1fr)_84px_40px]'

  return (
    <section className="tile mt-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="display text-[20px] font-extrabold leading-tight">{ex.name}</h3>
          <div className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="num text-[17px] text-fg-2">{targetText(ex, target)}</span>
            <MoveNote t={target} />
            {perSide.length > 0 && <span className="meta">{perSide.map(fmtKg).join(' + ')} a side</span>}
          </div>
        </div>
        <button aria-label="Exercise options" onClick={() => setMenu((m) => !m)} className={`round h-9 w-9 ${menu ? 'round-on' : 'text-fg-3'}`}>
          <MoreHorizontal size={18} />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {menu && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button disabled={index === 0} onClick={() => move(-1)} className="chip h-9 justify-center disabled:opacity-30">
                <ArrowUp size={14} /> Up
              </button>
              <button disabled={index === count - 1} onClick={() => move(1)} className="chip h-9 justify-center disabled:opacity-30">
                <ArrowDown size={14} /> Down
              </button>
              <button onClick={remove} className="chip h-9 justify-center text-bad">
                <Trash2 size={14} /> Remove
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`mt-4 grid ${cols} items-center gap-2 pb-1 text-[12px] font-semibold text-fg-3`}>
        <span>Set</span>
        <span>Last time</span>
        {weighted && <span className="text-center">{ex.kind === 'weighted-bodyweight' ? '+ kg' : 'kg'}</span>}
        <span className="text-center">{timed ? 'secs' : 'reps'}</span>
        <span />
      </div>

      {rows.map((r) => (
        <div key={r.s.id} className={`grid ${cols} items-center gap-2 py-[5px]`}>
          <button
            aria-label={r.s.kind === 'warmup' ? 'Warm-up set. Tap to count it' : 'Tap to make it a warm-up'}
            onClick={() => patchSet(r.s.id, { kind: r.s.kind === 'warmup' ? 'working' : 'warmup' })}
            className={`num h-10 text-left text-[16.5px] ${r.s.kind === 'warmup' ? 'text-z1' : r.s.done ? 'text-fg' : 'text-fg-3'}`}
          >
            {r.label}
          </button>
          <span className="meta min-w-0 truncate">{r.previous ? setText(ex, r.previous).replace(' reps', '') : ''}</span>
          {weighted && (
            <NumInput
              label="Weight in kg"
              decimal
              value={r.s.kg}
              placeholder={r.phKg !== undefined ? fmtKg(r.phKg) : ex.kind === 'weighted-bodyweight' ? '0' : ''}
              onChange={(v) => patchSet(r.s.id, { kg: v })}
            />
          )}
          <NumInput
            label={timed ? 'Seconds' : 'Reps'}
            value={timed ? r.s.secs : r.s.reps}
            placeholder={r.phCount !== undefined ? String(r.phCount) : ''}
            onChange={(v) => patchSet(r.s.id, timed ? { secs: v } : { reps: v })}
          />
          <button
            aria-label={r.s.done ? 'Mark set not done' : 'Mark set done'}
            aria-pressed={r.s.done}
            onClick={() => tick(r)}
            className={`press ml-auto grid h-9 w-9 place-items-center rounded-full transition-colors ${r.s.done ? 'bg-strength text-ink-0' : 'bg-ink-2 text-fg-4'}`}
          >
            <Check size={18} strokeWidth={2.75} />
          </button>
        </div>
      ))}

      <div className="mt-2 flex items-center gap-2">
        <button onClick={() => patchEx((e) => ({ ...e, sets: [...e.sets, blankSet()] }))} className="chip h-9">
          <Plus size={14} /> Set
        </button>
        <button
          onClick={() => patchEx((e) => ({ ...e, sets: e.sets.slice(0, -1) }))}
          disabled={!we.sets.length}
          aria-label="Remove last set"
          className="chip h-9 px-3 disabled:opacity-30"
        >
          <Minus size={14} />
        </button>
      </div>
    </section>
  )
}

/** The rest timer: a graphite tile floating at the foot of the logger, its track filling as the rest runs down. */
function RestBar() {
  const rest = useUi((s) => s.rest)
  const nudge = useUi((s) => s.nudgeRest)
  const stop = useUi((s) => s.stopRest)
  const now = useNow(250)
  const left = rest ? Math.max(0, Math.ceil((rest.until - now) / 1000)) : 0
  const over = !!rest && left === 0

  useEffect(() => {
    if (!over) return
    navigator.vibrate?.([120, 80, 120])
    const t = setTimeout(stop, 6000)
    return () => clearTimeout(t)
  }, [over, stop])

  return (
    <AnimatePresence>
      {rest && (
        <motion.div
          key="rest"
          className="gutter absolute inset-x-0 bottom-0 pb-[var(--tabbar-gap)]"
          initial={{ y: '120%' }}
          animate={{ y: 0 }}
          exit={{ y: '120%' }}
          transition={{ type: 'spring', stiffness: 420, damping: 38 }}
        >
          <div className="relative mx-auto flex max-w-app items-center gap-3 overflow-hidden rounded-[22px] bg-ink-2 px-4 pb-3.5 pt-3">
            <div className="absolute inset-x-4 bottom-1.5 h-[3px] overflow-hidden rounded-full bg-fg/10">
              <div
                className={`h-full rounded-full transition-[width] duration-300 ease-linear ${over ? 'bg-good' : 'bg-strength'}`}
                style={{ width: `${Math.min(1, 1 - left / rest.total) * 100}%` }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className={`label ${over ? 'text-good' : ''}`}>{over ? 'Go' : 'Rest'}</div>
              <div className="meta truncate">{over ? 'Next set' : rest.label}</div>
            </div>
            <span className={`num text-[36px] tabular-nums ${over ? 'text-good' : ''}`}>{clock(left)}</span>
            <div className="flex gap-1.5">
              <button onClick={() => nudge(-15)} className="chip h-10 bg-ink-3 px-2.5">
                −15
              </button>
              <button onClick={() => nudge(15)} className="chip h-10 bg-ink-3 px-2.5">
                +15
              </button>
              <button onClick={stop} className="chip chip-on h-10 px-3 font-bold">
                {over ? 'OK' : 'Skip'}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** How the session felt, in four words. It's stored on the 1–10 scale training load is worked out from. */
const EFFORT = [
  { srpe: 4, label: 'Easy' },
  { srpe: 6, label: 'Solid' },
  { srpe: 8, label: 'Hard' },
  { srpe: 10, label: 'All out' },
]

function FinishSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const active = useStore((s) => s.active)
  const finish = useStore((s) => s.finishWorkout)
  const discard = useStore((s) => s.discardWorkout)
  const setOpen = useUi((s) => s.setWorkoutOpen)
  const stopRest = useUi((s) => s.stopRest)
  const say = useUi((s) => s.say)
  const nav = useNavigate()
  const [srpe, setSrpe] = useState(6)
  const [sure, setSure] = useState(false)
  if (!active) return null
  const mins = Math.max(1, (Date.now() - Date.parse(active.start)) / 60000)
  const done = active.exercises.reduce((a, we) => a + working(we).filter((s) => s.done).length, 0)
  const left = active.exercises.reduce((a, we) => a + we.sets.filter((s) => !s.done).length, 0)

  const save = () => {
    const wk = finish(srpe)
    onClose()
    stopRest()
    setOpen(false)
    if (wk) nav(`/lift/history/${wk.id}?fresh=1`)
  }
  const bin = () => {
    if (!sure) return setSure(true)
    discard()
    stopRest()
    onClose()
    setOpen(false)
    say('Workout discarded')
  }

  return (
    <Sheet open={open} onClose={onClose} title="Finish" kicker={active.name}>
      <div className="flex items-baseline gap-8">
        <div>
          <div className="label mb-2">Time</div>
          <div className="num text-[27px]">{dur(mins * 60)}</div>
        </div>
        <div>
          <div className="label mb-2">Sets</div>
          <div className="num text-[27px]">{done}</div>
        </div>
      </div>
      {left > 0 && done > 0 && (
        <p className="meta mt-3">
          {left} unticked {left === 1 ? 'set' : 'sets'} will be dropped.
        </p>
      )}

      <div className="label mb-2.5 mt-7">How was it?</div>
      <div className="grid grid-cols-4 gap-2">
        {EFFORT.map((e) => (
          <button
            key={e.srpe}
            onClick={() => setSrpe(e.srpe)}
            aria-pressed={srpe === e.srpe}
            className={`chip h-12 justify-center px-1 text-[15px] ${srpe === e.srpe ? 'chip-on font-semibold' : ''}`}
          >
            {e.label}
          </button>
        ))}
      </div>

      <button onClick={save} disabled={!done} className="btn-primary mt-7 w-full disabled:opacity-40">
        Save workout
      </button>
      {!done && <p className="meta mt-2 text-center">Tick off at least one set to save.</p>}
      <button onClick={bin} className={`press mt-3 h-11 w-full rounded-full text-[14.5px] font-semibold ${sure ? 'bg-bad text-ink-0' : 'text-fg-3'}`}>
        {sure ? 'Tap again to discard' : 'Discard workout'}
      </button>
    </Sheet>
  )
}

/** Floats just above the tab bar while a workout is minimised: a graphite tile whose track fills as the sets get ticked. */
export function MiniWorkoutBar() {
  const active = useStore((s) => s.active)
  const open = useUi((s) => s.workoutOpen)
  const setOpen = useUi((s) => s.setWorkoutOpen)
  const rest = useUi((s) => s.rest)
  const now = useNow()
  if (!active || open) return null
  const done = active.exercises.reduce((a, we) => a + working(we).filter((s) => s.done).length, 0)
  const total = active.exercises.reduce((a, we) => a + working(we).length, 0)
  const left = rest ? Math.max(0, Math.ceil((rest.until - now) / 1000)) : 0
  return (
    <div className="gutter pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-gap)+var(--tabbar-h)+8px)] z-40">
      <button onClick={() => setOpen(true)} className="press pointer-events-auto relative mx-auto block w-full max-w-app overflow-hidden rounded-[22px] bg-ink-2 text-left">
        <span className="absolute inset-x-4 bottom-1.5 h-[3px] overflow-hidden rounded-full bg-fg/10">
          <span className="block h-full rounded-full bg-strength transition-[width] duration-500" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </span>
        <span className="flex h-14 items-center gap-3 px-4">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-bad" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-bold leading-tight">{active.name}</span>
            <span className="meta mt-0.5 block">
              {done} of {total} sets{rest ? (left ? ` · rest ${clock(left)}` : ' · go') : ''}
            </span>
          </span>
          <span className="num text-[19px] tabular-nums">{clock((now - Date.parse(active.start)) / 1000)}</span>
          <ChevronUp size={18} className="text-fg-3" />
        </span>
      </button>
    </div>
  )
}
