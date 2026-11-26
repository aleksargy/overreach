import { Pencil } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useParams } from 'react-router'
import { TrendChart } from '../../components/charts/charts'
import { IconButton, Screen } from '../../components/ui/Screen'
import { Empty, Section, Stat } from '../../components/ui/bits'
import type { SetEntry } from '../../data/types'
import { useUi } from '../../data/ui'
import { useWorld } from '../../data/world'
import { fmt } from '../../lib/format'
import { amount, historyFor, loaded, mainSets, setText, setsLine, targetText, topOf } from '../../lib/lift'
import { EQUIPMENT_LABEL, MUSCLE_LABEL, MoveNote, nextFor } from './parts'

/** One lift: what to do next time, how it's moved, and every session you've logged. */
export function ExerciseScreen() {
  const { id } = useParams()
  const w = useWorld()
  const open = useUi((s) => s.open)
  const ex = id ? w.exerciseById.get(id) : undefined
  const history = useMemo(() => (ex ? historyFor(ex.id, w.workouts) : []), [ex, w.workouts])
  if (!ex) {
    return (
      <Screen title="Exercise" back>
        <Empty title="Not found" />
      </Screen>
    )
  }
  const t = nextFor(w, ex)
  const points = [...history].reverse().map((h) => ({ t: Date.parse(h.date), v: topOf(ex, h.sets) }))
  const all = history.flatMap((h) => mainSets(h.sets))
  const top = points.length ? Math.max(...points.map((p) => p.v)) : 0
  // the set that moved the most: weight times reps for a loaded lift, the count for the rest
  const worth = (s: SetEntry) => (loaded(ex) ? (s.kg || 1) * (s.reps ?? 0) : (s.reps ?? s.secs ?? 0))
  const bestSet = all.reduce<SetEntry | undefined>((b, x) => (!b || worth(x) > worth(b) ? x : b), undefined)
  const gained = points.length > 1 ? points[points.length - 1].v - points[0].v : 0

  return (
    <Screen
      title={ex.name}
      back
      bare
      actions={
        <IconButton label="Edit exercise" onClick={() => open({ type: 'exercise', exerciseId: ex.id })}>
          <Pencil size={15} />
        </IconButton>
      }
    >
      <div className="label">
        {MUSCLE_LABEL[ex.muscle]} · {EQUIPMENT_LABEL[ex.equipment]}
      </div>
      <h1 className="t-page mt-0.5 text-balance">{ex.name}</h1>
      {ex.notes && <p className="mt-3 text-[15px] leading-snug text-fg-3">{ex.notes}</p>}

      <section className="hero mt-4 flex flex-col gap-2 bg-strength-tint">
        <div className="flex items-baseline justify-between gap-3 text-[13px] font-bold text-strength-label">
          <h2>Next time</h2>
          <MoveNote t={t} plain className="text-[12.5px] font-semibold" />
        </div>
        {/* a long one ("Bodyweight × 8") steps down a size to stay on one line */}
        <div className={`num-hero whitespace-nowrap text-strength-head ${targetText(ex, t).length > 11 ? 'text-[42px]' : 'text-[56px]'}`}>{targetText(ex, t)}</div>
      </section>

      {history.length > 0 ? (
        <>
          {points.length > 1 && (
            <Section title="Progress">
              <TrendChart points={points} avg={points} height={150} color="rgb(var(--strength))" xLabel={(x) => fmt(new Date(x).toISOString(), 'd MMM')} />
            </Section>
          )}
          <div className="tile mt-2.5 grid grid-cols-3 gap-x-3">
            <Stat label={loaded(ex) ? 'Heaviest' : ex.kind === 'duration' ? 'Longest' : 'Most'} value={amount(ex, top).split(' ')[0]} unit={amount(ex, top).split(' ')[1]} />
            {bestSet && loaded(ex) ? <Stat label="Best set" value={setText(ex, bestSet)} /> : <Stat label="Sets" value={String(all.length)} />}
            {points.length > 1 ? (
              <Stat label={`Since ${fmt(history[history.length - 1].date, 'MMM')}`} value={amount(ex, gained, true).split(' ')[0]} unit={amount(ex, gained, true).split(' ')[1]} />
            ) : (
              <Stat label="Sessions" value={String(history.length)} />
            )}
          </div>

          <Section title="Sessions" action={<span className="label">{history.length}</span>}>
            <div className="list">
              {history.slice(0, 12).map((h) => (
                <Link key={h.workoutId + h.date} to={`/lift/history/${h.workoutId}`} className="flex items-baseline gap-3 py-3 transition-colors duration-150 active:bg-ink-2">
                  <span className="meta w-[76px] shrink-0">{fmt(h.date, 'd MMM yy')}</span>
                  <span className="num min-w-0 flex-1 text-right text-[17px] leading-[1.25]">{setsLine(ex, h.sets)}</span>
                </Link>
              ))}
            </div>
          </Section>
        </>
      ) : (
        <div className="mt-9">
          <Empty title="No sets yet" />
        </div>
      )}
    </Screen>
  )
}
