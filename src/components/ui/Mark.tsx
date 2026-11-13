/** Beside what went well or badly: a small ring in good, a cross in bad. */
export function Mark({ good, size = 12, className = '' }: { good: boolean; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      className={`${good ? 'text-good' : 'text-bad'} ${className}`}
      role="img"
      aria-label={good ? 'Went well' : 'Went badly'}
    >
      {good ? <circle cx="6" cy="6" r="4.5" /> : <path d="M2 2l8 8M10 2l-8 8" />}
    </svg>
  )
}
