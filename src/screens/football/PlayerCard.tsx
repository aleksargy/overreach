import { useId } from 'react'
import { Ball } from '../../components/icons/SportIcon'
import { Ticker } from '../../components/ui/Ticker'
import type { PlayerCard as Card, Tier } from '../../lib/football'

const POS = { GK: 'GK', DEF: 'DEF', MID: 'MID', FWD: 'ST', ANY: 'UTL' } as const
const METAL: Record<Tier, string> = { bronze: 'metal-bronze', silver: 'metal-silver', gold: 'metal-gold', elite: 'metal-gold' }
/** the stats in two columns, read across: pace and shooting, passing and stamina, work rate and form */
const ORDER = ['PAC', 'SHO', 'PAS', 'STA', 'WRK', 'FRM']
/** form this good and the card says so */
export const IN_FORM = 85

const SHIELD = 'M100 4C130 4 150 9 168 18H196V236C196 257 160 275 100 296C40 275 4 257 4 236V18H32C50 9 70 4 100 4Z'
const INNER = 'M100 13C127 13 146 18 163 26H187V234C187 251 156 266 100 286C44 266 13 251 13 234V26H37C54 18 73 13 100 13Z'

/**
 * Your card for the season, the way the cards in the football games look: a
 * black shield edged in the tier's metal (bronze, silver or gold), the overall
 * and position top left, and the six stats under your name.
 */
export function PlayerCard({ card, name }: { card: Card; name: string }) {
  const id = useId()
  const form = card.attrs.find((a) => a.key === 'FRM')?.value ?? 0
  return (
    <div className={`relative h-[300px] w-[200px] shrink-0 ${METAL[card.tier]}`} role="img" aria-label={`Player card: ${card.overall} overall, ${POS[card.position]}`}>
      <svg width={200} height={300} viewBox="0 0 200 300" className="absolute inset-0" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}body`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: 'rgb(var(--card-top))' }} />
            <stop offset=".55" style={{ stopColor: 'rgb(var(--card-mid))' }} />
            <stop offset="1" style={{ stopColor: 'rgb(var(--card-end))' }} />
          </linearGradient>
          <linearGradient id={`${id}edge`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: 'rgb(var(--metal-hi))' }} />
            <stop offset="1" style={{ stopColor: 'rgb(var(--metal-lo))' }} />
          </linearGradient>
          <clipPath id={`${id}clip`}>
            <path d={SHIELD} />
          </clipPath>
        </defs>
        <path d={SHIELD} fill={`url(#${id}body)`} />
        <g clipPath={`url(#${id}clip)`} stroke="white" strokeOpacity={0.035} strokeWidth={6}>
          <path d="M-20 120L120 -20M0 170L170 0M20 220L220 20M60 260L240 80" />
        </g>
        <path d={SHIELD} fill="none" stroke={`url(#${id}edge)`} strokeWidth={2.5} />
        <path d={INNER} fill="none" style={{ stroke: 'rgb(var(--metal-line))' }} strokeOpacity={0.3} strokeWidth={1} />
        <g style={{ fill: 'rgb(var(--card-figure))' }}>
          <circle cx="128" cy="70" r="26" />
          <path d="M78 150C80 116 102 102 128 102S176 116 178 150Z" />
        </g>
      </svg>

      <div className="absolute left-6 top-[30px] flex flex-col items-center gap-0.5 text-[rgb(var(--metal-ink))]">
        <Ticker value={card.overall} duration={1200} className="display text-[50px] font-extrabold leading-[0.85] tracking-[-0.03em] tabular-nums [font-stretch:75%]" />
        <span className="text-[14px] font-extrabold">{POS[card.position]}</span>
        <span className="my-1.5 h-px w-[26px] bg-[rgb(var(--metal-lo))]" />
        <Ball size={22} strokeWidth={1.6} />
        {form >= IN_FORM && <span className="mt-1 text-[10.5px] font-extrabold">In form</span>}
      </div>

      <div className="absolute inset-x-4 top-[148px] flex flex-col items-center">
        <span className="display max-w-full truncate text-[24px] font-extrabold leading-[1.2] tracking-[-0.01em] text-[rgb(var(--metal-name))] [font-stretch:75%]">
          {name || 'You'}
        </span>
        <span className="mb-2 mt-1.5 h-px w-full bg-[rgb(var(--metal-lo))] opacity-60" />
        <div className="grid w-[140px] grid-cols-2 gap-y-px">
          {ORDER.map((k, i) => {
            const a = card.attrs.find((x) => x.key === k)
            return (
              <div key={k} title={a?.hint} className={`flex items-baseline gap-1.5 leading-[1.2] ${i % 2 ? 'pl-3' : 'border-r border-[rgb(var(--metal-lo)/0.5)] pr-2.5'}`}>
                <Ticker
                  value={a?.value ?? 0}
                  duration={1100}
                  delay={200}
                  className="display text-[19px] font-extrabold tabular-nums text-[rgb(var(--metal-ink))] [font-stretch:75%]"
                />
                <span className="text-[11.5px] font-bold text-[rgb(var(--metal-key))]">{k}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
