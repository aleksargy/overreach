import { ChevronLeft } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'

interface Props {
  title: string
  kicker?: ReactNode
  actions?: ReactNode
  /** pushed pages get a round Back button, and keep it and their actions at the top as they scroll */
  back?: boolean
  /** the page draws its own header, so only the title in the pill shows once scrolled */
  bare?: boolean
  hero?: ReactNode
  children: ReactNode
  bottomPad?: boolean
}

/**
 * A screen: its title 58 px down beside its round buttons, then its tiles. A
 * pushed screen keeps Back and its actions floating at the top, with its title
 * in a pill once it scrolls; nothing is docked and nothing is blurred.
 */
export function Screen({ title, kicker, actions, back, bare, hero, children, bottomPad = true }: Props) {
  const [scrolled, setScrolled] = useState(false)
  const nav = useNavigate()
  useEffect(() => {
    if (!back) return
    const on = () => setScrolled(window.scrollY > 64)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [back])

  return (
    <div className={bottomPad ? 'pb-[calc(var(--tabbar-h)+var(--tabbar-gap)+var(--mini-h)+28px)]' : 'pb-10'}>
      {back && (
        <>
          <div className="h-[max(4px,calc(var(--top)-4px))]" />
          <div className="pointer-events-none sticky top-[calc(env(safe-area-inset-top,0px)+8px)] z-30">
            <div className="gutter mx-auto grid max-w-app grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="flex">
                <RoundButton label="Back" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))}>
                  <ChevronLeft size={20} strokeWidth={2.2} className="-ml-px" />
                </RoundButton>
              </div>
              <span
                aria-hidden={!scrolled}
                className={`max-w-[200px] truncate rounded-full bg-ink-2 px-4 py-2.5 text-[14px] font-bold leading-5 transition-opacity duration-200 ${scrolled ? 'opacity-100' : 'opacity-0'}`}
              >
                {title}
              </span>
              <div className="pointer-events-auto flex justify-end gap-2">{actions}</div>
            </div>
          </div>
        </>
      )}
      {!bare && (
        <header className={`gutter mx-auto flex max-w-app items-center justify-between gap-3 pb-4 ${back ? 'pt-[18px]' : 'pt-[var(--top)]'}`}>
          <div className="min-w-0">
            {kicker && <div className="label mb-0.5">{kicker}</div>}
            <h1 className="t-page">{title}</h1>
          </div>
          {!back && actions && <div className="flex shrink-0 gap-2">{actions}</div>}
        </header>
      )}
      {bare && <div className={back ? 'h-[18px]' : 'h-[var(--top)]'} />}
      {hero}
      <div className="gutter mx-auto max-w-app">{children}</div>
    </div>
  )
}

function RoundButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} className="round pointer-events-auto">
      {children}
    </button>
  )
}

/** A round 40 px button for a screen's actions; `active` is the solid one (the +). */
export function IconButton({ label, onClick, children, active }: { label: string; onClick?: () => void; children: ReactNode; active?: boolean }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} className={`round ${active ? 'round-on' : ''}`}>
      {children}
    </button>
  )
}
