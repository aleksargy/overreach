import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronUp, Link2Off, Minus, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { Sheet } from '../../components/ui/Sheet'
import { NumInput } from '../../components/ui/bits'
import { useStore } from '../../data/store'
import type { Exercise, SetEntry, WorkoutExercise } from '../../data/types'
import { useUi } from '../../data/ui'
import { useWorld, type World } from '../../data/world'
import { beltMates, fmtKg, loaded, mainSets, plates, setText, supersetTags, targetText, tidySupersets, toggleSuperset, type Target } from '../../lib/lift'
import { beltCard, cardsOf, logRows, moveCard, pastOf, splitCard, tickOf, type Past, type Row, type Turn } from '../../lib/logging'
import { uid } from '../../lib/rng'
import { MoveNote, SupersetLink, bodyKgOf, planOf } from './parts'

const blankSet = (kind: SetEntry['kind'] = 'working'): SetEntry => ({ id: uid(), kind, done: false })
/** the sets that count towards the workout: not warm-ups or drop sets */
const working = (we: WorkoutExercise) => mainSets(we.sets)
/** what a tap on a set's number turns it into: a warm-up, then a drop set, then back */
const NEXT_KIND: Record<SetEntry['kind'], SetEntry['kind']> = { working: 'warmup', failure: 'warmup', warmup: 'drop', drop: 'working' }
const KIND_WORD: Record<SetEntry['kind'], string> = { working: 'Set', failure: 'Set', warmup: 'Warm-up', drop: 'Drop set' }

/** Full-screen logger. Minimise it and it lives on as a bar above the tabs. It's a layer, so while you type it ends where the keyboard starts. */
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
          className="layer z-[45] bg-ink-0"
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
  // what to lift on each exercise, planned together so lifts done in turns share a belt; it only moves when the
  // exercises, their sets or their supersets do, not with every rep typed in
  const exercises = active?.exercises ?? []
  const shape = exercises.map((we) => `${we.exerciseId} ${working(we).length} ${we.superset ?? ''}`).join('\n')
  const { plan, mates } = useMemo(() => {
    const items = exercises.map((we) => ({ exerciseId: we.exerciseId, sets: working(we).length, superset: we.superset }))
    return { plan: planOf(w, items), mates: beltMates(items, w.exerciseById) }
  }, [w, shape])
  if (!active) return null
  // the weight a lift sharing the belt has put in for a round, where the two were planned at one weight
  const planned = (i: number, k: number) => {
    const t = plan[i]
    return t ? ((t.perSet[k] ?? t).kg ?? 0) : undefined
  }
  const worn = (i: number) => (k: number) => {
    for (const j of mates[i] ?? []) {
      const kg = working(active.exercises[j])[k]?.kg
      if (kg !== undefined && planned(j, k) !== undefined && planned(j, k) === planned(i, k)) return kg
    }
  }
  const done = active.exercises.reduce((a, we) => a + working(we).filter((s) => s.done).length, 0)
  const total = active.exercises.reduce((a, we) => a + working(we).length, 0)
  // a card an exercise, except lifts that go round on one belt and sit next to each other: they're one card, logged
  // a round at a time
  const cards = cardsOf(active.exercises.length, mates)

  const addExercise = () =>
    open({
      type: 'pickExercise',
      onPick: (id) => update((x) => ({ ...x, exercises: [...x.exercises, { id: uid(), exerciseId: id, sets: [blankSet(), blankSet(), blankSet()] }] })),
    })
  // a superset's exercises are tagged A1, A2 and sit close together, joined by the link between them
  const tags = supersetTags(active.exercises)
  const joined = (i: number) => !!active.exercises[i].superset && active.exercises[i].superset === active.exercises[i + 1]?.superset
  const link = (i: number) => update((x) => ({ ...x, exercises: toggleSuperset(x.exercises, i, uid) }))

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
        <div className="gutter mx-auto max-w-app pb-[calc(var(--safe-bottom)+40px)]">
          {cards.map((card) => {
            const i = card[0]
            return (
              <Fragment key={active.exercises[i].id}>
                {i === 0 ? (
                  <div className="h-2.5" />
                ) : (
                  // the gap between two exercises, with the link that makes them a superset
                  <div className={`relative flex justify-center ${joined(i - 1) ? 'h-1' : 'h-2.5'}`}>
                    <SupersetLink
                      linked={joined(i - 1)}
                      onToggle={() => link(i - 1)}
                      above={w.exerciseById.get(active.exercises[i - 1].exerciseId)?.name ?? 'This exercise'}
                      className="absolute top-1/2 -translate-y-1/2"
                    />
                  </div>
                )}
                {card.length > 1 ? (
                  <RoundsBlock w={w} list={card.map((n) => ({ we: active.exercises[n], tag: tags[n], target: plan[n], worn: worn(n) }))} total={active.exercises.length} />
                ) : (
                  <ExerciseBlock w={w} we={active.exercises[i]} index={i} count={active.exercises.length} tag={tags[i]} target={plan[i]} worn={worn(i)} />
                )}
              </Fragment>
            )
          })}
          <button onClick={addExercise} className="btn-ghost mt-5 w-full">
            <Plus size={18} /> Add exercise
          </button>
        </div>
      </div>

      <FinishSheet open={finishing} onClose={() => setFinishing(false)} />
    </div>
  )
}

/** the column over last time's sets: the session they come from isn't always the latest */
const pastLabel = (past: Past) => (past.base && past.base !== past.history[0] ? 'Week’s best' : 'Last time')

/** Changes to the workout in progress, by exercise and set. */
function useLog() {
  const update = useStore((s) => s.updateActive)
  const say = useUi((s) => s.say)
  const patchEx = (id: string, fn: (x: WorkoutExercise) => WorkoutExercise) => update((x) => ({ ...x, exercises: x.exercises.map((e) => (e.id === id ? fn(e) : e)) }))
  const patchSet = (id: string, setId: string, p: Partial<SetEntry>) => patchEx(id, (e) => ({ ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, ...p } : s)) }))
  /** tick a set, writing down what it was prefilled with, or untick one that's done */
  const tick = (ex: Exercise, id: string, r: Row) => {
    const t = tickOf(ex, r)
    if ('missing' in t) return say(t.missing === 'weight' ? 'Add the weight first' : t.missing === 'seconds' ? 'Add the seconds first' : 'Add your reps first')
    patchSet(id, r.s.id, t.patch)
  }
  return { update, patchEx, patchSet, tick }
}

/** The round button that ticks a set: lilac once it's done, and sage with a ring when the set is a new best. */
function Tick({ r, onClick }: { r: Row; onClick: () => void }) {
  return (
    <button
      aria-label={r.s.done ? `${r.best ? 'A new best. ' : ''}Mark set not done` : 'Mark set done'}
      aria-pressed={r.s.done}
      onClick={onClick}
      className={`press ml-auto grid h-9 w-9 place-items-center rounded-full transition-colors ${
        r.best ? 'bg-football text-ink-0 ring-2 ring-football/50 ring-offset-[3px] ring-offset-ink-1' : r.s.done ? 'bg-strength text-ink-0' : 'bg-ink-2 text-fg-4'
      }`}
    >
      <Check size={18} strokeWidth={2.75} />
    </button>
  )
}

/** a set's label in its colour: a warm-up blue, a drop set lilac, a best sage, done bright */
const labelTone = (r: Row) => (r.s.kind === 'warmup' ? 'text-z1' : r.s.kind === 'drop' ? 'text-strength' : r.best ? 'text-football' : r.s.done ? 'text-fg' : 'text-fg-3')
const kindLabel = (s: SetEntry) => `${KIND_WORD[s.kind]}. Tap for a ${KIND_WORD[NEXT_KIND[s.kind]].toLowerCase()}`
const lastText = (ex: Exercise, r: Row) => (r.previous ? setText(ex, r.previous).replace(' reps', '') : '')
const weightHint = (ex: Exercise, r: Row) => (r.phKg !== undefined ? fmtKg(r.phKg) : ex.kind === 'weighted-bodyweight' ? '0' : '')

/** how tall each plate is drawn: the big ones tall, the change small */
const PLATE: Record<number, string> = { 25: 'h-[46px]', 20: 'h-[42px]', 15: 'h-[38px]', 10: 'h-8', 5: 'h-[25px]', 2.5: 'h-5', 1.25: 'h-[17px]' }

/** One end of the bar with the plates for a side on it, biggest first, each with its weight. */
function Plates({ list }: { list: number[] }) {
  return (
    <span className="flex basis-full items-center gap-2.5 pt-1.5">
      <span
        role="img"
        aria-label={`${list.map(fmtKg).join(' + ')} a side`}
        className="relative flex items-center gap-[3px] pr-3.5 before:absolute before:inset-x-0 before:top-1/2 before:h-1 before:-translate-y-1/2 before:rounded-full before:bg-fg-4"
      >
        <span className="relative h-[15px] w-1.5 rounded-[2px] bg-fg-4" />
        {list.map((p, i) => (
          <span
            key={i}
            className={`num relative grid w-[26px] place-items-center rounded-lg bg-plate text-strength-head ${fmtKg(p).length > 3 ? 'text-[10.5px]' : 'text-[12.5px]'} ${PLATE[p] ?? 'h-5'}`}
          >
            {fmtKg(p)}
          </span>
        ))}
      </span>
      <span className="meta">a side</span>
    </span>
  )
}

function ExerciseBlock({
  w,
  we,
  index,
  count,
  tag,
  target,
  worn,
}: {
  w: World
  we: WorkoutExercise
  index: number
  count: number
  tag?: string
  /** what to lift, from the plan for the whole workout */
  target?: Target
  /** the weight a lift sharing the belt has put in for a round, if it has */
  worn: (k: number) => number | undefined
}) {
  const log = useLog()
  const ex = w.exerciseById.get(we.exerciseId)
  const bodyKg = bodyKgOf(w)
  const past = useMemo(() => pastOf(ex, w.workouts, bodyKg), [w.workouts, ex, bodyKg])
  const [menu, setMenu] = useState(false)
  if (!ex || !target) return null

  const weighted = loaded(ex)
  const timed = ex.kind === 'duration'
  const rows = logRows(ex, we, target, past, bodyKg, worn)
  const move = (d: -1 | 1) => log.update((x) => ({ ...x, exercises: moveCard(x.exercises, index, 1, d) }))
  const remove = () => log.update((x) => ({ ...x, exercises: tidySupersets(x.exercises.filter((e) => e.id !== we.id)) }))

  // the bar for the next set you'll lift, for the plates
  const nextUp = rows.find((r) => !r.s.done && r.s.kind !== 'warmup') ?? rows[rows.length - 1]
  const barKg = nextUp ? (nextUp.s.kg ?? nextUp.phKg) : undefined
  const perSide = ex.equipment === 'barbell' && barKg !== undefined && barKg > 20 ? plates(barKg) : []
  const cols = weighted ? 'grid-cols-[24px_minmax(0,1fr)_70px_56px_40px]' : 'grid-cols-[24px_minmax(0,1fr)_84px_40px]'

  return (
    <section className="tile">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="display flex items-baseline gap-2 text-[20px] font-extrabold leading-tight">
            {tag && <span className="pill shrink-0 self-center font-sans [--p:var(--strength)]">{tag}</span>}
            <span className="min-w-0">{ex.name}</span>
          </h3>
          <div className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="num text-[17px] text-fg-2">{targetText(ex, target)}</span>
            <MoveNote t={target} />
            {perSide.length > 0 && <Plates list={perSide} />}
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
        <span>{pastLabel(past)}</span>
        {weighted && <span className="text-center">{ex.kind === 'weighted-bodyweight' ? '+ kg' : 'kg'}</span>}
        <span className="text-center">{timed ? 'secs' : 'reps'}</span>
        <span />
      </div>

      {rows.map((r) => (
        <div key={r.s.id} className={`grid ${cols} items-center gap-2 py-[5px]`}>
          <button
            aria-label={kindLabel(r.s)}
            onClick={() => log.patchSet(we.id, r.s.id, { kind: NEXT_KIND[r.s.kind] })}
            className={`num h-10 text-left text-[16.5px] ${labelTone(r)}`}
          >
            {r.label}
          </button>
          <span className="meta min-w-0 truncate">{lastText(ex, r)}</span>
          {weighted && <NumInput label="Weight in kg" decimal value={r.s.kg} placeholder={weightHint(ex, r)} onChange={(v) => log.patchSet(we.id, r.s.id, { kg: v })} />}
          <NumInput
            label={timed ? 'Seconds' : 'Reps'}
            value={timed ? r.s.secs : r.s.reps}
            placeholder={r.phCount !== undefined ? String(r.phCount) : ''}
            onChange={(v) => log.patchSet(we.id, r.s.id, timed ? { secs: v } : { reps: v })}
          />
          <Tick r={r} onClick={() => log.tick(ex, we.id, r)} />
        </div>
      ))}

      <div className="mt-2 flex items-center gap-2">
        <button onClick={() => log.patchEx(we.id, (e) => ({ ...e, sets: [...e.sets, blankSet()] }))} className="chip h-9">
          <Plus size={14} /> Set
        </button>
        <button onClick={() => log.patchEx(we.id, (e) => ({ ...e, sets: [...e.sets, blankSet('drop')] }))} className="chip h-9">
          <Plus size={14} /> Drop
        </button>
        <button
          onClick={() => log.patchEx(we.id, (e) => ({ ...e, sets: e.sets.slice(0, -1) }))}
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

/** the belt's box: the number sits a little high, over its label */
const beltCls = 'num h-full w-full min-w-0 rounded-[12px] bg-ink-2 pb-4 text-center text-[22px] tabular-nums placeholder:text-fg-4 focus:outline-none focus:ring-2 focus:ring-fg/30'
const ROUND = 'grid grid-cols-[24px_minmax(0,1fr)_70px_56px_40px] items-center gap-2'

/**
 * Lifts that go round on one belt and sit next to each other, as one card logged in turns: a round at a time, with
 * one box for the belt beside the lifts it's for (typed once, it goes on each of them) and each lift's own reps and
 * tick. A round the plan gives them different weights in, or where you've put different weights on them, keeps a box
 * each. A warm-up sits over the round it leads into and a drop set under the round it follows, with a box of their
 * own. How it's laid out is worked out in lib/logging (`beltCard`).
 */
function RoundsBlock({
  w,
  list,
  total,
}: {
  w: World
  /** the lifts, in the workout's order */
  list: { we: WorkoutExercise; tag?: string; target?: Target; worn: (k: number) => number | undefined }[]
  /** exercises in the workout, to know when the card is first or last */
  total: number
}) {
  const log = useLog()
  const bodyKg = bodyKgOf(w)
  const ids = list.map((l) => l.we.exerciseId).join(' ')
  const pasts = useMemo(() => ids.split(' ').map((id) => pastOf(w.exerciseById.get(id), w.workouts, bodyKg)), [w.workouts, w.exerciseById, ids, bodyKg])
  const active = useStore((s) => s.active)
  const [menu, setMenu] = useState(false)
  const [dropping, setDropping] = useState(false)
  const lifts = list.flatMap((l, n) => {
    const ex = w.exerciseById.get(l.we.exerciseId)
    return ex && l.target ? [{ ...l, ex, target: l.target, past: pasts[n] }] : []
  })
  if (lifts.length < 2 || !active) return null

  // the rounds, who's in each, where the belt is shared, and the warm-ups and drop sets between them
  const card = beltCard(lifts, bodyKg)
  const at = (x: { exercises: WorkoutExercise[] }) => x.exercises.findIndex((e) => e.id === lifts[0].we.id)
  const first = at(active)
  const last = first + lifts.length - 1
  // the card moves as one, and Split gives each lift a card of its own again
  const move = (d: -1 | 1) => log.update((x) => ({ ...x, exercises: moveCard(x.exercises, at(x), lifts.length, d) }))
  const split = () => log.update((x) => ({ ...x, exercises: splitCard(x.exercises, at(x), lifts.length, uid) }))
  const mine = (id: string) => lifts.some((l) => l.we.id === id)
  /** the belt for a round, on every lift in it */
  const setBelt = (k: number, kg: number | undefined) =>
    log.update((x) => ({
      ...x,
      exercises: x.exercises.map((e) => {
        const s = mine(e.id) ? working(e)[k] : undefined
        return s ? { ...e, sets: e.sets.map((y) => (y.id === s.id ? { ...y, kg } : y)) } : e
      }),
    }))
  const addRound = () => log.update((x) => ({ ...x, exercises: x.exercises.map((e) => (mine(e.id) ? { ...e, sets: [...e.sets, blankSet()] } : e)) }))
  // the last thing on the card goes: a drop set or a warm-up after the last round, else the last round itself
  const removeLast = () => {
    const gone = new Set(card.last.map((x) => x.id))
    log.update((x) => ({ ...x, exercises: x.exercises.map((e) => (mine(e.id) ? { ...e, sets: e.sets.filter((s) => !gone.has(s.id)) } : e)) }))
  }

  /** a lift's name over last time's set, its tag first */
  const who = (n: number, r: Row, button?: boolean) => (
    <span className="min-w-0">
      <span className="block truncate text-[14.5px] font-bold leading-5">
        {lifts[n].tag &&
          (button ? (
            <button
              aria-label={`${lifts[n].ex.name}, ${kindLabel(r.s).toLowerCase()}`}
              onClick={() => log.patchSet(lifts[n].we.id, r.s.id, { kind: NEXT_KIND[r.s.kind] })}
              className={`-my-2 mr-[5px] py-2 text-[12px] font-extrabold ${r.best ? 'text-football' : 'text-strength'}`}
            >
              {lifts[n].tag}
            </button>
          ) : (
            <span className="mr-[5px] text-[12px] font-extrabold text-strength">{lifts[n].tag}</span>
          ))}
        {lifts[n].ex.name}
      </span>
      <span className="block truncate text-[12.5px] leading-4 text-fg-3">{lastText(lifts[n].ex, r)}</span>
    </span>
  )
  const reps = (n: number, r: Row) => (
    <NumInput label="Reps" value={r.s.reps} placeholder={r.phCount !== undefined ? String(r.phCount) : ''} onChange={(v) => log.patchSet(lifts[n].we.id, r.s.id, { reps: v })} />
  )
  const weight = (n: number, r: Row) => (
    <NumInput label="Weight in kg" decimal value={r.s.kg} placeholder={weightHint(lifts[n].ex, r)} onChange={(v) => log.patchSet(lifts[n].we.id, r.s.id, { kg: v })} />
  )
  /** a warm-up or a drop set: a row of its own, with its own weight */
  const extra = ({ n, r }: Turn) => (
    <div key={r.s.id} className={`${ROUND} py-[5px]`}>
      <button
        aria-label={kindLabel(r.s)}
        onClick={() => log.patchSet(lifts[n].we.id, r.s.id, { kind: NEXT_KIND[r.s.kind] })}
        className={`num h-10 text-left text-[16.5px] ${labelTone(r)}`}
      >
        {r.label}
      </button>
      {who(n, r)}
      {weight(n, r)}
      {reps(n, r)}
      <Tick r={r} onClick={() => log.tick(lifts[n].ex, lifts[n].we.id, r)} />
    </div>
  )
  /** a round: its lifts in turn, and the belt beside them */
  const round = (k: number) => {
    const turns = card.turns(k)
    const one = card.shared(k)
    return (
      <div className={`${ROUND} py-[5px]`}>
        <span
          className={`num self-start text-[16.5px] leading-10 ${turns.every((t) => t.r.s.done) ? 'text-fg' : 'text-fg-3'}`}
          style={{ gridColumn: 1, gridRow: `1 / span ${turns.length}` }}
        >
          {k + 1}
        </span>
        {one && (
          <span className="relative self-stretch" style={{ gridColumn: 3, gridRow: `1 / span ${turns.length}` }}>
            <NumInput
              label="Weight on the belt in kg"
              decimal
              value={card.on(k)}
              placeholder={weightHint(lifts[turns[0].n].ex, turns[0].r)}
              onChange={(v) => setBelt(k, v)}
              className={beltCls}
            />
            <span className="pointer-events-none absolute inset-x-0 bottom-2.5 text-center text-[11px] font-semibold leading-none text-fg-4">belt</span>
          </span>
        )}
        {turns.map(({ n, r }, j) => (
          <Fragment key={r.s.id}>
            <span className="min-w-0" style={{ gridColumn: 2, gridRow: j + 1 }}>
              {who(n, r, true)}
            </span>
            {!one && <span style={{ gridColumn: 3, gridRow: j + 1 }}>{weight(n, r)}</span>}
            <span style={{ gridColumn: 4, gridRow: j + 1 }}>{reps(n, r)}</span>
            <span className="flex" style={{ gridColumn: 5, gridRow: j + 1 }}>
              <Tick r={r} onClick={() => log.tick(lifts[n].ex, lifts[n].we.id, r)} />
            </span>
          </Fragment>
        ))}
      </div>
    )
  }

  return (
    <section className="tile">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {lifts.map((l) => (
            <h3 key={l.we.id} className="display flex items-baseline gap-2 text-[20px] font-extrabold leading-tight">
              {l.tag && <span className="pill shrink-0 self-center font-sans [--p:var(--strength)]">{l.tag}</span>}
              <span className="min-w-0 truncate">{l.ex.name}</span>
              <MoveNote t={l.target} className="font-sans text-[13px] tracking-normal" />
            </h3>
          ))}
        </div>
        <button aria-label="Superset options" onClick={() => setMenu((m) => !m)} className={`round h-9 w-9 ${menu ? 'round-on' : 'text-fg-3'}`}>
          <MoreHorizontal size={18} />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {menu && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button disabled={first === 0} onClick={() => move(-1)} className="chip h-9 justify-center disabled:opacity-30">
                <ArrowUp size={14} /> Up
              </button>
              <button disabled={last === total - 1} onClick={() => move(1)} className="chip h-9 justify-center disabled:opacity-30">
                <ArrowDown size={14} /> Down
              </button>
              <button onClick={split} className="chip h-9 justify-center">
                <Link2Off size={14} /> Split
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`mt-4 ${ROUND} pb-1 text-[12px] font-semibold text-fg-3`}>
        <span>Set</span>
        <span>{lifts.every((l) => pastLabel(l.past) !== 'Last time') ? 'Week’s best' : 'Last time'}</span>
        <span className="text-center">+ kg</span>
        <span className="text-center">reps</span>
        <span />
      </div>

      {/* a warm-up sits over the round it leads into, a drop set under the round it follows */}
      <div className="list">
        {card.drops[0].length > 0 && <div>{card.drops[0].map(extra)}</div>}
        {Array.from({ length: card.rounds }, (_, k) => (
          <div key={k} className="py-1 first:pt-0">
            {card.warmups[k].map(extra)}
            {round(k)}
            {card.drops[k + 1].map(extra)}
          </div>
        ))}
        {card.warmups[card.rounds].length > 0 && <div className="py-1">{card.warmups[card.rounds].map(extra)}</div>}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button onClick={addRound} className="chip h-9">
          <Plus size={14} /> Set
        </button>
        <button onClick={() => setDropping((d) => !d)} aria-expanded={dropping} className={`chip h-9 ${dropping ? 'chip-on' : ''}`}>
          <Plus size={14} /> Drop
        </button>
        <button onClick={removeLast} disabled={!card.last.length} aria-label="Remove last set" className="chip h-9 px-3 disabled:opacity-30">
          <Minus size={14} />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {dropping && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            {/* which lift the drop set is for */}
            <div className="mt-2 flex flex-wrap gap-2">
              {lifts.map((l) => (
                <button
                  key={l.we.id}
                  onClick={() => {
                    log.patchEx(l.we.id, (e) => ({ ...e, sets: [...e.sets, blankSet('drop')] }))
                    setDropping(false)
                  }}
                  className="chip h-9"
                >
                  {l.ex.name}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
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
  const say = useUi((s) => s.say)
  const nav = useNavigate()
  const [srpe, setSrpe] = useState(6)
  const [sure, setSure] = useState(false)
  if (!active) return null
  const done = active.exercises.reduce((a, we) => a + working(we).filter((s) => s.done).length, 0)
  const total = active.exercises.reduce((a, we) => a + working(we).length, 0)

  const save = () => {
    const wk = finish(srpe)
    onClose()
    setOpen(false)
    if (wk) nav(`/lift/history/${wk.id}?fresh=1`)
  }
  const bin = () => {
    if (!sure) return setSure(true)
    discard()
    onClose()
    setOpen(false)
    say('Workout discarded')
  }

  return (
    <Sheet open={open} onClose={onClose} title="Finish" kicker={active.name}>
      {/* the sets that will be saved: unticked ones are left out */}
      <div className="label mb-2">Sets</div>
      <div className="num text-[27px]">
        {done}
        {done < total && <span className="unit">of {total}</span>}
      </div>

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
  if (!active || open) return null
  const done = active.exercises.reduce((a, we) => a + working(we).filter((s) => s.done).length, 0)
  const total = active.exercises.reduce((a, we) => a + working(we).length, 0)
  return (
    <div className="kb-hide gutter pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-gap)+var(--tabbar-h)+8px)] z-40">
      <button onClick={() => setOpen(true)} className="press pointer-events-auto relative mx-auto block w-full max-w-app overflow-hidden rounded-[22px] bg-ink-2 text-left">
        <span className="absolute inset-x-4 bottom-1.5 h-[3px] overflow-hidden rounded-full bg-fg/10">
          <span className="block h-full rounded-full bg-strength transition-[width] duration-500" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </span>
        <span className="flex h-14 items-center gap-3 px-4">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-bad" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-bold leading-tight">{active.name}</span>
            <span className="meta mt-0.5 block">
              {done} of {total} sets
            </span>
          </span>
          <ChevronUp size={18} className="text-fg-3" />
        </span>
      </button>
    </div>
  )
}
