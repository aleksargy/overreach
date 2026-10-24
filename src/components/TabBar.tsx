import { Dumbbell, LayoutList, PersonStanding, Zap } from 'lucide-react'
import { NavLink } from 'react-router'
import { Ball } from './icons/SportIcon'

const TABS = [
  { to: '/', label: 'Today', icon: <Zap size={21} strokeWidth={2} />, end: true },
  { to: '/feed', label: 'Feed', icon: <LayoutList size={21} strokeWidth={2} /> },
  { to: '/football', label: 'Football', icon: <Ball size={21} /> },
  { to: '/lift', label: 'Lift', icon: <Dumbbell size={21} strokeWidth={2} /> },
  { to: '/body', label: 'Body', icon: <PersonStanding size={21} strokeWidth={2} /> },
]

export function TabBar() {
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink-0/90 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-xl">
      <div className="gutter mx-auto grid h-[var(--tabbar-h)] max-w-app grid-cols-5">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => `press relative flex flex-col items-center justify-center gap-1 ${isActive ? 'text-fg' : 'text-fg-4'}`}
          >
            {({ isActive }) => (
              <>
                <span className={`spectrum absolute top-0 h-[3px] w-7 rounded-b-sm transition-opacity duration-200 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                {t.icon}
                <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em]">{t.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
