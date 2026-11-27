import { ChevronRight, Link2 } from 'lucide-react'
import { Link } from 'react-router'
import { EQUIPMENT, MUSCLES } from '../../data/exercises'
import { useStore } from '../../data/store'
import type { Exercise, Routine, Workout } from '../../data/types'
import { useUi } from '../../data/ui'
import type { World } from '../../data/world'
import { dur, fmt } from '../../lib/format'
import { barsOf, fmtKg, historyFor, lastDone, planFor, routinesOf, setsOf, targetFor, workingSets, type PlanItem, type Target } from '../../lib/lift'

export const MUSCLE_LABEL = Object.fromEntries(MUSCLES.map((m) => [m.key, m.label])) as Record<string, string>
export const EQUIPMENT_LABEL = Object.fromEntries(EQUIPMENT.map((m) => [m.key, m.label])) as Record<string, string>

/** Your latest weigh-in: the body weight that counts with weight added to you. */
export const bodyKgOf = (w: World) => w.body.find((b) => b.weightKg)?.weightKg

/**
 * What to lift on every exercise of a workout (or of the one in progress), in its order: from every session of each,
 * today's date (for a long break) and your latest weigh-in, with the belt shared between lifts done in turns.
 */
export function planOf(w: World, items: PlanItem[]): (Target | undefined)[] {
  return planFor(items, w.exerciseById, w.workouts, { now: w.now, bodyKg: bodyKgOf(w) })
}

/** The workouts Next up picks from: the programme you're on, when it has any, or all of yours. */
export const inPlay = (w: World) => {
  const own = w.programme ? routinesOf(w.programme, w.routines) : []
  return own.length ? own : w.routines
}

/**
 * What to lift on an exercise next time, set by set: what the workout it comes round in next will ask for (its sets
 * there, and the belt it shares in a superset), so its page says what the logger will. In no workout, it's the lift
 * on its own, with the sets its last session had.
 */
export function nextFor(w: World, ex: Exercise): { t: Target; sets: Target['perSet'] } {
  const when = (r: Routine) => Date.parse(lastDone(r, w.workouts)?.start ?? '') || 0
  // the one that's waited longest of those in play, or failing that of all your workouts
  const pick = (list: Routine[]) =>
    list.filter((r) => r.items.some((i) => i.exerciseId === ex.id)).reduce<Routine | undefined>((a, r) => (!a || when(r) < when(a) ? r : a), undefined)
  const r = pick(inPlay(w)) ?? pick(w.routines)
  const at = r ? r.items.findIndex((i) => i.exerciseId === ex.id) : -1
  const planned = r && planOf(w, r.items)[at]
  const t = planned ?? targetFor(ex, historyFor(ex.id, w.workouts), { now: w.now, bodyKg: bodyKgOf(w) })
  return { t, sets: setsOf(t, planned && r ? r.items[at].sets : t.perSet.length) }
}

/**
 * A lift's sets as bars, one a set: each as tall as its weight against the heaviest, the working weight solid and the
 * rest faint. A pyramid steps down, a ramp steps up and straight sets are level.
 */
export function SetBars({ ex, sets, bodyKg, className = '' }: { ex: Exercise; sets: { kg?: number }[]; bodyKg?: number; className?: string }) {
  return (
    <span role="img" aria-label={`${sets.length} ${sets.length === 1 ? 'set' : 'sets'}`} className={`flex h-[22px] shrink-0 items-end gap-[3px] ${className}`}>
      {barsOf(ex, sets, bodyKg).map((b, i) => (
        <span key={i} className={`w-1.5 rounded-full ${b.top ? 'bg-strength' : 'bg-strength/[0.34]'}`} style={{ height: 8 + 14 * b.rise }} />
      ))}
    </span>
  )
}

/** the step's weight, by how many steps there are and how long it is, so "+12.5" still fits a step of four */
const STEP_SIZE = { wide: ['text-[31px]', 'text-[28px]'], narrow: ['text-[24px]', 'text-[21px]'] }
const STEP_COLS = ['', '', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4']
/** the most sets drawn as steps: more than this and they're too narrow to carry their numbers */
export const MOST_STEPS = 4

/**
 * A lift's sets as steps on its lilac tile, each as tall as its weight against the heaviest and carrying its own
 * numbers: the working weight solid, in the headline colour. For sets that aren't all at one weight, four at most.
 */
export function SetSteps({ ex, sets, bodyKg }: { ex: Exercise; sets: Target['perSet']; bodyKg?: number }) {
  const narrow = sets.length > 3
  const plus = ex.kind === 'weighted-bodyweight' ? '+' : ''
  const say = (s: Target['perSet'][number]) => (s.kg ? `${plus}${fmtKg(s.kg)} kg × ${s.count}` : `Bodyweight × ${s.count}`)
  return (
    <div role="img" aria-label={sets.map(say).join(', ')} className={`mt-1 grid items-end ${STEP_COLS[sets.length] ?? 'grid-cols-4'} ${narrow ? 'gap-1.5' : 'gap-2'}`}>
      {barsOf(ex, sets, bodyKg).map((b, i) => {
        const kg = sets[i].kg ? `${plus}${fmtKg(sets[i].kg!)}` : 'BW'
        return (
          <div
            key={i}
            aria-hidden="true"
            className={`flex min-w-0 flex-col justify-end gap-[5px] rounded-[16px] ${narrow ? 'px-2.5 pb-2.5' : 'px-3 pb-[11px]'} ${b.top ? 'bg-strength-head text-ink-0' : 'bg-strength/[0.16] text-strength-head'}`}
            style={{ height: 76 + 60 * b.rise }}
          >
            <span className={`num-hero whitespace-nowrap ${STEP_SIZE[narrow ? 'narrow' : 'wide'][kg.length > 4 ? 1 : 0]}`}>{kg}</span>
            <span className={`num whitespace-nowrap opacity-80 ${narrow ? 'text-[13.5px]' : 'text-[17px]'}`}>
              {sets[i].kg ? 'kg ' : ''}× {sets[i].count}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * The link on the line between two exercises: tap it and the one above and the one below become a superset, done
 * in turns; tap it again and they're apart. Joined, it says so.
 */
export function SupersetLink({ linked, onToggle, above, className = '' }: { linked: boolean; onToggle: () => void; above: string; className?: string }) {
  return (
    <button
      aria-label={linked ? `Superset: ${above} and the next exercise. Tap to split them` : `Superset ${above} with the next exercise`}
      aria-pressed={linked}
      onClick={onToggle}
      className={`press z-10 flex h-7 items-center justify-center gap-1 rounded-full ${linked ? 'bg-strength px-2.5 text-[12.5px] font-bold text-ink-0' : 'w-7 bg-ink-2 text-fg-3'} ${className}`}
    >
      <Link2 size={14} strokeWidth={2.2} />
      {linked && 'Superset'}
    </button>
  )
}

/** Start a workout, or go back to the one that's running. */
export function useBegin() {
  const active = useStore((s) => s.active)
  const start = useStore((s) => s.startWorkout)
  const setOpen = useUi((s) => s.setWorkoutOpen)
  return (r?: Routine) => {
    if (!active) start(r)
    setOpen(true)
  }
}

/** The rule in play against last time: green for more weight, red for backing off, plain for another rep. `plain` drops the colour, on a tinted tile. */
export function MoveNote({ t, className = '', plain }: { t: Target; className?: string; plain?: boolean }) {
  const cls = plain ? '' : t.move === 'up' ? 'font-semibold text-good' : t.move === 'back' ? 'font-semibold text-bad' : 'font-semibold text-fg-3'
  return (
    <span className={`whitespace-nowrap ${cls} ${className}`}>
      {t.move === 'first' ? 'New' : `${!plain && t.move === 'up' ? '↑ ' : !plain && t.move === 'back' ? '↓ ' : ''}${t.note}`}
    </span>
  )
}

export const daysAgo = (d?: number) => (d === undefined ? 'Not done yet' : d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago`)

/** A session you've finished, as a row. */
export function WorkoutRow({ w, records }: { w: Workout; records?: number }) {
  const secs = w.end ? (Date.parse(w.end) - Date.parse(w.start)) / 1000 : 0
  return (
    <Link to={`/lift/history/${w.id}`} className="flex items-center gap-3 py-3 transition-colors duration-150 active:bg-ink-2">
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-[15px] font-bold leading-5">{w.name}</span>
          {!!records && <span className="shrink-0 text-[12.5px] font-semibold text-football">{records === 1 ? '1 best' : `${records} bests`}</span>}
        </span>
        <span className="meta block truncate">
          {fmt(w.start, 'EEE d MMM')} · {dur(secs)}
        </span>
      </span>
      <span className="num text-[17px]">
        {workingSets(w)}
        <span className="unit ml-0.5 text-[12px]">sets</span>
      </span>
      <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-fg-4" />
    </Link>
  )
}
