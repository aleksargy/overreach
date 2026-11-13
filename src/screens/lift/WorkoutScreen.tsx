import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Screen } from '../../components/ui/Screen'
import { Empty, Section, Stat } from '../../components/ui/bits'
import { useStore } from '../../data/store'
import { useUi } from '../../data/ui'
import { useWorld } from '../../data/world'
import { dur, fmt } from '../../lib/format'
import { recordsIn, setsLine, workingSets } from '../../lib/lift'

const EFFORT = ['', 'Easy', 'Easy', 'Easy', 'Easy', 'Solid', 'Solid', 'Hard', 'Hard', 'All out', 'All out']

/** A session you've finished: what you did, and anything it set a new best in. */
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
  const records = useMemo(() => (wk ? recordsIn(wk, w.workouts, w.exerciseById) : []), [wk, w])

  if (!wk) {
    return (
      <Screen title="Workout" back>
        <Empty title="Not found">This session may have been deleted.</Empty>
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
    <Screen title={wk.name} back bare>
      <div className="label">
        {fresh && <span className="mr-2 font-semibold text-good">Saved</span>}
        {fmt(wk.start, 'EEEE d MMMM · HH:mm')}
      </div>
      <h1 className="t-page mt-0.5 text-balance">{wk.name}</h1>

      <div className="mt-7 grid grid-cols-3 gap-x-3">
        <Stat label="Time" value={dur(secs)} />
        <Stat label="Sets" value={String(workingSets(wk))} />
        {wk.srpe ? <Stat label="It felt" value={EFFORT[Math.round(wk.srpe)] ?? ''} /> : null}
      </div>

      {records.length > 0 && (
        <Section title={records.length === 1 ? 'A new best' : 'New bests'}>
          <div className="list">
            {records.map((r) => {
              const value = <span className="num whitespace-nowrap text-[22px]">{r.value}</span>
              return (
                <Link key={r.exerciseId} to={`/lift/exercise/${r.exerciseId}`} className="flex items-center gap-5 py-4 transition-colors duration-150 active:bg-ink-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold leading-5">{w.exerciseById.get(r.exerciseId)?.name}</span>
                    <span className="meta block">{r.text}</span>
                  </span>
                  {/* a new best is said in sage */}
                  <span className="shrink-0 text-football">{value}</span>
                </Link>
              )
            })}
          </div>
        </Section>
      )}

      <Section title="What you did">
        <div className="list">
          {wk.exercises.map((we) => {
            const ex = w.exerciseById.get(we.exerciseId)
            if (!ex) return null
            return (
              <Link key={we.id} to={`/lift/exercise/${ex.id}`} className="flex items-baseline gap-3 py-3 transition-colors duration-150 active:bg-ink-2">
                <span className="min-w-0 flex-1 truncate text-[16px] font-semibold">{ex.name}</span>
                <span className="num max-w-[58%] truncate text-right text-[17px]">{setsLine(ex, we.sets)}</span>
              </Link>
            )
          })}
        </div>
      </Section>

      <div className="mt-9 grid grid-cols-2 gap-2">
        <button onClick={repeat} className="btn-ghost">
          Do it again
        </button>
        {wk.source !== 'sample' ? (
          <button
            onClick={() => {
              if (!sure) return setSure(true)
              remove(wk.id)
              say('Session deleted')
              nav('/lift/history', { replace: true })
            }}
            className={`btn ${sure ? 'bg-bad text-ink-0' : 'text-fg-3'}`}
          >
            {sure ? 'Tap to confirm' : 'Delete'}
          </button>
        ) : (
          <Link to="/lift" className="btn text-fg-3">
            Back to Lift
          </Link>
        )}
      </div>
    </Screen>
  )
}
