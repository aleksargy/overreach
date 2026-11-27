import { Pencil } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { TrendChart } from '../../components/charts/charts'
import { IconButton, Screen } from '../../components/ui/Screen'
import { Sheet } from '../../components/ui/Sheet'
import { Empty, Section, Segmented, Stat } from '../../components/ui/bits'
import { BUILTIN_EXERCISES, EQUIPMENT } from '../../data/exercises'
import { useStore } from '../../data/store'
import type { Equipment, Exercise, SetEntry } from '../../data/types'
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
  setupsOf,
  stepped,
  strengthOf,
  targetText,
  topOf,
  type BestSet,
  type ExerciseSession,
} from '../../lib/lift'
import { round } from '../../lib/math'
import { EQUIPMENT_LABEL, MOST_STEPS, MUSCLE_LABEL, MoveNote, SetSteps, bodyKgOf, nextFor } from './parts'

/**
 * One lift: what to do next time, how it's moved, and every session you've logged. A lift that's been done with
 * more than one thing (dumbbells, then a cable) has a history for each, and a switch between them at the top: the
 * equipment it's on now is the one with next time's target.
 */
export function ExerciseScreen() {
  const { id } = useParams()
  const w = useWorld()
  const nav = useNavigate()
  const open = useUi((s) => s.open)
  const mine = useStore((s) => s.workouts)
  const [moving, setMoving] = useState(false)
  const ex = id ? w.exerciseById.get(id) : undefined
  const history = useMemo(() => (ex ? historyFor(ex.id, w.workouts) : []), [ex, w.workouts])
  const setups = useMemo(() => (ex ? setupsOf(ex, w.workouts, w.exerciseById) : []), [ex, w.workouts, w.exerciseById])
  if (!ex) {
    return (
      <Screen title="Exercise" back>
        <Empty title="Not found" />
      </Screen>
    )
  }
  // the lift itself: this page may be its sessions on other equipment
  const lift = setups[0] ?? ex
  const { t, sets } = nextFor(w, lift)
  // sets that aren't all at one weight (a pyramid, a ramp) are drawn as steps, each with its numbers
  const steps = stepped(lift, sets) && sets.length <= MOST_STEPS
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
  // sessions of your own on this page can be said to have been on something else: worth offering once the lift has
  // been on more than one thing, or isn't on what it came with
  const own = history.filter((h) => mine.some((x) => x.id === h.workoutId))
  const canMove = own.length > 0 && (setups.length > 1 || (BUILTIN_EXERCISES.find((e) => e.id === lift.id)?.equipment ?? lift.equipment) !== lift.equipment)

  return (
    <Screen
      title={lift.name}
      back
      bare
      actions={
        <IconButton label="Edit exercise" onClick={() => open({ type: 'exercise', exerciseId: lift.id })}>
          <Pencil size={15} />
        </IconButton>
      }
    >
      <div className="label">
        {MUSCLE_LABEL[ex.muscle]} · {EQUIPMENT_LABEL[ex.equipment]}
      </div>
      <h1 className="t-page mt-0.5 text-balance">{lift.name}</h1>
      {lift.notes && <p className="mt-3 text-[15px] leading-snug text-fg-3">{lift.notes}</p>}

      {setups.length > 1 && (
        <div className="mt-4">
          <Segmented
            value={ex.id}
            options={setups.map((e) => ({ value: e.id, label: EQUIPMENT_LABEL[e.equipment] }))}
            onChange={(to) => nav(`/lift/exercise/${to}`, { replace: true })}
          />
        </div>
      )}

      {/* next time is on what the lift is on now */}
      {!ex.variantOf && (
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
      )}

      {history.length > 0 ? (
        <>
          {points.length > 1 && (
            <Section
              title={estimated ? 'Estimated max' : 'Progress'}
              className={ex.variantOf ? '!mt-4' : ''}
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
          <div className={`tile grid grid-cols-3 gap-x-3 ${ex.variantOf && points.length < 2 ? 'mt-4' : 'mt-2.5'}`}>
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

          <Section
            title="Sessions"
            action={
              <span className="flex items-center gap-3">
                {canMove && (
                  <button onClick={() => setMoving(true)} className="link">
                    Equipment
                  </button>
                )}
                <span className="label">{history.length}</span>
              </span>
            }
          >
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

      <Sheet open={moving} onClose={() => setMoving(false)} title="Equipment" kicker={lift.name}>
        {moving && <MoveSessions ex={ex} lift={lift} sessions={own} onDone={() => setMoving(false)} />}
      </Sheet>
    </Screen>
  )
}

/**
 * Say which of a lift's sessions were done with something else: what they were on, and the last session that was.
 * It and every one before it on this page move to that equipment's history, where the lift picks them up again if
 * it goes back to it.
 */
function MoveSessions({ ex, lift, sessions, onDone }: { ex: Exercise; lift: Exercise; sessions: ExerciseSession[]; onDone: () => void }) {
  const move = useStore((s) => s.setDoneWith)
  const say = useUi((s) => s.say)
  // most likely: what the lift came with, if that isn't what this page is on
  const came = BUILTIN_EXERCISES.find((e) => e.id === lift.id)?.equipment
  const [to, setTo] = useState<Equipment | undefined>(came && came !== ex.equipment ? came : undefined)
  const [upTo, setUpTo] = useState<number>()
  const count = upTo === undefined ? 0 : sessions.length - upTo
  const apply = () => {
    if (!to || upTo === undefined) return
    move(lift.id, sessions[upTo].workoutId, to)
    say(`${count} ${count === 1 ? 'session' : 'sessions'} moved to ${EQUIPMENT_LABEL[to]}`)
    onDone()
  }
  return (
    <div className="flex flex-col gap-6 pb-2">
      <div>
        <div className="label mb-2">Done with</div>
        <div className="flex flex-wrap gap-2">
          {EQUIPMENT.filter((e) => e.key !== ex.equipment).map((e) => (
            <button key={e.key} type="button" aria-pressed={to === e.key} onClick={() => setTo(e.key)} className={`chip ${to === e.key ? 'chip-on' : ''}`}>
              {e.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="label mb-1">Up to</div>
        <div className="list">
          {sessions.map((h, i) => {
            const on = upTo !== undefined && i >= upTo
            return (
              <button key={h.workoutId + h.date} type="button" aria-pressed={upTo === i} onClick={() => setUpTo(i)} className="flex w-full items-center gap-3 py-3 text-left">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${on ? 'bg-strength' : 'bg-ink-3'}`} />
                <span className={`meta w-[76px] shrink-0 ${on ? 'text-fg' : ''}`}>{fmt(h.date, 'd MMM yy')}</span>
                <span className={`num min-w-0 flex-1 text-right text-[16px] leading-[1.25] ${on ? '' : 'text-fg-3'}`}>{setsLine(ex, h.sets)}</span>
              </button>
            )
          })}
        </div>
      </div>
      <button onClick={apply} disabled={!to || !count} className="btn-primary w-full disabled:opacity-40">
        {count ? `Move ${count} ${count === 1 ? 'session' : 'sessions'}` : 'Move'}
      </button>
    </div>
  )
}
