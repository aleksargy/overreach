import { differenceInCalendarDays, parseISO } from 'date-fns'
import { ArrowDown, ArrowUp, Check, Minus, Pencil, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { IconButton, Screen } from '../../components/ui/Screen'
import { Empty, inputCls } from '../../components/ui/bits'
import { useStore } from '../../data/store'
import type { RoutineItem } from '../../data/types'
import { useUi } from '../../data/ui'
import { useWorld } from '../../data/world'
import { focusOf, lastDone } from '../../lib/lift'
import { Targets } from './LiftScreen'
import { daysAgo, useBegin } from './parts'

/**
 * One of your workouts: what's in it and what to lift on each exercise, with
 * Start underneath. Edit turns it into the list you build it from.
 */
export function RoutineScreen() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const w = useWorld()
  const nav = useNavigate()
  const save = useStore((s) => s.saveRoutine)
  const remove = useStore((s) => s.deleteRoutine)
  const active = useStore((s) => s.active)
  const open = useUi((s) => s.open)
  const say = useUi((s) => s.say)
  const begin = useBegin()
  const [sure, setSure] = useState(false)
  const r = w.routines.find((x) => x.id === id)
  if (!r) {
    return (
      <Screen title="Workout" back>
        <Empty title="Not found">This workout isn’t on your list any more.</Empty>
      </Screen>
    )
  }
  const editing = params.get('edit') === '1'
  const setEditing = (v: boolean) => {
    if (!v && !r.name.trim()) save({ ...r, name: 'Workout' })
    setSure(false)
    setParams(v ? { edit: '1' } : {}, { replace: true })
  }
  // the list as it stands now, not as it stood when a sheet was opened over it
  const latest = () => useStore.getState().routines.find((x) => x.id === r.id) ?? r
  const setItems = (fn: (items: RoutineItem[]) => RoutineItem[]) => {
    const now = latest()
    save({ ...now, items: fn(now.items) })
  }
  const move = (i: number, d: -1 | 1) =>
    setItems((items) => {
      const j = i + d
      if (j < 0 || j >= items.length) return items
      const out = [...items]
      ;[out[i], out[j]] = [out[j], out[i]]
      return out
    })
  const add = () => open({ type: 'pickExercise', many: true, onPick: (exerciseId) => setItems((items) => [...items, { exerciseId, sets: 3 }]) })
  // on sample data the sample lifter's workouts show too: those aren't yours to delete
  const mine = useStore.getState().routines.some((x) => x.id === r.id)
  const last = lastDone(r, w.workouts)
  const since = last ? differenceInCalendarDays(w.now, parseISO(last.start)) : undefined

  return (
    <Screen
      title={r.name || 'Workout'}
      back
      bare
      actions={
        <IconButton label={editing ? 'Done' : 'Edit workout'} onClick={() => setEditing(!editing)} active={editing}>
          {editing ? <Check size={17} strokeWidth={2.25} /> : <Pencil size={15} />}
        </IconButton>
      }
    >
      {editing ? (
        <>
          <label className="block pt-2">
            <span className="label mb-2 block">Name</span>
            <input
              value={r.name}
              onChange={(e) => save({ ...r, name: e.target.value })}
              placeholder="Push, Upper A, Saturday…"
              maxLength={32}
              className={inputCls}
              // a new workout's stand-in name is selected, so typing replaces it
              autoFocus={!r.items.length}
              onFocus={(e) => !r.items.length && e.currentTarget.select()}
            />
          </label>
          <div className="list mt-6">
            {r.items.map((it, i) => {
              const ex = w.exerciseById.get(it.exerciseId)
              if (!ex) return null
              return (
                <div key={`${it.exerciseId}-${i}`} className="py-3.5">
                  <div className="flex items-center gap-1">
                    <span className="min-w-0 flex-1 truncate text-[16px] font-semibold">{ex.name}</span>
                    <button
                      aria-label={`Move ${ex.name} up`}
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                      className="press grid h-8 w-8 place-items-center text-fg-3 disabled:opacity-25"
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      aria-label={`Move ${ex.name} down`}
                      disabled={i === r.items.length - 1}
                      onClick={() => move(i, 1)}
                      className="press grid h-8 w-8 place-items-center text-fg-3 disabled:opacity-25"
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      aria-label={`Remove ${ex.name}`}
                      onClick={() => setItems((items) => items.filter((_, k) => k !== i))}
                      className="press -mr-2 grid h-8 w-8 place-items-center text-fg-3"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2.5">
                    <button
                      aria-label={`One set fewer of ${ex.name}`}
                      disabled={it.sets <= 1}
                      onClick={() => setItems((items) => items.map((x, k) => (k === i ? { ...x, sets: x.sets - 1 } : x)))}
                      className="press grid h-9 w-9 place-items-center rounded-full text-fg-2 ring-1 ring-inset ring-fg/25 disabled:opacity-30"
                    >
                      <Minus size={15} />
                    </button>
                    <span className="num w-5 text-center text-[20px]">{it.sets}</span>
                    <button
                      aria-label={`One more set of ${ex.name}`}
                      disabled={it.sets >= 10}
                      onClick={() => setItems((items) => items.map((x, k) => (k === i ? { ...x, sets: x.sets + 1 } : x)))}
                      className="press grid h-9 w-9 place-items-center rounded-full text-fg-2 ring-1 ring-inset ring-fg/25 disabled:opacity-30"
                    >
                      <Plus size={15} />
                    </button>
                    <span className="meta">{it.sets === 1 ? 'set' : 'sets'} of</span>
                    <button onClick={() => open({ type: 'exercise', exerciseId: ex.id })} className="chip ml-auto h-9">
                      {ex.repRange[0]}–{ex.repRange[1]}
                      {ex.kind === 'duration' ? ' s' : ' reps'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          <button onClick={add} className="btn-ghost mt-4 w-full">
            <Plus size={18} /> Add exercises
          </button>
          {mine && (
            <button
              onClick={() => {
                if (!sure) return setSure(true)
                remove(r.id)
                say(`${r.name || 'Workout'} deleted`)
                nav('/lift', { replace: true })
              }}
              className={`mt-3 h-12 w-full rounded-[5px] text-[14.5px] font-semibold ${sure ? 'bg-bad text-ink-0' : 'text-fg-3'}`}
            >
              {sure ? 'Tap again to delete it' : 'Delete workout'}
            </button>
          )}
        </>
      ) : (
        <>
          <div className="meta pt-2">{[focusOf(r, w.exerciseById), daysAgo(since)].filter(Boolean).join(' · ')}</div>
          <h1 className="t-page mt-2 text-balance">{r.name}</h1>
          {r.items.length ? (
            <>
              <Targets w={w} routine={r} className="mt-6" />
              <button onClick={() => begin(r)} className="btn-primary mt-6 w-full">
                {active ? 'Back to your workout' : 'Start'}
              </button>
            </>
          ) : (
            <div className="mt-6">
              <Empty
                title="Nothing in it yet"
                action={
                  <button onClick={() => setEditing(true)} className="btn-primary mt-3 w-full">
                    Add exercises
                  </button>
                }
              >
                Pick the exercises and how many sets of each. The weights sort themselves out after your first session.
              </Empty>
            </div>
          )}
        </>
      )}
    </Screen>
  )
}
