import { ChevronRight, Link2 } from 'lucide-react'
import { Link } from 'react-router'
import { EQUIPMENT, MUSCLES } from '../../data/exercises'
import { useStore } from '../../data/store'
import type { Exercise, Routine, Workout } from '../../data/types'
import { useUi } from '../../data/ui'
import type { World } from '../../data/world'
import { dur, fmt } from '../../lib/format'
import { historyFor, targetFor, workingSets, type Target } from '../../lib/lift'

export const MUSCLE_LABEL = Object.fromEntries(MUSCLES.map((m) => [m.key, m.label])) as Record<string, string>
export const EQUIPMENT_LABEL = Object.fromEntries(EQUIPMENT.map((m) => [m.key, m.label])) as Record<string, string>

/**
 * What to lift on an exercise next time, from every session of it, today's date (for a long break) and your
 * latest weigh-in (for weight added to you). `sets` is how many working sets the workout has, when that's known.
 */
export function nextFor(w: World, ex: Exercise, sets?: number): Target {
  return targetFor(ex, historyFor(ex.id, w.workouts), { sets, now: w.now, bodyKg: w.body.find((b) => b.weightKg)?.weightKg })
}

/** How many working sets your workouts give an exercise: the most any of them does. */
export const plannedSets = (w: World, exerciseId: string) =>
  Math.max(0, ...w.routines.flatMap((r) => r.items.filter((i) => i.exerciseId === exerciseId).map((i) => i.sets))) || undefined

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
