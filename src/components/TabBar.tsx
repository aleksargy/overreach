import { motion } from 'motion/react'
import { NavLink } from 'react-router'
import { Ball } from './icons/SportIcon'
import { BarMark, PulseMark, TodayMark, TrackMark } from './icons/tabs'

const ICON = { size: 20, strokeWidth: 2.1 }

const TABS = [
  { to: '/', label: 'Today', icon: <TodayMark {...ICON} />, end: true },
  { to: '/run', label: 'Run', icon: <TrackMark {...ICON} /> },
  { to: '/football', label: 'Football', icon: <Ball {...ICON} /> },
  { to: '/lift', label: 'Lift', icon: <BarMark {...ICON} /> },
  { to: '/body', label: 'Body', icon: <PulseMark {...ICON} /> },
]

const SPRING = { type: 'spring', stiffness: 480, damping: 40 } as const

/** A pill floating over the foot of the screen: each tab a round icon, the one you're on a solid pill with its name that slides across. */
export function TabBar() {
  return (
    <nav aria-label="Main" className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+var(--tabbar-gap))] z-40 flex justify-center">
      <div className="pointer-events-auto flex h-[var(--tabbar-h)] items-center gap-1 rounded-[30px] bg-ink-2 px-2">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} aria-label={t.label} className="relative block rounded-full">
            {({ isActive }) => (
              <motion.span layout transition={SPRING} className={`relative flex h-11 min-w-11 items-center justify-center gap-2 ${isActive ? 'px-4 text-ink-0' : 'text-fg-3'}`}>
                {isActive && <motion.span layoutId="tab" transition={SPRING} className="absolute inset-0 rounded-full bg-fg" />}
                <motion.span layout="position" transition={SPRING} className="relative">
                  {t.icon}
                </motion.span>
                {isActive && <span className="relative text-[14px] font-bold">{t.label}</span>}
              </motion.span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
