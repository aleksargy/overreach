import { ChevronLeft } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'

interface Props {
  title: string
  kicker?: ReactNode
  actions?: ReactNode
  /** pushed pages get a back button */
  back?: boolean
  /** the page draws its own header, so only the compact title shows once scrolled */
  bare?: boolean
  hero?: ReactNode
  children: ReactNode
  bottomPad?: boolean
}

export function Screen({ title, kicker, actions, back, bare, hero, children, bottomPad = true }: Props) {
  const [scrolled, setScrolled] = useState(false)
  const nav = useNavigate()
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 44)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])

  return (
    <div className={bottomPad ? 'pb-[calc(var(--tabbar-h)+var(--mini-h)+40px)]' : 'pb-10'}>
      <div
        className={`sticky top-[env(safe-area-inset-top,0px)] z-30 transition-colors duration-200 ${
          scrolled ? 'bg-ink-0/95 shadow-[0_1px_0_rgb(var(--line))] backdrop-blur-xl' : 'bg-ink-0/0'
        }`}
      >
        <div className="gutter mx-auto grid h-12 max-w-app grid-cols-[1fr_auto_1fr] items-center">
          <div className="flex">
            {back && (
              <button onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))} className="press -ml-2 flex h-10 items-center pr-3 text-fg-2" aria-label="Back">
                <ChevronLeft size={24} strokeWidth={1.75} />
                <span className="text-[15px] font-medium">Back</span>
              </button>
            )}
          </div>
          <span className={`truncate text-[15px] font-semibold tracking-[-0.01em] transition-opacity duration-200 ${scrolled ? 'opacity-100' : 'opacity-0'}`}>{title}</span>
          <div className="flex justify-end gap-2">{actions}</div>
        </div>
      </div>
      {!bare && (
        <header className="gutter mx-auto max-w-app pb-7 pt-1">
          {kicker && <div className="mb-1.5 text-[13px] font-medium text-fg-3">{kicker}</div>}
          <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.03em]">{title}</h1>
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
      className={`press grid h-9 w-9 place-items-center rounded-full ${active ? 'bg-fg text-ink-0' : 'bg-ink-2 text-fg-2'}`}
    >
      {children}
    </button>
  )
}
