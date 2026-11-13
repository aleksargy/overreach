import { Mark } from '../../components/ui/Mark'
import type { Match } from '../../data/types'
import { signed } from '../../lib/format'

/** Every line that moved a rating from 6.00, on the gold tint: your points from the log carry a ring or a cross, and a big one is quoted. */
export function RatingLines({ m }: { m: Pick<Match, 'breakdown' | 'points'> }) {
  return (
    <div className="text-[14px] text-gold-read">
      <div className="flex items-center gap-2.5 border-t border-gold/[0.14] py-[7px] text-gold-quiet">
        <span>Every game starts at</span>
        <span className="ml-auto font-extrabold tabular-nums">6.00</span>
      </div>
      {m.breakdown.map((f) => {
        const p = f.key.startsWith('point-') ? m.points[Number(f.key.slice(6))] : undefined
        return (
          <div key={f.key} className="flex items-center gap-2.5 border-t border-gold/[0.14] py-[7px]">
            {p && <Mark good={p.good} className="shrink-0" />}
            <span className="min-w-0">
              {p?.big ? `“${p.text}”` : f.label}
              {p?.big && <span className="text-gold-quiet"> · big point</span>}
            </span>
            <span className={`ml-auto shrink-0 font-extrabold tabular-nums ${f.value > 0 ? 'text-good' : f.value < 0 ? 'text-bad' : 'text-gold-quiet'}`}>{signed(f.value, 2)}</span>
          </div>
        )
      })}
    </div>
  )
}
