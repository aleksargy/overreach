import { ChevronRight, Scale } from 'lucide-react'
import type { ReactNode } from 'react'
import { Ball } from '../../components/icons/SportIcon'
import { Sheet } from '../../components/ui/Sheet'
import { useUi, type SheetState } from '../../data/ui'

const ITEMS: { label: string; sub: string; icon: ReactNode; next: SheetState }[] = [
  { label: 'Match', sub: 'Score, goals, assists and how it felt', icon: <Ball size={19} />, next: { type: 'logMatch' } },
  { label: 'Weigh-in', sub: 'Weight, body fat, tape', icon: <Scale size={19} strokeWidth={1.75} />, next: { type: 'logBody' } },
]

/** The + on Today: everything you type in yourself starts here. */
export function LogSheet() {
  const sheet = useUi((s) => s.sheet)
  const close = useUi((s) => s.close)
  const open = useUi((s) => s.open)
  return (
    <Sheet open={sheet?.type === 'log'} onClose={close} title="Log">
      <div className="list overflow-hidden rounded-card bg-ink-2 [--inset:64px]">
        {ITEMS.map((it) => (
          <button
            key={it.label}
            onClick={() => {
              close()
              // let this sheet slide away before the next one comes up
              setTimeout(() => open(it.next), 200)
            }}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150 active:bg-ink-3"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-3 text-fg">{it.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium leading-5">{it.label}</span>
              <span className="meta block">{it.sub}</span>
            </span>
            <ChevronRight size={18} strokeWidth={1.75} className="shrink-0 text-fg-4" />
          </button>
        ))}
      </div>
    </Sheet>
  )
}
