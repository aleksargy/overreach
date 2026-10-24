import { Activity, Bike, Dumbbell, Footprints, Waves } from 'lucide-react'
import type { Sport } from '../../data/types'

/** A football: hexagon panel in the middle, seams out to the edge. */
export function Ball({ size = 20, className = '', strokeWidth = 1.75 }: { size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 8.2l3.6 2.6-1.4 4.2H9.8l-1.4-4.2z" fill="currentColor" stroke="none" />
      <path d="M12 8.2V3.6M15.6 10.8l4.3-1.5M14.2 15l2.7 3.8M9.8 15l-2.7 3.8M8.4 10.8l-4.3-1.5" />
    </svg>
  )
}

export function SportIcon({ sport, size = 20, className = '', strokeWidth = 1.75 }: { sport: Sport; size?: number; className?: string; strokeWidth?: number }) {
  const p = { size, className, strokeWidth }
  switch (sport) {
    case 'run':
      return <Footprints {...p} />
    case 'ride':
      return <Bike {...p} />
    case 'swim':
      return <Waves {...p} />
    case 'football':
      return <Ball size={size} className={className} strokeWidth={strokeWidth} />
    case 'strength':
      return <Dumbbell {...p} />
    default:
      return <Activity {...p} />
  }
}

export const SPORT_LABEL: Record<Sport, string> = {
  run: 'Run',
  ride: 'Ride',
  swim: 'Swim',
  football: 'Football',
  strength: 'Strength',
  other: 'Other',
}

/** Categorical colours, for anything that tells sports apart. */
export const sportColor = (s: Sport, a = 1) => `rgb(var(--${s}) / ${a})`

export const SPORT_COLOR: Record<Sport, string> = {
  run: sportColor('run'),
  ride: sportColor('ride'),
  swim: sportColor('swim'),
  football: sportColor('football'),
  strength: sportColor('strength'),
  other: sportColor('other'),
}

/** The sport's icon on a faint disc of its colour, the way lists lead. */
export function SportDot({ sport, size = 36 }: { sport: Sport; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full" style={{ width: size, height: size, background: sportColor(sport, 0.13), color: sportColor(sport) }}>
      <SportIcon sport={sport} size={Math.round(size * 0.5)} />
    </span>
  )
}
