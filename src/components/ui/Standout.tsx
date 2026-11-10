import { hashString } from '../../lib/rng'
import type { Standout } from '../../lib/standout'
import { Circled } from './chalk'

/**
 * The one thing worth a look, the way it'd go on a board: the number circled,
 * and a few words on why. Red chalk when it's the wrong kind of record.
 */
export function StandoutLine({ s, className = '', size = 'md' }: { s: Standout; className?: string; size?: 'md' | 'lg' }) {
  const at = s.value.indexOf(' ')
  const [num, unit] = at < 0 ? [s.value, ''] : [s.value.slice(0, at), s.value.slice(at + 1)]
  return (
    <div className={`flex items-center gap-6 ${className}`}>
      <span className="shrink-0 pl-3.5">
        <Circled seed={hashString(s.key + s.value)} color={s.tone === 'bad' ? 'rgb(var(--bad))' : undefined}>
          <span className={`num-hero whitespace-nowrap ${size === 'lg' ? 'text-[60px]' : 'text-[44px]'}`}>
            {num}
            {unit && <span className="unit">{unit}</span>}
          </span>
        </Circled>
      </span>
      <span className="min-w-0 text-[16.5px] font-medium leading-snug text-fg text-balance">{s.text}</span>
    </div>
  )
}
