// The tab bar's marks, drawn the way the rest of the board is: one stroke, round ends.

interface P {
  size?: number
  strokeWidth?: number
}

const svg = (size: number, strokeWidth: number) =>
  ({
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }) as const

/** The centre circle and the halfway line: where the day kicks off. */
export function TodayMark({ size = 24, strokeWidth = 1.6 }: P) {
  return (
    <svg {...svg(size, strokeWidth)}>
      <path d="M12 2.5v19" />
      <circle cx="12" cy="12" r="6.2" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** A track from above. */
export function TrackMark({ size = 24, strokeWidth = 1.6 }: P) {
  return (
    <svg {...svg(size, strokeWidth)}>
      <rect x="2.5" y="5.5" width="19" height="13" rx="6.5" />
      <rect x="7" y="10" width="10" height="4" rx="2" />
    </svg>
  )
}

/** A loaded bar. */
export function BarMark({ size = 24, strokeWidth = 1.6 }: P) {
  return (
    <svg {...svg(size, strokeWidth)}>
      <path d="M1.8 12h20.4" />
      <rect x="5.2" y="6" width="3.2" height="12" rx="1" />
      <rect x="15.6" y="6" width="3.2" height="12" rx="1" />
      <path d="M3 9.2v5.6M21 9.2v5.6" />
    </svg>
  )
}

/** A pulse. */
export function PulseMark({ size = 24, strokeWidth = 1.6 }: P) {
  return (
    <svg {...svg(size, strokeWidth)}>
      <path d="M2 12.5h4.3l2.4-6.5 4.3 12.5 2.6-6h6.4" />
    </svg>
  )
}
