import { Activity, Bike, Dumbbell, Footprints, Waves } from 'lucide-react'
import type { Sport } from '../../data/types'

/** A football: hexagon panel in the middle, seams out to the edge. */
export function Ball({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
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

export function SportIcon({ sport, size = 20, className = '' }: { sport: Sport; size?: number; className?: string }) {
  const p = { size, className, strokeWidth: 2 }
  switch (sport) {
    case 'run':
      return <Footprints {...p} />
    case 'ride':
      return <Bike {...p} />
    case 'swim':
      return <Waves {...p} />
    case 'football':
      return <Ball size={size} className={className} />
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

/** Categorical colours, only for charts that split load by sport. */
export const SPORT_COLOR: Record<Sport, string> = {
  run: 'rgb(var(--run))',
  ride: 'rgb(var(--ride))',
  swim: 'rgb(var(--swim))',
  football: 'rgb(var(--football))',
  strength: 'rgb(var(--strength))',
  other: 'rgb(var(--other))',
}
