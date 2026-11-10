import { NavLink } from 'react-router'
import { Ball } from './icons/SportIcon'
import { BarMark, PulseMark, TodayMark, TrackMark } from './icons/tabs'
import { Underline } from './ui/chalk'

const TABS = [
  { to: '/', label: 'Today', icon: <TodayMark />, end: true },
  { to: '/run', label: 'Run', icon: <TrackMark /> },
  { to: '/football', label: 'Football', icon: <Ball size={24} strokeWidth={1.6} /> },
  { to: '/lift', label: 'Lift', icon: <BarMark /> },
  { to: '/body', label: 'Body', icon: <PulseMark /> },
]

export function TabBar() {
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 bg-ink-0 pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-1px_0_rgb(var(--fg)/0.13)]">
      <div className="gutter mx-auto grid h-[var(--tabbar-h)] max-w-app grid-cols-5">
        {TABS.map((t, i) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => `relative flex flex-col items-center justify-center gap-[3px] pt-1 transition-colors duration-150 ${isActive ? 'text-fg' : 'text-fg-4'}`}
          >
            {({ isActive }) => (
              <>
                {t.icon}
                <span className="text-[11px] font-semibold">{t.label}</span>
                {isActive && <Underline seed={i + 5} className="bottom-[3px] mx-auto max-w-[30px]" />}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
