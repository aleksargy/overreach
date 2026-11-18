import { Check, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Sheet } from '../../components/ui/Sheet'
import { Field, SearchField, Stepper, inputCls, plainText, useAutoFocus } from '../../components/ui/bits'
import { EQUIPMENT, KINDS, MUSCLES } from '../../data/exercises'
import { useStore } from '../../data/store'
import type { Equipment, Exercise, ExerciseKind, Muscle } from '../../data/types'
import { useUi } from '../../data/ui'
import { useWorld } from '../../data/world'
import { fmtKg, historyFor } from '../../lib/lift'
import { uid } from '../../lib/rng'
import { EQUIPMENT_LABEL, MUSCLE_LABEL } from './parts'

const INCREMENTS = [1, 1.25, 2, 2.5, 4, 5, 10]
/** the step a new exercise goes up by until you pick one: what that kit usually comes in */
const STEP: Record<Equipment, number> = { barbell: 2.5, dumbbell: 2, machine: 5, cable: 2.5, kettlebell: 4, band: 2.5, bodyweight: 2.5, other: 2.5 }

/** Create a custom exercise, or tune any exercise's targets. */
export function ExerciseSheet() {
  const sheet = useUi((s) => s.sheet)
  const close = useUi((s) => s.close)
  const open = sheet?.type === 'exercise'
  const editing = open && !!sheet.exerciseId
  return (
    <Sheet open={open} onClose={close} title={editing ? 'Edit exercise' : 'New exercise'}>
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
  const [increment, setInc] = useState(base?.increment || STEP[base?.equipment ?? 'dumbbell'])
  // a new exercise's step follows its kit until you pick one
  const [stepPicked, setStepPicked] = useState(!!base)
  const [pyramid, setPyramid] = useState(!!base?.pyramid)
  const [notes, setNotes] = useState(base?.notes ?? '')
  const nameRef = useAutoFocus<HTMLInputElement>(!base)
  const timed = kind === 'duration'
  const weighted = kind === 'weight' || kind === 'weighted-bodyweight'
  const clash = !base && w.exercises.some((e) => e.name.toLowerCase() === name.trim().toLowerCase())
  const pickEquipment = (e: Equipment) => {
    setEquipment(e)
    if (!stepPicked) setInc(STEP[e])
  }

  const save = () => {
    const patch: Partial<Exercise> = {
      name: name.trim(),
      muscle,
      equipment,
      kind,
      repRange: [Math.min(lo, hi), Math.max(lo, hi)],
      targetRpe: base?.targetRpe ?? 8,
      increment: weighted ? increment : 0,
      pyramid: (weighted && pyramid) || undefined,
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
      {/* no "Name" label: iOS offers your contact card to anything called that */}
      <input
        ref={nameRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        aria-label="Exercise"
        placeholder="Landmine press"
        enterKeyHint="done"
        autoCapitalize="sentences"
        {...plainText}
        className={inputCls}
      />
      {clash && <p className="-mt-4 text-[13px] text-bad">Already in your list</p>}

      <div>
        <div className="label mb-2">Tracked as</div>
        <div className="grid grid-cols-2 gap-2">
          {KINDS.map((k) => (
            <button key={k.key} type="button" onClick={() => setKind(k.key)} className={`chip h-11 justify-start ${kind === k.key ? 'chip-on font-semibold' : ''}`}>
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
        <Chips value={equipment} options={EQUIPMENT} onChange={pickEquipment} />
      </div>

      <div>
        <div className="label mb-2">{timed ? 'Hold for, seconds' : weighted && pyramid ? 'Top set, reps' : 'Rep range'}</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="tile py-3">
            <Stepper label="From" value={lo} onChange={setLo} min={1} max={timed ? 600 : 50} />
          </div>
          <div className="tile py-3">
            <Stepper label="To" value={hi} onChange={setHi} min={1} max={timed ? 600 : 50} />
          </div>
        </div>
      </div>

      {weighted && (
        <div>
          <div className="label mb-2">Sets</div>
          <Chips
            value={pyramid ? 'pyramid' : 'straight'}
            options={[
              { key: 'straight', label: 'Same weight' },
              { key: 'pyramid', label: 'Reverse pyramid' },
            ]}
            onChange={(v) => setPyramid(v === 'pyramid')}
          />
        </div>
      )}

      {weighted && (
        <div>
          <div className="label mb-2">Go up by</div>
          <Chips
            value={increment}
            options={INCREMENTS}
            onChange={(v) => {
              setInc(v)
              setStepPicked(true)
            }}
            format={(v) => `${fmtKg(v)} kg`}
          />
        </div>
      )}

      <Field label="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Seat on 4, neutral grip…"
          autoComplete="off"
          className={`${inputCls} h-auto py-3`}
        />
      </Field>

      <button onClick={save} disabled={!name.trim() || clash} className="btn-primary w-full disabled:opacity-40">
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
  const many = open && !!sheet.many
  return (
    <Sheet
      open={open}
      onClose={close}
      title={many ? 'Add exercises' : 'Add exercise'}
      full
      footer={
        many ? (
          <button onClick={close} className="btn-primary w-full">
            Done
          </button>
        ) : undefined
      }
    >
      {open && <Picker onPick={sheet.onPick} many={many} />}
    </Sheet>
  )
}

function Picker({ onPick, many }: { onPick: (id: string) => void; many: boolean }) {
  const w = useWorld()
  const close = useUi((s) => s.close)
  const openSheet = useUi((s) => s.open)
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState<Muscle | 'all'>('all')
  // what's gone in while the sheet has been open, so each is ticked and can't go in twice
  const [added, setAdded] = useState<string[]>([])
  const last = useMemo(() => new Map(w.exercises.map((e) => [e.id, historyFor(e.id, w.workouts)[0]?.date ?? ''])), [w])
  const list = w.exercises
    .filter((e) => (muscle === 'all' || e.muscle === muscle) && e.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (last.get(b.id) ?? '').localeCompare(last.get(a.id) ?? '') || a.name.localeCompare(b.name))
  return (
    <div>
      <SearchField value={q} onChange={setQ} label="Search exercises" />
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        {[{ key: 'all' as const, label: 'All' }, ...MUSCLES].map((m) => (
          <button key={m.key} onClick={() => setMuscle(m.key)} className={`chip shrink-0 ${muscle === m.key ? 'chip-on' : ''}`}>
            {m.label}
          </button>
        ))}
      </div>
      <button onClick={() => openSheet({ type: 'exercise', name: q.trim() || undefined, onSaved: onPick })} className="chip mt-3 h-11 w-full justify-center">
        <Plus size={16} /> New custom exercise{q.trim() ? `: ${q.trim()}` : ''}
      </button>
      <div className="mt-1">
        {list.map((e) => {
          const done = added.includes(e.id)
          return (
            <button
              key={e.id}
              disabled={done}
              onClick={() => {
                onPick(e.id)
                if (many) setAdded((x) => [...x, e.id])
                else close()
              }}
              className="press flex w-full items-center gap-3 border-b border-ink-3 py-3 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-semibold">{e.name}</span>
                <span className="meta block">
                  {MUSCLE_LABEL[e.muscle]} · {EQUIPMENT_LABEL[e.equipment]}
                </span>
              </span>
              {done ? (
                <span className="grid h-7 w-7 place-items-center rounded-full bg-strength text-ink-0">
                  <Check size={15} strokeWidth={2.75} />
                </span>
              ) : (
                <Plus size={18} className="text-fg-3" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
