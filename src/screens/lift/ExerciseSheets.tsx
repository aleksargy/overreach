import { Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Sheet } from '../../components/ui/Sheet'
import { Field, Stepper, inputCls } from '../../components/ui/bits'
import { EQUIPMENT, KINDS, MUSCLES } from '../../data/exercises'
import { useStore } from '../../data/store'
import type { Equipment, Exercise, ExerciseKind, Muscle } from '../../data/types'
import { useUi } from '../../data/ui'
import { useWorld } from '../../data/world'
import { fmtKg, fmtRpe, historyFor } from '../../lib/lift'
import { uid } from '../../lib/rng'
import { EQUIPMENT_LABEL, MUSCLE_LABEL } from './parts'

const RPES = [7, 7.5, 8, 8.5, 9]
const INCREMENTS = [1, 1.25, 2, 2.5, 5, 10]
const RESTS = [60, 90, 120, 150, 180, 240]
const restLabel = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/** Create a custom exercise, or tune any exercise's targets. */
export function ExerciseSheet() {
  const sheet = useUi((s) => s.sheet)
  const close = useUi((s) => s.close)
  const open = sheet?.type === 'exercise'
  const editing = open && !!sheet.exerciseId
  return (
    <Sheet open={open} onClose={close} title={editing ? 'Edit exercise' : 'New exercise'} kicker={editing ? 'Targets and progression' : 'Custom'}>
      {open && <ExerciseForm key={sheet.exerciseId ?? 'new'} exerciseId={sheet.exerciseId} initialName={sheet.name} onSaved={sheet.onSaved} />}
    </Sheet>
  )
}

function Chips<T extends string | number>({
  value,
  options,
  onChange,
  format = String,
}: {
  value: T
  options: readonly T[] | { key: T; label: string }[]
  onChange: (v: T) => void
  format?: (v: T) => string
}) {
  const list = (options as (T | { key: T; label: string })[]).map((o) => (typeof o === 'object' ? o : { key: o, label: format(o) }))
  return (
    <div className="flex flex-wrap gap-2">
      {list.map((o) => (
        <button key={String(o.key)} type="button" onClick={() => onChange(o.key)} className={`chip ${value === o.key ? 'chip-on' : ''}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function ExerciseForm({ exerciseId, initialName, onSaved }: { exerciseId?: string; initialName?: string; onSaved?: (id: string) => void }) {
  const w = useWorld()
  const saveExercise = useStore((s) => s.saveExercise)
  const editExercise = useStore((s) => s.editExercise)
  const close = useUi((s) => s.close)
  const say = useUi((s) => s.say)
  const base = exerciseId ? w.exerciseById.get(exerciseId) : undefined
  const [name, setName] = useState(base?.name ?? initialName ?? '')
  const [muscle, setMuscle] = useState<Muscle>(base?.muscle ?? 'chest')
  const [equipment, setEquipment] = useState<Equipment>(base?.equipment ?? 'dumbbell')
  const [kind, setKind] = useState<ExerciseKind>(base?.kind ?? 'weight')
  const [lo, setLo] = useState(base?.repRange[0] ?? 8)
  const [hi, setHi] = useState(base?.repRange[1] ?? 12)
  const [targetRpe, setRpe] = useState(base?.targetRpe ?? 8)
  const [increment, setInc] = useState(base?.increment ?? 2.5)
  const [restS, setRest] = useState(base?.restS ?? 90)
  const [notes, setNotes] = useState(base?.notes ?? '')
  const timed = kind === 'duration'
  const weighted = kind === 'weight' || kind === 'weighted-bodyweight'
  const clash = !base && w.exercises.some((e) => e.name.toLowerCase() === name.trim().toLowerCase())

  const save = () => {
    const patch: Partial<Exercise> = {
      name: name.trim(),
      muscle,
      equipment,
      kind,
      repRange: [Math.min(lo, hi), Math.max(lo, hi)],
      targetRpe,
      increment: weighted ? increment : 0,
      restS,
      notes: notes.trim() || undefined,
    }
    if (base) {
      editExercise(base.id, patch)
      say(`${patch.name} updated`)
      close()
      return
    }
    const id = `custom-${name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}-${uid().slice(0, 4)}`
    saveExercise({ id, custom: true, ...(patch as Omit<Exercise, 'id'>) })
    say(`${patch.name} added`)
    close()
    onSaved?.(id)
  }

  return (
    <div className="flex flex-col gap-6 pb-2">
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Landmine press" className={inputCls} autoFocus={!base} />
      </Field>
      {clash && <p className="-mt-4 text-[13px] text-warn">You already have an exercise with that name.</p>}

      <div>
        <div className="label mb-2">Tracked as</div>
        <div className="grid grid-cols-2 gap-2">
          {KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => setKind(k.key)}
              className={`press rounded-[10px] border p-3 text-left text-[13.5px] font-semibold leading-snug ${kind === k.key ? 'border-fg bg-ink-3' : 'border-line-2 bg-ink-1 text-fg-2'}`}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="label mb-2">Main muscle</div>
        <Chips value={muscle} options={MUSCLES} onChange={setMuscle} />
      </div>

      <div>
        <div className="label mb-2">Equipment</div>
        <Chips value={equipment} options={EQUIPMENT} onChange={setEquipment} />
      </div>

      <div>
        <div className="label mb-1">{timed ? 'Target hold, seconds' : 'Rep range'}</div>
        <p className="mb-3 text-[12.5px] text-fg-3">
          {timed ? 'Hold the top of the range on every set and the target goes up 5 seconds.' : 'Hit the top of the range on every set at your target RPE and the weight goes up.'}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-card border border-line bg-ink-1 py-3">
            <Stepper label="From" value={lo} onChange={setLo} min={1} max={timed ? 600 : 50} />
          </div>
          <div className="rounded-card border border-line bg-ink-1 py-3">
            <Stepper label="To" value={hi} onChange={setHi} min={1} max={timed ? 600 : 50} />
          </div>
        </div>
      </div>

      <div>
        <div className="label mb-2">Target RPE</div>
        <Chips value={targetRpe} options={RPES} onChange={setRpe} format={fmtRpe} />
      </div>

      {weighted && (
        <div>
          <div className="label mb-2">Go up by</div>
          <Chips value={increment} options={INCREMENTS} onChange={setInc} format={(v) => `${fmtKg(v)} kg`} />
        </div>
      )}

      <div>
        <div className="label mb-2">Rest between sets</div>
        <Chips value={restS} options={RESTS} onChange={setRest} format={restLabel} />
      </div>

      <Field label="Notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Seat on 4, neutral grip…" className={`${inputCls} h-auto py-3`} />
      </Field>

      <button onClick={save} disabled={!name.trim() || clash} className="btn-primary h-14 w-full text-[16px] disabled:opacity-40">
        {base ? 'Save changes' : 'Add exercise'}
      </button>
    </div>
  )
}

/** Search the library and pick one, or make a new one on the spot. */
export function PickExerciseSheet() {
  const sheet = useUi((s) => s.sheet)
  const close = useUi((s) => s.close)
  const open = sheet?.type === 'pickExercise'
  return (
    <Sheet open={open} onClose={close} title="Add exercise">
      {open && <Picker onPick={sheet.onPick} />}
    </Sheet>
  )
}

function Picker({ onPick }: { onPick: (id: string) => void }) {
  const w = useWorld()
  const close = useUi((s) => s.close)
  const openSheet = useUi((s) => s.open)
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState<Muscle | 'all'>('all')
  const last = useMemo(() => new Map(w.exercises.map((e) => [e.id, historyFor(e.id, w.workouts)[0]?.date ?? ''])), [w])
  const list = w.exercises
    .filter((e) => (muscle === 'all' || e.muscle === muscle) && e.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (last.get(b.id) ?? '').localeCompare(last.get(a.id) ?? '') || a.name.localeCompare(b.name))
  return (
    <div>
      <div className="relative">
        <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className={`${inputCls} pl-10`} />
      </div>
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        {[{ key: 'all' as const, label: 'All' }, ...MUSCLES].map((m) => (
          <button key={m.key} onClick={() => setMuscle(m.key)} className={`chip shrink-0 ${muscle === m.key ? 'chip-on' : ''}`}>
            {m.label}
          </button>
        ))}
      </div>
      <button
        onClick={() => openSheet({ type: 'exercise', name: q.trim() || undefined, onSaved: onPick })}
        className="press mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-card border border-dashed border-line-2 text-[14px] font-semibold text-fg-2"
      >
        <Plus size={16} /> New custom exercise{q.trim() ? `: ${q.trim()}` : ''}
      </button>
      <div className="mt-1">
        {list.map((e) => (
          <button
            key={e.id}
            onClick={() => {
              onPick(e.id)
              close()
            }}
            className="press flex w-full items-center gap-3 border-b border-line py-3 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold">{e.name}</span>
              <span className="block font-mono text-[10.5px] uppercase tracking-[0.05em] text-fg-3">
                {MUSCLE_LABEL[e.muscle]} · {EQUIPMENT_LABEL[e.equipment]}
              </span>
            </span>
            <Plus size={18} className="text-fg-3" />
          </button>
        ))}
      </div>
    </div>
  )
}
