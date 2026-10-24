import { Pencil } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useParams } from 'react-router'
import { TrendChart } from '../../components/charts/charts'
import { IconButton, Screen } from '../../components/ui/Screen'
import { Empty, Section, Stat } from '../../components/ui/bits'
import type { Exercise, SetEntry } from '../../data/types'
import { useUi } from '../../data/ui'
import { useWorld } from '../../data/world'
import { fmt } from '../../lib/format'
import { bestE1rm, e1rm, fmtKg, fmtRpe, hasE1rm, historyFor, rpeTone, setLoad, suggest } from '../../lib/lift'
import { round } from '../../lib/math'
import { EQUIPMENT_LABEL, MUSCLE_LABEL, SuggestionTag, setText, targetText } from './parts'

const KIND_LABEL = { weight: 'Weight × reps', 'weighted-bodyweight': 'Bodyweight + kg', bodyweight: 'Reps only', duration: 'Time hold' } as const

/** What the chart tracks: strength for loaded lifts, the best set for the rest. */
function sessionScore(ex: Exercise, sets: SetEntry[]): number {
  if (ex.kind === 'duration') return Math.max(0, ...sets.map((s) => s.secs ?? 0))
  if (ex.kind === 'bodyweight') return Math.max(0, ...sets.filter((s) => s.kind !== 'warmup').map((s) => s.reps ?? 0))
  if (ex.kind === 'weighted-bodyweight') return Math.max(0, ...sets.filter((s) => s.kind !== 'warmup').map((s) => s.kg ?? 0))
  return bestE1rm(ex, sets)
}

export function ExerciseScreen() {
  const { id } = useParams()
  const w = useWorld()
  const open = useUi((s) => s.open)
  const ex = id ? w.exerciseById.get(id) : undefined
  const history = useMemo(() => (ex ? historyFor(ex.id, w.workouts) : []), [ex, w.workouts])
  if (!ex) {
    return (
      <Screen title="Exercise" back>
        <Empty title="Not found">This exercise isn't in your library.</Empty>
      </Screen>
    )
  }
  const s = suggest(ex, history, w.readiness?.score)
  const loaded = ex.kind === 'weight' || ex.kind === 'weighted-bodyweight'
  const e1 = hasE1rm(ex)
  const points = [...history].reverse().map((h) => ({ t: Date.parse(h.date), v: round(sessionScore(ex, h.sets), 1) }))
  const avg = points.map((p, i) => ({ t: p.t, v: Math.max(...points.slice(0, i + 1).map((x) => x.v)) }))
  const all = history.flatMap((h) => h.sets.filter((x) => x.kind !== 'warmup'))
  const best = points.length ? Math.max(...points.map((p) => p.v)) : 0
  const heaviest = Math.max(0, ...all.map((x) => setLoad(ex, x)))
  const bestSet = all.reduce<SetEntry | undefined>((b, x) => (!b || (x.kg ?? 0) * (x.reps ?? 0) > (b.kg ?? 0) * (b.reps ?? 0) ? x : b), undefined)
  const unit = ex.kind === 'duration' ? 's' : ex.kind === 'bodyweight' ? 'reps' : 'kg'

  return (
    <Screen
      title={ex.name}
      back
      actions={
        <IconButton label="Edit exercise" onClick={() => open({ type: 'exercise', exerciseId: ex.id })}>
          <Pencil size={16} />
        </IconButton>
      }
    >
      <div className="pt-1 font-mono text-[10.5px] uppercase tracking-[0.08em] text-fg-3">
        {MUSCLE_LABEL[ex.muscle]} · {EQUIPMENT_LABEL[ex.equipment]} · {KIND_LABEL[ex.kind]}
        {ex.custom ? ' · custom' : ''}
      </div>
      <h1 className="mt-2 font-display text-[46px] font-black uppercase leading-[0.86]">{ex.name}</h1>
      {ex.notes && <p className="mt-2 text-[14px] text-fg-3">{ex.notes}</p>}

      <section className="chamfer relative mt-5 overflow-hidden rounded-card border border-line bg-ink-1 p-4">
        <div className="spectrum absolute inset-x-0 top-0 h-[2px] opacity-80" />
        <div className="flex items-center justify-between">
          <span className="label">Next time</span>
          <SuggestionTag s={s} timed={ex.kind === 'duration'} />
        </div>
        <div className="num mt-2 text-[34px]">{targetText(ex, s)}</div>
        <p className="mt-2 text-[14px] leading-snug text-fg-2">{s.text}</p>
        <div className="mt-3 font-mono text-[10.5px] uppercase tracking-[0.06em] text-fg-4">
          {ex.repRange[0]}–{ex.repRange[1]}
          {ex.kind === 'duration' ? 's' : ' reps'} · target RPE {fmtRpe(ex.targetRpe)}
          {loaded && ex.increment ? ` · +${fmtKg(ex.increment)} kg steps` : ''}
        </div>
      </section>

      {history.length > 0 ? (
        <>
          <div className="card mt-3 grid grid-cols-3 gap-3 p-4">
            {e1 ? (
              <>
                <Stat label="Best e1RM" value={fmtKg(Math.round(best))} unit="kg" size="sm" />
                <Stat label="Heaviest" value={fmtKg(heaviest)} unit="kg" size="sm" />
                <Stat label="Best set" value={bestSet ? setText(ex, bestSet).replace(' × ', '×') : '–'} size="sm" />
              </>
            ) : ex.kind === 'weighted-bodyweight' ? (
              <>
                <Stat label="Most added" value={`+${fmtKg(best)}`} unit="kg" size="sm" />
                <Stat label="Most reps" value={String(Math.max(0, ...all.map((x) => x.reps ?? 0)))} size="sm" />
                <Stat label="Sessions" value={String(history.length)} size="sm" />
              </>
            ) : (
              <>
                <Stat label={ex.kind === 'duration' ? 'Longest' : 'Most reps'} value={String(best)} unit={unit} size="sm" />
                <Stat label="Sets" value={String(all.length)} size="sm" />
                <Stat label="Sessions" value={String(history.length)} size="sm" />
              </>
            )}
          </div>

          {points.length > 1 && (
            <Section title={e1 ? 'Estimated 1RM' : ex.kind === 'weighted-bodyweight' ? 'Most added weight' : ex.kind === 'duration' ? 'Longest hold' : 'Most reps'} action={<span className="font-mono text-[10.5px] uppercase text-fg-3">{points.length} sessions</span>}>
              <div className="card p-4">
                <TrendChart points={points} avg={avg} format={(v) => `${fmtKg(Math.round(v))}`} xLabel={(t) => fmt(new Date(t).toISOString(), 'd MMM')} />
                <p className="mt-2 text-[12px] leading-snug text-fg-3">
                  {e1 ? 'Dots are each session’s best set, as a one-rep max worked out from weight, reps and RPE. The line is your best so far.' : 'Dots are each session, the line is your best so far.'}
                </p>
              </div>
            </Section>
          )}

          <Section title="History">
            <div className="flex flex-col gap-2">
              {history.slice(0, 12).map((h) => (
                <Link key={h.workoutId + h.date} to={`/lift/history/${h.workoutId}`} className="press card block p-3.5">
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-fg-3">{fmt(h.date, 'EEE d MMM yyyy')}</span>
                    {e1 && <span className="font-mono text-[10.5px] text-fg-3">e1RM {fmtKg(Math.round(bestE1rm(ex, h.sets)))}</span>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {h.sets.map((x) => (
                      <span key={x.id} className={`inline-flex items-center gap-1.5 rounded-[6px] border px-2 py-1 font-mono text-[11.5px] ${x.kind === 'warmup' ? 'border-line text-fg-4' : 'border-line-2 text-fg'}`}>
                        {setText(ex, x)}
                        {x.rpe ? <span className={`rounded-[3px] px-1 text-[10px] font-semibold ${rpeTone(x.rpe)}`}>{fmtRpe(x.rpe)}</span> : null}
                      </span>
                    ))}
                  </div>
                </Link>
              ))}
            </div>
          </Section>
        </>
      ) : (
        <div className="mt-3">
          <Empty title="No sets yet">Log it once and the next session gets a target.</Empty>
        </div>
      )}
      {e1 && history.length > 0 && <RepMaxTable ex={ex} best={best} />}
    </Screen>
  )
}

/** What the current e1RM says you could do for 1–10 reps, using the same formula backwards. */
function RepMaxTable({ ex, best }: { ex: Exercise; best: number }) {
  const step = ex.increment || 2.5
  const rows = [1, 3, 5, 8, 10].map((reps) => {
    let kg = best
    // walk down until the estimate fits
    while (kg > 0 && e1rm(kg, reps) > best) kg -= 0.25
    return { reps, kg: Math.floor(kg / step) * step }
  })
  return (
    <Section title="Rep maxes" action={<span className="font-mono text-[10.5px] uppercase text-fg-3">from e1RM</span>}>
      <div className="card grid grid-cols-5 divide-x divide-line">
        {rows.map((r) => (
          <div key={r.reps} className="px-2 py-3 text-center">
            <div className="label mb-1">{r.reps} RM</div>
            <div className="num text-[22px]">{fmtKg(r.kg)}</div>
          </div>
        ))}
      </div>
    </Section>
  )
}
