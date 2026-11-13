import { ChevronRight, Scale } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Ball } from '../../components/icons/SportIcon'
import { BarMark } from '../../components/icons/tabs'
import { Sheet } from '../../components/ui/Sheet'
import { useUi, type SheetState } from '../../data/ui'

/** Each thing you can log: most open their own sheet, lifting goes to its tab, where the next workout is waiting. */
const ITEMS: { label: string; sub: string; icon: ReactNode; set: string; next?: SheetState; to?: string }[] = [
  { label: 'Match', sub: 'Score, goals, assists and how it felt', icon: <Ball size={19} strokeWidth={1.8} />, set: '--football', next: { type: 'logMatch' } },
  { label: 'Workout', sub: 'The next one on your list, with what to lift', icon: <BarMark size={19} strokeWidth={1.9} />, set: '--strength', to: '/lift' },
  { label: 'Weigh-in', sub: 'Your weight this morning', icon: <Scale size={19} strokeWidth={1.9} />, set: '--body', next: { type: 'logBody' } },
]

/** The + on Today: everything you type in yourself starts here. */
export function LogSheet() {
  const sheet = useUi((s) => s.sheet)
  const close = useUi((s) => s.close)
  const open = useUi((s) => s.open)
  const nav = useNavigate()
  return (
    <Sheet open={sheet?.type === 'log'} onClose={close} title="Log">
      <div className="list">
        {ITEMS.map((it) => (
          <button
            key={it.label}
            onClick={() => {
              close()
              if (it.to) return nav(it.to)
              // let this sheet slide away before the next one comes up
              setTimeout(() => open(it.next!), 200)
            }}
            className="flex w-full items-center gap-3 py-3.5 text-left transition-opacity duration-150 active:opacity-70"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: `rgb(var(${it.set}) / 0.14)`, color: `rgb(var(${it.set}))` }}>
              {it.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="t-name block">{it.label}</span>
              <span className="meta block">{it.sub}</span>
            </span>
            <ChevronRight size={18} strokeWidth={2} className="shrink-0 text-fg-4" />
          </button>
        ))}
      </div>
    </Sheet>
  )
}
