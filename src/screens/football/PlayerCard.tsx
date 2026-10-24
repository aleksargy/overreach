import type { PlayerCard as Card } from '../../lib/football'
import { Ticker } from '../../components/ui/Ticker'

const TIER_NAME = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', elite: 'In form' } as const
const POS = { GK: 'GK', DEF: 'DEF', MID: 'MID', FWD: 'ST', ANY: 'UTL' } as const

/** The collectible-card treatment: metal by tier, with a slow sheen. */
export function PlayerCard({ card, name, apps, goals, assists }: { card: Card; name: string; apps: number; goals: number; assists: number }) {
  return (
    <div className={`tier-${card.tier} mx-auto w-full max-w-[340px]`}>
      <div className="metal-bg relative rounded-[24px] p-px">
        <div
          className="sheen relative overflow-hidden rounded-[23px] px-6 pb-6 pt-5"
          style={{
            background:
              'radial-gradient(120% 80% at 85% 0%, rgb(var(--tint) / 0.2), transparent 60%), radial-gradient(90% 60% at 0% 100%, rgb(var(--tint) / 0.08), transparent 70%), rgb(var(--ink-1))',
          }}
        >
          <div className="flex items-start justify-between">
            <div>
              <Ticker value={card.overall} className="metal-text block text-[72px] font-semibold leading-[0.9] tracking-[-0.05em] tabular-nums" duration={1200} />
              <div className="metal-text mt-1.5 text-[15px] font-semibold tracking-[0.08em]">{POS[card.position]}</div>
            </div>
            <div className="flex flex-col items-end text-right">
              <Crest />
              <div className="mt-2.5 text-[12px] font-medium text-fg-2">{TIER_NAME[card.tier]}</div>
              <div className="mt-0.5 text-[12px] tabular-nums text-fg-4">
                {apps} apps · {goals}G · {assists}A
              </div>
            </div>
          </div>
          <div className="metal-text mt-7 truncate pb-1 text-[34px] font-semibold leading-none tracking-[-0.035em]">{name}</div>
          <div className="metal-bg mt-4 h-px w-full opacity-40" />
          <div className="mt-5 grid grid-cols-3 gap-x-4 gap-y-4">
            {card.attrs.map((a) => (
              <div key={a.key} className="flex flex-col" title={a.hint}>
                <Ticker value={a.value} className="metal-text text-[26px] font-semibold leading-none tracking-[-0.03em] tabular-nums" duration={1100} delay={200} />
                <span className="mt-1.5 text-[11px] font-semibold tracking-[0.08em] text-fg-3">{a.key}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** A club-style shield in the tier's metal, with the ball in the middle. */
function Crest() {
  return (
    <svg width="46" height="54" viewBox="0 0 46 54" aria-hidden="true">
      <defs>
        <linearGradient id="crest-metal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--m1)" />
          <stop offset="0.55" stopColor="var(--m2)" />
          <stop offset="1" stopColor="var(--m3)" />
        </linearGradient>
      </defs>
      <path d="M23 2 L43 8 V26 C43 39 34 47 23 52 C12 47 3 39 3 26 V8 Z" fill="rgb(var(--tint) / 0.12)" stroke="url(#crest-metal)" strokeWidth="2" />
      <path d="M23 7 L38 11.5 V26 C38 36 31.5 42.5 23 46.5 C14.5 42.5 8 36 8 26 V11.5 Z" fill="none" stroke="url(#crest-metal)" strokeOpacity="0.45" strokeWidth="1" />
      <g transform="translate(13 16)" stroke="url(#crest-metal)" fill="none" strokeWidth="1.7" strokeLinejoin="round">
        <circle cx="10" cy="10" r="9" />
        <path d="M10 5.6 L14.2 8.6 L12.6 13.5 H7.4 L5.8 8.6 Z" fill="url(#crest-metal)" />
        <path d="M10 5.6 V1.2 M14.2 8.6 L18.6 7.2 M12.6 13.5 L15.3 17.2 M7.4 13.5 L4.7 17.2 M5.8 8.6 L1.4 7.2" />
      </g>
    </svg>
  )
}
