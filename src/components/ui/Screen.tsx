import { ChevronLeft } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'

interface Props {
  title: string
  kicker?: ReactNode
  actions?: ReactNode
  /** pushed pages get a back button and a compact title instead of the big one */
  back?: boolean
  hero?: ReactNode
  children: ReactNode
  bottomPad?: boolean
}

export function Screen({ title, kicker, actions, back, hero, children, bottomPad = true }: Props) {
  const [scrolled, setScrolled] = useState(false)
  const nav = useNavigate()
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > (back ? 8 : 52))
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [back])

  return (
    <div className={bottomPad ? 'pb-[calc(var(--tabbar-h)+var(--mini-h)+28px)]' : 'pb-8'}>
      <div
        className={`sticky top-[env(safe-area-inset-top,0px)] z-30 border-b transition-colors duration-200 ${
          scrolled ? 'border-line bg-ink-0/90 backdrop-blur-xl' : 'border-transparent bg-ink-0/0'
        }`}
      >
        <div className="gutter mx-auto grid h-12 max-w-app grid-cols-[1fr_auto_1fr] items-center">
          <div className="flex">
            {back && (
              <button onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))} className="press -ml-2 flex h-10 items-center gap-0.5 pr-3 text-fg-2" aria-label="Back">
                <ChevronLeft size={22} strokeWidth={2.25} />
                <span className="text-[15px] font-medium">Back</span>
              </button>
            )}
          </div>
          <span className={`truncate font-display text-[19px] font-extrabold uppercase tracking-wide transition-opacity duration-200 ${scrolled ? 'opacity-100' : 'opacity-0'}`}>
            {title}
          </span>
          <div className="flex justify-end gap-1.5">{actions}</div>
        </div>
      </div>
      {!back && (
        <header className="gutter mx-auto max-w-app pb-5">
          {kicker && <div className="label mb-1.5">{kicker}</div>}
          <h1 className="font-display text-[52px] font-black uppercase leading-[0.86] tracking-[-0.01em]">{title}</h1>
        </header>
      )}
      {hero}
      <div className="gutter mx-auto max-w-app">{children}</div>
    </div>
  )
}

export function IconButton({ label, onClick, children, active }: { label: string; onClick?: () => void; children: ReactNode; active?: boolean }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`press grid h-9 w-9 place-items-center rounded-full border ${active ? 'border-fg bg-fg text-ink-0' : 'border-line-2 bg-ink-1 text-fg-2'}`}
    >
      {children}
    </button>
  )
}
