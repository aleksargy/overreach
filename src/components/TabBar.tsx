import { Footprints, Gauge, HeartPulse } from 'lucide-react'
import { NavLink } from 'react-router'
import { Ball } from './icons/SportIcon'

const TABS = [
  { to: '/', label: 'Today', icon: <Gauge size={23} strokeWidth={1.6} />, end: true },
  { to: '/run', label: 'Run', icon: <Footprints size={23} strokeWidth={1.6} /> },
  { to: '/football', label: 'Football', icon: <Ball size={23} strokeWidth={1.6} /> },
  { to: '/body', label: 'Body', icon: <HeartPulse size={23} strokeWidth={1.6} /> },
]

export function TabBar() {
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 bg-ink-0/95 pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-1px_0_rgb(var(--line))] backdrop-blur-xl">
      <div className="gutter mx-auto grid h-[var(--tabbar-h)] max-w-app grid-cols-4">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => `flex flex-col items-center justify-center gap-[3px] pt-1 transition-colors duration-150 ${isActive ? 'text-fg' : 'text-fg-4'}`}
          >
            {t.icon}
            <span className="text-[10.5px] font-medium tracking-[0.01em]">{t.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
