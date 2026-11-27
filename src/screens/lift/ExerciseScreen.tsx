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
import { goalProgress } from '../../lib/goals'
import {
  amount,
  bestSet,
  gainOf,
  gainText,
  historyFor,
  loaded,
  mainSets,
  oneRm,
  openRun,
  setText,
  setsLine,
  stepped,
  strengthOf,
  targetText,
  topOf,
  type BestSet,
} from '../../lib/lift'
import { round } from '../../lib/math'
import { EQUIPMENT_LABEL, MOST_STEPS, MUSCLE_LABEL, MoveNote, SetSteps, bodyKgOf, nextFor } from './parts'

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
  const { t, sets } = nextFor(w, ex)
  // sets that aren't all at one weight (a pyramid, a ramp) are drawn as steps, each with its numbers
  const steps = stepped(ex, sets) && sets.length <= MOST_STEPS
  const bodyKg = bodyKgOf(w)
  // oldest first: how strong each session says you are, its estimated max when there's a load to estimate from
  const sessions = [...history].reverse()
  const points = sessions.map((h) => ({ t: Date.parse(h.date), v: strengthOf(ex, h, bodyKg) }))
  const latest = points[points.length - 1]
  const body = ex.kind === 'weighted-bodyweight' ? bodyKg : 0
  const estimated = loaded(ex) && body !== undefined
  const all = history.flatMap((h) => mainSets(h.sets))
  const top = Math.max(0, ...history.map((h) => topOf(ex, h.sets)))
  // the set that says the most for a one-rep max, and what the best set has gained since the first session
  const best = loaded(ex) ? history.map((h) => bestSet(ex, h, bodyKg)).reduce<BestSet | undefined>((a, b) => (b && (!a || b.max > a.max) ? b : a), undefined) : undefined
  const bestSaid = best ? setText(ex, { kg: best.kg || undefined, reps: best.reps } as SetEntry) : ''
  const gain = sessions.length > 1 ? gainText(ex, gainOf(ex, sessions[0], sessions[sessions.length - 1], bodyKg)) : ''
  // three numbers on one row: a long best set ("+12.5 × 10") steps them all down a size
  const size = bestSaid.length > 8 ? 'sm' : 'md'
  // the goal for it in the programme you're on, ahead of the line until it's reached
  const run = w.programme && openRun(w.programme)
  const g = estimated && latest ? run?.goals?.find((x) => x.exerciseId === ex.id) : undefined
  const by = g ? Date.parse(`${g.by}T12:00:00`) : 0
  const goal =
    g && run && by > latest.t && !goalProgress(g, ex, history, run, w.now, bodyKg).done
      ? { t: by, v: oneRm(g.kg + (body ?? 0), g.reps), label: setText(ex, { kg: g.kg || undefined, reps: g.reps } as SetEntry) }
      : undefined
  // weight added to you: the estimated max is said as what you'd add
  const max = estimated && latest ? round(latest.v - (body ?? 0), 0) : 0

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
        {steps ? (
          <SetSteps ex={ex} sets={sets} bodyKg={bodyKgOf(w)} />
        ) : (
          // a long one ("Bodyweight × 8") steps down a size to stay on one line
          <div className={`num-hero whitespace-nowrap text-strength-head ${targetText(ex, t).length > 11 ? 'text-[42px]' : 'text-[56px]'}`}>{targetText(ex, t)}</div>
        )}
      </section>

      {history.length > 0 ? (
        <>
          {points.length > 1 && (
            <Section
              title={estimated ? 'Estimated max' : 'Progress'}
              action={
                max > 0 && (
                  <span className="num text-[17px]">
                    {ex.kind === 'weighted-bodyweight' ? '+' : ''}
                    {max}
                    <span className="unit">kg</span>
                  </span>
                )
              }
            >
              <TrendChart points={points} avg={points} height={150} color="rgb(var(--strength))" xLabel={(x) => fmt(new Date(x).toISOString(), 'd MMM')} goal={goal} />
            </Section>
          )}
          <div className="tile mt-2.5 grid grid-cols-3 gap-x-3">
            <Stat
              size={size}
              label={loaded(ex) ? 'Heaviest' : ex.kind === 'duration' ? 'Longest' : 'Most'}
              value={amount(ex, top).split(' ')[0]}
              unit={amount(ex, top).split(' ')[1]}
            />
            {best ? <Stat size={size} label="Best set" value={bestSaid} /> : <Stat size={size} label="Sets" value={String(all.length)} />}
            {gain ? (
              <Stat size={size} label={`Since ${fmt(sessions[0].date, 'MMM')}`} value={gain.split(' ')[0]} unit={gain.split(' ')[1]} />
            ) : (
              <Stat size={size} label="Sessions" value={String(history.length)} />
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
