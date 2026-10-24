import { ChevronDown, Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { Sheet } from '../../components/ui/Sheet'
import { NumInput, inputCls } from '../../components/ui/bits'
import { useStore } from '../../data/store'
import { useUi } from '../../data/ui'
import { useWorld } from '../../data/world'
import { round } from '../../lib/math'
import { uid } from '../../lib/rng'

export function LogBodySheet() {
  const sheet = useUi((s) => s.sheet)
  const close = useUi((s) => s.close)
  const open = sheet?.type === 'logBody'
  return (
    <Sheet open={open} onClose={close} title="Weigh in">
      {open && <Form />}
    </Sheet>
  )
}

const FIELDS = [
  { key: 'waistCm', label: 'Waist' },
  { key: 'chestCm', label: 'Chest' },
  { key: 'armCm', label: 'Arm' },
  { key: 'thighCm', label: 'Thigh' },
] as const

function Form() {
  const w = useWorld()
  const add = useStore((s) => s.addBody)
  const close = useUi((s) => s.close)
  const say = useUi((s) => s.say)
  const lastWeight = w.body.find((b) => b.weightKg)?.weightKg ?? 75
  const lastFat = w.body.find((b) => b.bodyFat)?.bodyFat
  const [kg, setKg] = useState<number | undefined>(lastWeight)
  const [fat, setFat] = useState<number | undefined>(undefined)
  const [more, setMore] = useState(false)
  const [cm, setCm] = useState<Partial<Record<(typeof FIELDS)[number]['key'], number>>>({})
  const step = (d: number) => setKg((v) => round(Math.max(20, (v ?? lastWeight) + d), 1))

  const save = () => {
    add({ id: `b-${uid()}`, date: new Date().toISOString(), weightKg: kg, bodyFat: fat, ...cm, source: 'manual' })
    say(kg ? `Weighed in at ${kg.toFixed(1)} kg` : 'Saved')
    close()
  }

  return (
    <div className="flex flex-col gap-7 pb-2">
      <div className="rounded-card bg-ink-2 px-3 py-6">
        <div className="label mb-4 text-center">This morning</div>
        <div className="flex items-center justify-center gap-3">
          <button aria-label="Minus 0.1 kg" onClick={() => step(-0.1)} className="press grid h-11 w-11 place-items-center rounded-full bg-ink-3 text-fg-2">
            <Minus size={18} />
          </button>
          <div className="flex items-baseline">
            <NumInput label="Weight in kg" decimal value={kg} onChange={setKg} className="num-hero w-[4.1ch] bg-transparent text-center text-[68px] focus:outline-none" />
            <span className="text-[15px] font-medium text-fg-3">kg</span>
          </div>
          <button aria-label="Plus 0.1 kg" onClick={() => step(0.1)} className="press grid h-11 w-11 place-items-center rounded-full bg-fg text-ink-0">
            <Plus size={18} />
          </button>
        </div>
        <p className="meta mt-4 text-center">Last time {lastWeight.toFixed(1)} kg</p>
      </div>

      <label className="block">
        <span className="label mb-2 block">Body fat %</span>
        <NumInput
          label="Body fat percent"
          decimal
          value={fat}
          onChange={setFat}
          placeholder={lastFat ? lastFat.toFixed(1) : 'optional'}
          className={`${inputCls} text-[17px] tabular-nums`}
        />
      </label>

      <div>
        <button onClick={() => setMore((m) => !m)} className="flex w-full items-center justify-between py-1">
          <span className="label">Tape measurements</span>
          <ChevronDown size={16} strokeWidth={1.75} className={`text-fg-3 transition-transform ${more ? 'rotate-180' : ''}`} />
        </button>
        {more && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="label mb-2 block">{f.label}, cm</span>
                <NumInput
                  label={`${f.label} in cm`}
                  decimal
                  value={cm[f.key]}
                  onChange={(v) => setCm((x) => ({ ...x, [f.key]: v }))}
                  className={`${inputCls} text-[17px] tabular-nums`}
                />
              </label>
            ))}
          </div>
        )}
      </div>

      <button onClick={save} disabled={!kg && !fat && !Object.values(cm).some(Boolean)} className="btn-primary h-14 w-full text-[16px] disabled:opacity-40">
        Save
      </button>
    </div>
  )
}
