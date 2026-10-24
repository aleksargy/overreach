import { Repeat2, Trash2, Trophy } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Screen } from '../../components/ui/Screen'
import { Empty, Section } from '../../components/ui/bits'
import { useStore } from '../../data/store'
import { useUi } from '../../data/ui'
import { useWorld } from '../../data/world'
import { dur, fmt } from '../../lib/format'
import { bestE1rm, fmtKg, fmtRpe, hasE1rm, prsFor, rpeTone, volume, workingSets } from '../../lib/lift'
import { srpeLoad } from '../../lib/load'
import { MUSCLE_LABEL, setText, tonnes } from './parts'

export function WorkoutScreen() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const fresh = params.get('fresh') === '1'
  const w = useWorld()
  const nav = useNavigate()
  const start = useStore((s) => s.startWorkout)
  const active = useStore((s) => s.active)
  const remove = useStore((s) => s.deleteWorkout)
  const setOpen = useUi((s) => s.setWorkoutOpen)
  const say = useUi((s) => s.say)
  const [sure, setSure] = useState(false)
  const wk = w.workouts.find((x) => x.id === id)
  const prs = useMemo(() => (wk ? prsFor(wk, w.workouts, w.exerciseById) : []), [wk, w])

  if (!wk) {
    return (
      <Screen title="Workout" back>
        <Empty title="Not found">This workout may have been deleted.</Empty>
      </Screen>
    )
  }
  const secs = wk.end ? (Date.parse(wk.end) - Date.parse(wk.start)) / 1000 : 0
  const repeat = () => {
    if (active) return setOpen(true)
    start({
      id: wk.routineId ?? `again-${wk.id}`,
      name: wk.name,
      focus: '',
      items: wk.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets.filter((s) => s.kind !== 'warmup').length || 1 })),
    })
    setOpen(true)
  }

  return (
    <Screen title={wk.name} back>
      {fresh && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-1">
          <span className="bg-z2 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-0">Saved</span>
        </motion.div>
      )}
      <div className="pt-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-fg-3">{fmt(wk.start, 'EEEE d MMMM · HH:mm')}</div>
      <h1 className="mt-2 font-display text-[52px] font-black uppercase leading-[0.86]">{wk.name}</h1>

      <div className="card mt-5 grid grid-cols-4 divide-x divide-line">
        {[
          { label: 'Time', value: dur(secs) },
          { label: 'Sets', value: String(workingSets(wk)) },
          { label: 'Volume', value: tonnes(volume(wk)).replace(' ', '') },
          { label: 'RPE', value: wk.srpe ? String(wk.srpe) : '–' },
        ].map((s) => (
          <div key={s.label} className="px-3 py-3.5">
            <div className="label mb-1.5">{s.label}</div>
            <div className="num text-[24px]">{s.value}</div>
          </div>
        ))}
      </div>
      {wk.srpe && secs >= 300 && (
        <p className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.06em] text-fg-4">
          Training load {Math.round(srpeLoad(secs / 60, wk.srpe))}, counted with your runs and games
        </p>
      )}

      {prs.length > 0 && (
        <Section title={fresh ? 'New records' : 'Records set'}>
          <div className="flex flex-col gap-2">
            {prs.map((p, i) => {
              const ex = w.exerciseById.get(p.exerciseId)
              return (
                <motion.div
                  key={p.exerciseId}
                  initial={fresh ? { opacity: 0, x: -14 } : false}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.08 }}
                  className="chamfer-sm relative flex items-center gap-3 overflow-hidden rounded-card border border-z3/30 bg-z3/[0.08] p-3"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-z3 text-ink-0">
                    <Trophy size={18} strokeWidth={2.4} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold">{ex?.name}</span>
                    <span className="block font-mono text-[11px] uppercase tracking-[0.06em] text-z3">{p.label}</span>
                  </span>
                </motion.div>
              )
            })}
          </div>
        </Section>
      )}

      <Section title="Exercises">
        <div className="flex flex-col gap-2">
          {wk.exercises.map((we) => {
            const ex = w.exerciseById.get(we.exerciseId)
            if (!ex) return null
            const best = bestE1rm(ex, we.sets)
            let n = 0
            return (
              <Link key={we.id} to={`/lift/exercise/${ex.id}`} className="press card block overflow-hidden">
                <div className="flex items-baseline justify-between gap-3 px-3.5 pb-2 pt-3">
                  <span className="min-w-0">
                    <span className="block truncate font-display text-[20px] font-extrabold uppercase leading-none">{ex.name}</span>
                    <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.06em] text-fg-3">{MUSCLE_LABEL[ex.muscle]}</span>
                  </span>
                  {best > 0 && hasE1rm(ex) && <span className="shrink-0 font-mono text-[10.5px] text-fg-3">e1RM {fmtKg(Math.round(best))}</span>}
                </div>
                {we.sets.map((s) => {
                  const label = s.kind === 'warmup' ? 'W' : s.kind === 'drop' ? 'D' : s.kind === 'failure' ? 'F' : String(++n)
                  return (
                    <div key={s.id} className="grid grid-cols-[28px_1fr_auto] items-center gap-2 border-t border-line px-3.5 py-2">
                      <span className={`font-display text-[16px] font-black ${s.kind === 'warmup' ? 'text-z1' : 'text-fg-3'}`}>{label}</span>
                      <span className={`num text-[19px] ${s.kind === 'warmup' ? 'text-fg-3' : ''}`}>{setText(ex, s)}</span>
                      {s.rpe ? <span className={`rounded-[5px] px-1.5 py-0.5 font-mono text-[11px] font-semibold ${rpeTone(s.rpe)}`}>RPE {fmtRpe(s.rpe)}</span> : <span />}
                    </div>
                  )
                })}
              </Link>
            )
          })}
        </div>
      </Section>

      <div className="mt-8 grid grid-cols-2 gap-2">
        <button onClick={repeat} className="btn-ghost">
          <Repeat2 size={17} /> Do it again
        </button>
        {wk.source !== 'sample' ? (
          <button
            onClick={() => {
              if (!sure) return setSure(true)
              remove(wk.id)
              say('Workout deleted')
              nav('/lift?tab=history', { replace: true })
            }}
            className={`btn ${sure ? 'bg-z5 text-ink-0' : 'border border-line-2 text-fg-3'}`}
          >
            <Trash2 size={16} /> {sure ? 'Tap to confirm' : 'Delete'}
          </button>
        ) : (
          <Link to="/lift" className="btn border border-line-2 text-fg-3">
            Back to Lift
          </Link>
        )}
      </div>
    </Screen>
  )
}
