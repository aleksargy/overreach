import type { PlayerCard as Card } from '../../lib/football'
import { Circled } from '../../components/ui/chalk'
import { Ticker } from '../../components/ui/Ticker'

const TIER_NAME = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', elite: 'In form' } as const
const POS = { GK: 'GK', DEF: 'DEF', MID: 'MID', FWD: 'ST', ANY: 'UTL' } as const
/** each tier is drawn in its own stick of chalk */
const TIER_CHALK = { bronze: '224 156 112', silver: '204 208 206', gold: 'var(--mark)', elite: 'var(--good)' } as const

/** Your card for the season, chalked up like a name on the team sheet: the tier is the colour of the chalk, and being in form gets the number circled. */
export function PlayerCard({ card, name, apps, goals, assists }: { card: Card; name: string; apps: number; goals: number; assists: number }) {
  const chalk = TIER_CHALK[card.tier]
  const overall = <Ticker value={card.overall} className="num-hero block text-[104px] !font-normal" duration={1200} />
  return (
    <div className="mx-auto w-full" style={{ ['--tier' as string]: chalk }}>
      <div className="rounded-card px-5 pb-6 pt-6" style={{ boxShadow: 'inset 0 0 0 1.5px rgb(var(--tier) / 0.75)' }}>
        <div className="flex items-start justify-between">
          <div style={{ color: 'rgb(var(--tier))' }}>
            {card.tier === 'elite' ? (
              <span className="inline-block pl-2">
                <Circled seed={card.overall} color="rgb(var(--tier))" delay={1.2}>
                  {overall}
                </Circled>
              </span>
            ) : (
              overall
            )}
            <div className="display mt-3 text-[22px] font-bold">{POS[card.position]}</div>
          </div>
          <div className="flex flex-col items-end text-right">
            <Crest />
            <div className="mt-2.5 text-[13px] font-semibold" style={{ color: 'rgb(var(--tier))' }}>
              {TIER_NAME[card.tier]}
            </div>
            <div className="meta mt-0.5">
              {apps} apps · {goals}G · {assists}A
            </div>
          </div>
        </div>
        <div className="display mt-6 truncate text-[46px] font-extrabold leading-none">{name}</div>
        <div className="mt-5 h-px w-full" style={{ background: 'rgb(var(--tier) / 0.45)' }} />
        <div className="mt-5 grid grid-cols-3 gap-x-4 gap-y-5">
          {card.attrs.map((a) => (
            <div key={a.key} className="flex flex-col" title={a.hint}>
              <Ticker value={a.value} className="num text-[34px]" duration={1100} delay={200} />
              <span className="mt-1.5 text-[12px] font-semibold text-fg-3">{a.key}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** A club-style shield, chalked in the tier's colour, with the ball in the middle. */
function Crest() {
  return (
    <svg width="46" height="54" viewBox="0 0 46 54" fill="none" stroke="rgb(var(--tier))" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      <path d="M23 2 L43 8 V26 C43 39 34 47 23 52 C12 47 3 39 3 26 V8 Z" strokeWidth="1.6" />
      <g transform="translate(13 15)" strokeWidth="1.4">
        <circle cx="10" cy="10" r="9" />
        <path d="M10 5.6 L14.2 8.6 L12.6 13.5 H7.4 L5.8 8.6 Z" fill="rgb(var(--tier))" stroke="none" />
        <path d="M10 5.6 V1.2 M14.2 8.6 L18.6 7.2 M12.6 13.5 L15.3 17.2 M7.4 13.5 L4.7 17.2 M5.8 8.6 L1.4 7.2" />
      </g>
    </svg>
  )
}
