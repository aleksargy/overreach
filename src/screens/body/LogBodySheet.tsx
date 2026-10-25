import { Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { Sheet } from '../../components/ui/Sheet'
import { NumInput } from '../../components/ui/bits'
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

function Form() {
  const w = useWorld()
  const add = useStore((s) => s.addBody)
  const close = useUi((s) => s.close)
  const say = useUi((s) => s.say)
  const lastWeight = w.body.find((b) => b.weightKg)?.weightKg ?? 75
  const [kg, setKg] = useState<number | undefined>(lastWeight)
  const step = (d: number) => setKg((v) => round(Math.max(20, (v ?? lastWeight) + d), 1))

  const save = () => {
    if (!kg) return
    add({ id: `b-${uid()}`, date: new Date().toISOString(), weightKg: kg, source: 'manual' })
    say(`Weighed in at ${kg.toFixed(1)} kg`)
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

      <button onClick={save} disabled={!kg} className="btn-primary h-14 w-full text-[16px] disabled:opacity-40">
        Save
      </button>
    </div>
  )
}
