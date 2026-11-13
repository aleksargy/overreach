import type { Standout } from '../../lib/standout'

/**
 * The one thing worth a look: the reading big on a tile, with one line under it
 * in sage, or in bad when it's the wrong kind of record.
 */
export function StandoutLine({ s, className = '', size = 'md' }: { s: Standout; className?: string; size?: 'md' | 'lg' }) {
  const at = s.value.indexOf(' ')
  const [num, unit] = at < 0 ? [s.value, ''] : [s.value.slice(0, at), s.value.slice(at + 1)]
  return (
    <div className={`tile flex flex-col gap-2 ${className}`}>
      <span className={`num whitespace-nowrap ${size === 'lg' ? 'text-[44px]' : 'text-[36px]'}`}>
        {num}
        {unit && <span className="unit">{unit}</span>}
      </span>
      <span className={`text-balance text-[13px] font-semibold ${s.tone === 'bad' ? 'text-bad' : 'text-football'}`}>{s.text}</span>
    </div>
  )
}
