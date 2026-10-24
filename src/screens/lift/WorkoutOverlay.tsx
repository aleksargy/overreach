import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronUp, Minus, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { Sheet } from '../../components/ui/Sheet'
import { Bump, NumInput } from '../../components/ui/bits'
import { useStore } from '../../data/store'
import type { Exercise, SetEntry, SetKind, WorkoutExercise } from '../../data/types'
import { useUi } from '../../data/ui'
import { useWorld, type World } from '../../data/world'
import { clock, dur } from '../../lib/format'
import { RPE_SCALE, fmtKg, fmtRpe, historyFor, plates, rpeTone, srpeTone, suggest, volume, type Suggestion } from '../../lib/lift'
import { srpeLoad } from '../../lib/load'
import { uid } from '../../lib/rng'
import { MUSCLE_LABEL, SuggestionTag, setText, tonnes } from './parts'

function useNow(ms = 1000) {
  const [n, setN] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setN(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return n
}

const blankSet = (kind: SetKind = 'working'): SetEntry => ({ id: uid(), kind, done: false })

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
  const doneSets = active.exercises.reduce((a, we) => a + we.sets.filter((s) => s.done && s.kind !== 'warmup').length, 0)
  const total = active.exercises.reduce((a, we) => a + we.sets.filter((s) => s.kind !== 'warmup').length, 0)

  const addExercise = () =>
    open({
      type: 'pickExercise',
      onPick: (id) => update((x) => ({ ...x, exercises: [...x.exercises, { id: uid(), exerciseId: id, sets: [blankSet(), blankSet(), blankSet()] }] })),
    })

  return (
    <div className="flex h-full flex-col">
      <header className="relative border-b border-line bg-ink-0 pt-[env(safe-area-inset-top,0px)]">
        <div className="gutter mx-auto flex h-[60px] max-w-app items-center gap-2">
          <button aria-label="Minimise workout" onClick={() => setOpen(false)} className="press -ml-2 grid h-10 w-10 place-items-center rounded-full text-fg-2">
            <ChevronDown size={26} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-[22px] font-extrabold uppercase leading-none">{active.name}</div>
            <div className="mt-1 font-mono text-[11px] text-fg-3">
              <span className="text-fg">{clock(elapsed)}</span> · {doneSets}/{total} sets · {tonnes(volume(active))}
            </div>
          </div>
          <button onClick={() => setFinishing(true)} className="btn-primary h-10 px-5 text-[14px]">
            Finish
          </button>
        </div>
        <div className="absolute inset-x-0 bottom-[-1px] h-[2px] bg-ink-3">
          <div className="spectrum h-full transition-[width] duration-500" style={{ width: `${total ? (doneSets / total) * 100 : 0}%` }} />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="gutter mx-auto max-w-app pb-44 pt-4">
          {w.readiness && w.readiness.score < 45 && (
            <div className="mb-4 rounded-card border border-z1/30 bg-z1/10 px-3.5 py-3 text-[13.5px] leading-snug text-fg-2">
              Readiness is {w.readiness.score} today. Suggestions repeat last time's loads and stop at RPE 7.
            </div>
          )}
          <div className="flex flex-col gap-3">
            {active.exercises.map((we, i) => (
              <ExerciseBlock key={we.id} w={w} we={we} index={i} count={active.exercises.length} />
            ))}
          </div>
          {!active.exercises.length && <p className="py-8 text-center text-fg-3">Empty workout. Add your first exercise.</p>}
          <button onClick={addExercise} className="btn-ghost mt-4 h-14 w-full text-[15px]">
            <Plus size={18} /> Add exercise
          </button>
        </div>
      </div>

      <RestBar />
      <FinishSheet open={finishing} onClose={() => setFinishing(false)} />
    </div>
  )
}

/** The rep (or seconds) target as a number for placeholders. */
function targetCount(ex: Exercise, s: Suggestion): number | undefined {
  if (s.tag === 'first') return ex.repRange[1]
  const n = parseInt(s.reps, 10)
  return Number.isFinite(n) ? n : undefined
}

const KIND_ORDER: SetKind[] = ['working', 'warmup', 'drop', 'failure']
const KIND_STYLE: Record<SetKind, string> = { working: 'text-fg-2', warmup: 'text-z1', drop: 'text-z4', failure: 'text-z5' }

function ExerciseBlock({ w, we, index, count }: { w: World; we: WorkoutExercise; index: number; count: number }) {
  const update = useStore((s) => s.updateActive)
  const startRest = useUi((s) => s.startRest)
  const say = useUi((s) => s.say)
  const ex = w.exerciseById.get(we.exerciseId)
  const history = useMemo(() => (ex ? historyFor(ex.id, w.workouts) : []), [ex, w.workouts])
  const sug = useMemo(() => (ex ? suggest(ex, history, w.readiness?.score) : null), [ex, history, w.readiness])
  const [rpeFor, setRpeFor] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  if (!ex || !sug) return null

  const weighted = ex.kind === 'weight' || ex.kind === 'weighted-bodyweight'
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
  const rows = we.sets.map((s) => {
    const warm = s.kind === 'warmup'
    const k = warm ? nWarm++ : nWork++
    const previous = warm ? prevWarm[k] : prevWork[k]
    return {
      s,
      label: warm ? 'W' : s.kind === 'drop' ? 'D' : s.kind === 'failure' ? 'F' : String(k + 1),
      previous,
      phKg: warm ? previous?.kg : sug.kg ?? previous?.kg,
      phCount: warm ? (timed ? previous?.secs : previous?.reps) : targetCount(ex, sug) ?? (timed ? previous?.secs : previous?.reps),
    }
  })

  const tick = (r: (typeof rows)[number]) => {
    const { s } = r
    if (s.done) {
      patchSet(s.id, { done: false })
      if (rpeFor === s.id) setRpeFor(null)
      return
    }
    const p: Partial<SetEntry> = { done: true }
    if (timed) {
      if (s.secs === undefined) p.secs = r.phCount
    } else {
      if (s.reps === undefined) p.reps = r.phCount
      if (weighted && s.kg === undefined && r.phKg !== undefined) p.kg = r.phKg
    }
    const count = timed ? p.secs ?? s.secs : p.reps ?? s.reps
    if (!count) return say(timed ? 'Add the seconds first' : 'Add your reps first')
    if (ex.kind === 'weight' && !(p.kg ?? s.kg)) return say('Add the weight first')
    patchSet(s.id, p)
    setRpeFor(s.kind === 'warmup' ? null : s.id)
    startRest(s.kind === 'warmup' ? Math.round(ex.restS / 2) : ex.restS, ex.name)
  }

  // the bar for the next set you'll lift, for the plate maths
  const nextUp = rows.find((r) => !r.s.done && r.s.kind !== 'warmup') ?? rows[rows.length - 1]
  const plateKg = nextUp ? nextUp.s.kg ?? nextUp.phKg : undefined
  const cols = timed || ex.kind === 'bodyweight' ? 'grid-cols-[30px_minmax(0,1fr)_76px_46px_40px]' : 'grid-cols-[30px_minmax(0,1fr)_64px_54px_46px_40px]'

  return (
    <section className="card overflow-hidden">
      <div className="p-3.5 pb-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-[24px] font-extrabold uppercase leading-[0.95]">{ex.name}</h3>
            <div className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.05em] text-fg-3">
              {MUSCLE_LABEL[ex.muscle]} · {ex.repRange[0]}–{ex.repRange[1]}
              {timed ? 's' : ' reps'} · rest {dur(ex.restS).replace('m', ' min')}
            </div>
          </div>
          <button aria-label="Exercise options" onClick={() => setMenu((m) => !m)} className={`press grid h-9 w-9 place-items-center rounded-full ${menu ? 'bg-fg text-ink-0' : 'bg-ink-3 text-fg-2'}`}>
            <MoreHorizontal size={18} />
          </button>
        </div>
        <AnimatePresence initial={false}>
          {menu && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="mt-3 grid grid-cols-3 gap-2">
                <button disabled={index === 0} onClick={() => move(-1)} className="chip justify-center disabled:opacity-30">
                  <ArrowUp size={14} /> Up
                </button>
                <button disabled={index === count - 1} onClick={() => move(1)} className="chip justify-center disabled:opacity-30">
                  <ArrowDown size={14} /> Down
                </button>
                <button onClick={remove} className="chip justify-center border-z5/40 text-z5">
                  <Trash2 size={14} /> Remove
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="mt-3 flex items-start gap-2.5 rounded-[8px] bg-ink-2 px-3 py-2.5">
          <SuggestionTag s={sug} timed={timed} />
          <p className="text-[13px] leading-snug text-fg-2">{sug.text}</p>
        </div>
      </div>

      <div className={`grid ${cols} items-center gap-1.5 px-3 pb-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-fg-4`}>
        <span className="text-center">Set</span>
        <span>Last time</span>
        {weighted && <span className="text-center">{ex.kind === 'weighted-bodyweight' ? '+kg' : 'kg'}</span>}
        <span className="text-center">{timed ? 'secs' : 'reps'}</span>
        <span className="text-center">RPE</span>
        <span />
      </div>

      {rows.map((r) => (
        <div key={r.s.id}>
          <div className={`grid ${cols} items-center gap-1.5 px-3 py-1 transition-colors ${r.s.done ? 'bg-z2/[0.07]' : ''}`}>
            <button
              aria-label="Change set type"
              onClick={() => patchSet(r.s.id, { kind: KIND_ORDER[(KIND_ORDER.indexOf(r.s.kind) + 1) % KIND_ORDER.length] })}
              className={`press h-9 rounded-[7px] font-display text-[17px] font-black ${KIND_STYLE[r.s.kind]}`}
            >
              {r.label}
            </button>
            <span className="min-w-0 font-mono text-[11px] leading-tight text-fg-3">
              {r.previous ? (
                <>
                  <span className="block truncate">{setText(ex, r.previous).replace(' × ', '×').replace(' reps', '')}</span>
                  {r.previous.rpe && <span className="block text-[10px] text-fg-4">@{fmtRpe(r.previous.rpe)}</span>}
                </>
              ) : (
                '–'
              )}
            </span>
            {weighted && <NumInput label="Weight in kg" decimal value={r.s.kg} placeholder={r.phKg !== undefined ? fmtKg(r.phKg) : ex.kind === 'weighted-bodyweight' ? '0' : ''} onChange={(v) => patchSet(r.s.id, { kg: v })} />}
            <NumInput
              label={timed ? 'Seconds' : 'Reps'}
              value={timed ? r.s.secs : r.s.reps}
              placeholder={r.phCount !== undefined ? String(r.phCount) : ''}
              onChange={(v) => patchSet(r.s.id, timed ? { secs: v } : { reps: v })}
            />
            <button
              aria-label="Set RPE"
              onClick={() => setRpeFor(rpeFor === r.s.id ? null : r.s.id)}
              className={`press h-9 rounded-[7px] font-mono text-[13px] font-semibold ${r.s.rpe ? rpeTone(r.s.rpe) : rpeFor === r.s.id ? 'bg-fg text-ink-0' : 'bg-ink-2 text-fg-4'}`}
            >
              {r.s.rpe ? fmtRpe(r.s.rpe) : '–'}
            </button>
            <button
              aria-label={r.s.done ? 'Mark set not done' : 'Mark set done'}
              onClick={() => tick(r)}
              className={`press grid h-9 place-items-center rounded-[7px] ${r.s.done ? 'bg-z2 text-ink-0' : 'bg-ink-3 text-fg-3'}`}
            >
              <Check size={18} strokeWidth={3} />
            </button>
          </div>
          <AnimatePresence initial={false}>
            {rpeFor === r.s.id && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                <RpePicker
                  value={r.s.rpe}
                  onPick={(v) => {
                    patchSet(r.s.id, { rpe: v })
                    setRpeFor(null)
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}

      <div className="flex items-center gap-2 px-3 pb-3 pt-2">
        <button onClick={() => patchEx((e) => ({ ...e, sets: [...e.sets, blankSet()] }))} className="chip h-9 flex-1 justify-center">
          <Plus size={14} /> Add set
        </button>
        <button
          onClick={() => patchEx((e) => ({ ...e, sets: e.sets.slice(0, -1) }))}
          disabled={!we.sets.length}
          aria-label="Remove last set"
          className="chip h-9 justify-center px-3.5 disabled:opacity-30"
        >
          <Minus size={14} />
        </button>
      </div>
      {ex.equipment === 'barbell' && plateKg !== undefined && plateKg > 20 && <Plates kg={plateKg} />}
    </section>
  )
}

const PICKS = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10]

function RpePicker({ value, onPick }: { value?: number; onPick: (v: number | undefined) => void }) {
  const [hover, setHover] = useState<number | undefined>(value)
  const label = RPE_SCALE.find((x) => x.rpe === (hover ?? value))?.label
  return (
    <div className="mx-3 mb-2 mt-1 rounded-[10px] border border-line-2 bg-ink-2 p-2.5">
      <div className="mb-2 flex items-baseline justify-between px-0.5">
        <span className="label">How hard was that?</span>
        <span className="font-mono text-[11px] text-fg-2">{label ?? 'Reps in reserve'}</span>
      </div>
      <div className="grid grid-cols-8 gap-1">
        {PICKS.map((v) => (
          <button
            key={v}
            onPointerEnter={() => setHover(v)}
            onFocus={() => setHover(v)}
            onClick={() => onPick(v)}
            className={`press h-10 rounded-[7px] font-display text-[17px] font-black ${value === v ? rpeTone(v) : 'bg-ink-3 text-fg-2'}`}
          >
            {fmtRpe(v)}
          </button>
        ))}
      </div>
      {value !== undefined && (
        <button onClick={() => onPick(undefined)} className="mt-2 w-full text-center font-mono text-[10.5px] uppercase tracking-[0.08em] text-fg-3">
          Clear
        </button>
      )}
    </div>
  )
}

const PLATE: Record<number, { h: number; color: string }> = {
  25: { h: 40, color: 'rgb(var(--z5))' },
  20: { h: 40, color: 'rgb(var(--z1))' },
  15: { h: 34, color: 'rgb(var(--z3))' },
  10: { h: 28, color: 'rgb(var(--z2))' },
  5: { h: 22, color: 'rgb(var(--fg))' },
  2.5: { h: 17, color: 'rgb(var(--fg-3))' },
  1.25: { h: 14, color: 'rgb(var(--fg-4))' },
}

/** What goes on each side of a 20 kg bar, drawn like the real plates. */
function Plates({ kg }: { kg: number }) {
  const ps = plates(kg)
  if (!ps.length) return null
  return (
    <div className="flex items-center gap-3 border-t border-line px-3.5 py-2.5">
      <span className="label shrink-0">Per side</span>
      <span className="flex h-10 items-center">
        <span className="h-[5px] w-3 rounded-l-sm bg-fg-4" />
        {ps.map((p, i) => (
          <span key={i} className="mx-[1px] w-[7px] rounded-[2px]" style={{ height: PLATE[p].h, background: PLATE[p].color }} />
        ))}
        <span className="h-[5px] w-4 rounded-r-sm bg-fg-4" />
      </span>
      <span className="ml-auto truncate font-mono text-[11px] text-fg-2">
        {ps.map(fmtKg).join(' + ')} <span className="text-fg-4">for {fmtKg(kg)}</span>
      </span>
    </div>
  )
}

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
          className="pointer-events-none absolute inset-x-0 bottom-0 pb-[max(12px,env(safe-area-inset-bottom,0px))]"
          initial={{ y: 120 }}
          animate={{ y: 0 }}
          exit={{ y: 140 }}
          transition={{ type: 'spring', stiffness: 420, damping: 38 }}
        >
          <div className="gutter pointer-events-auto mx-auto max-w-app">
            <div className={`relative overflow-hidden rounded-[14px] border shadow-[0_-10px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl ${over ? 'border-z2/60 bg-z2/15' : 'border-line-2 bg-ink-2/95'}`}>
              <div className="absolute inset-x-0 top-0 h-[3px] bg-ink-3">
                <div className="spectrum h-full transition-[width] duration-300 ease-linear" style={{ width: `${Math.min(1, 1 - left / rest.total) * 100}%` }} />
              </div>
              <div className="flex items-center gap-3 px-3.5 pb-3 pt-3.5">
                <div className="min-w-0">
                  <div className={`label ${over ? 'text-z2' : ''}`}>{over ? 'Go' : 'Rest'}</div>
                  <div className="truncate text-[12px] text-fg-3">{over ? 'Next set' : rest.label}</div>
                </div>
                <span className={`num ml-auto text-[40px] leading-none ${over ? 'text-z2' : ''}`}>{clock(left)}</span>
                <div className="flex gap-1.5">
                  <button onClick={() => nudge(-15)} className="press h-10 rounded-[8px] bg-ink-3 px-2.5 font-mono text-[12px] font-semibold text-fg-2">
                    −15
                  </button>
                  <button onClick={() => nudge(15)} className="press h-10 rounded-[8px] bg-ink-3 px-2.5 font-mono text-[12px] font-semibold text-fg-2">
                    +15
                  </button>
                  <button onClick={stop} className="press h-10 rounded-[8px] bg-fg px-3 text-[13px] font-semibold text-ink-0">
                    {over ? 'OK' : 'Skip'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const SRPE_WORD = ['', 'Very easy', 'Easy', 'Moderate', 'Somewhat hard', 'Hard', 'Hard', 'Very hard', 'Very hard', 'Near max', 'Max']

function FinishSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const active = useStore((s) => s.active)
  const finish = useStore((s) => s.finishWorkout)
  const discard = useStore((s) => s.discardWorkout)
  const setOpen = useUi((s) => s.setWorkoutOpen)
  const stopRest = useUi((s) => s.stopRest)
  const say = useUi((s) => s.say)
  const nav = useNavigate()
  const [srpe, setSrpe] = useState(7)
  const [sure, setSure] = useState(false)
  if (!active) return null
  const mins = Math.max(1, (Date.now() - Date.parse(active.start)) / 60000)
  const done = active.exercises.reduce((a, we) => a + we.sets.filter((s) => s.done && s.kind !== 'warmup').length, 0)
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
      <div className="grid grid-cols-3 divide-x divide-line rounded-card border border-line bg-ink-1">
        {[
          { label: 'Time', value: dur(mins * 60) },
          { label: 'Sets', value: String(done) },
          { label: 'Volume', value: tonnes(volume(active)) },
        ].map((s) => (
          <div key={s.label} className="px-3 py-3">
            <div className="label mb-1.5">{s.label}</div>
            <div className="num text-[26px]">{s.value}</div>
          </div>
        ))}
      </div>
      {left > 0 && done > 0 && <p className="mt-2 text-[12.5px] text-fg-3">{left} unticked sets will be dropped.</p>}

      <div className="mt-6 flex items-end justify-between">
        <span className="label">How hard was the whole session?</span>
        <span className="font-mono text-[11px] text-fg-3">load +{srpeLoad(mins, srpe)}</span>
      </div>
      <div className="mt-2.5 grid grid-cols-5 gap-1.5">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button key={n} onClick={() => setSrpe(n)} className={`press h-12 rounded-[8px] font-display text-[22px] font-black ${srpe === n ? srpeTone(n) : 'border border-line bg-ink-1 text-fg-2'}`}>
            {n}
          </button>
        ))}
      </div>
      <div className="mt-3 font-display text-[26px] font-black uppercase leading-none">
        <Bump value={SRPE_WORD[srpe]} />
      </div>

      <button onClick={save} disabled={!done} className="btn-primary mt-6 h-14 w-full text-[16px] disabled:opacity-40">
        Save workout
      </button>
      {!done && <p className="mt-2 text-center text-[12.5px] text-fg-3">Tick off at least one set to save.</p>}
      <button onClick={bin} className={`mt-3 h-11 w-full rounded-[10px] text-[14px] font-semibold ${sure ? 'bg-z5 text-ink-0' : 'text-fg-3'}`}>
        {sure ? 'Tap again to discard' : 'Discard workout'}
      </button>
    </Sheet>
  )
}

/** Sits above the tab bar while a workout is minimised. */
export function MiniWorkoutBar() {
  const active = useStore((s) => s.active)
  const open = useUi((s) => s.workoutOpen)
  const setOpen = useUi((s) => s.setWorkoutOpen)
  const rest = useUi((s) => s.rest)
  const now = useNow()
  if (!active || open) return null
  const done = active.exercises.reduce((a, we) => a + we.sets.filter((s) => s.done && s.kind !== 'warmup').length, 0)
  const total = active.exercises.reduce((a, we) => a + we.sets.filter((s) => s.kind !== 'warmup').length, 0)
  const left = rest ? Math.max(0, Math.ceil((rest.until - now) / 1000)) : 0
  return (
    <div className="fixed inset-x-0 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom,0px))] z-40">
      <div className="gutter mx-auto max-w-app pb-2">
        <button onClick={() => setOpen(true)} className="press relative flex h-[52px] w-full items-center gap-3 overflow-hidden rounded-[12px] border border-line-2 bg-ink-2/95 px-3.5 text-left shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur-xl">
          <span className="absolute inset-x-0 top-0 h-[2px] bg-ink-3">
            <span className="spectrum block h-full" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
          </span>
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-z5 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-z5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-[17px] font-extrabold uppercase leading-none">{active.name}</span>
            <span className="mt-0.5 block font-mono text-[10.5px] text-fg-3">
              {done}/{total} sets{rest ? (left ? ` · rest ${clock(left)}` : ' · go') : ''}
            </span>
          </span>
          <span className="num text-[22px]">{clock((now - Date.parse(active.start)) / 1000)}</span>
          <ChevronUp size={18} className="text-fg-3" />
        </button>
      </div>
    </div>
  )
}
