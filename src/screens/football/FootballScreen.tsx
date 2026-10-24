import { differenceInCalendarDays, parseISO } from 'date-fns'
import { Info, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { RatingBadge } from '../../components/ActivityRow'
import { SportDot } from '../../components/icons/SportIcon'
import { IconButton, Screen } from '../../components/ui/Screen'
import { Empty, SampleBadge, Section } from '../../components/ui/bits'
import { Ticker } from '../../components/ui/Ticker'
import type { Activity, Match } from '../../data/types'
import { useUi } from '../../data/ui'
import { useWorld } from '../../data/world'
import { dur, fmt, km } from '../../lib/format'
import { ratingTone, result } from '../../lib/football'
import { PlayerCard } from './PlayerCard'
import { season } from './season'

const RESULT_CLS = { W: 'bg-z2/15 text-z2', D: 'bg-fg/10 text-fg-2', L: 'bg-z5/15 text-z5' } as const

export function FootballScreen() {
  const w = useWorld()
  const open = useUi((s) => s.open)
  const s = season(w)
  const [explain, setExplain] = useState(false)
  const form = [...s.matches].slice(0, 8).reverse()
  const { top, sprints, bestRating, ga } = s.records
  const records = [
    top && <Record key="top" label="Top speed" value={top.a.topSpeedKmh.toFixed(1)} unit="km/h" m={top.m} act={top.act} />,
    sprints && <Record key="sprints" label="Most sprints" value={`${sprints.a.sprints}`} m={sprints.m} act={sprints.act} />,
    bestRating && <Record key="rating" label="Best rating" value={bestRating.rating.toFixed(1)} m={bestRating} />,
    ga && ga.goals + ga.assists > 0 && <Record key="ga" label="Most goals and assists" value={`${ga.goals + ga.assists}`} m={ga} />,
  ].filter(Boolean)
  const unrated = w.unrated.slice(0, s.apps ? 2 : 3)
  return (
    <Screen
      title="Football"
      kicker={
        <span className="flex items-center gap-2">
          Season {s.label} · {s.apps ? `${s.apps} rated` : `${s.games} games`} {w.mode === 'sample' && <SampleBadge />}
        </span>
      }
      actions={
        <IconButton label="Log a match" onClick={() => open({ type: 'logMatch' })}>
          <Plus size={19} strokeWidth={2} />
        </IconButton>
      }
    >
      {unrated.length > 0 && (
        <div className="card list mb-8 overflow-hidden [--inset:68px]">
          {unrated.map((a) => (
            <UnratedRow key={a.id} a={a} now={w.now} onRate={() => open({ type: 'logMatch', activityId: a.id })} />
          ))}
        </div>
      )}

      {s.card ? (
        <div>
          <PlayerCard card={s.card} name={w.profile.name} apps={s.apps} goals={s.goals} assists={s.assists} />
          <button onClick={() => setExplain((x) => !x)} className="link mx-auto mt-4 flex text-[13px]">
            <Info size={14} strokeWidth={1.75} className="mr-1" /> How the card is built
          </button>
          {explain && (
            <div className="card list mt-3 overflow-hidden">
              {s.card.attrs.map((a) => (
                <div key={a.key} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-[14px]">
                  <span className="text-fg-2">
                    <span className="mr-2 font-semibold tracking-[0.02em] text-fg">{a.key}</span>
                    {a.label}
                  </span>
                  <span className="text-right text-[13px] text-fg-3">{a.hint}</span>
                </div>
              ))}
              <p className="px-4 py-3 text-[13px] leading-snug text-fg-3">
                Pace, stamina and work rate come from your watch. Shooting and passing come from what you log. Tiers: bronze under 65, silver 65+, gold 75+, in form 85+.
              </p>
            </div>
          )}
        </div>
      ) : (
        <Empty title="No card yet">
          {s.apps === 0 && s.games > 0
            ? `Your watch has ${s.games} games this season. Rate three and your player card appears here.`
            : `Rate ${3 - Math.min(2, s.apps)} more ${s.apps === 2 ? 'game' : 'games'} and your player card appears here.`}
        </Empty>
      )}

      {s.apps > 0 && (
        <Section title="Season">
          <div className="card overflow-hidden">
            <div className="grid grid-cols-3">
              {[
                { k: 'Apps', v: s.apps },
                { k: 'Goals', v: s.goals },
                { k: 'Assists', v: s.assists },
              ].map((x) => (
                <div key={x.k} className="px-4 pb-4 pt-4">
                  <div className="label">{x.k}</div>
                  <Ticker value={x.v} className="num-hero mt-3 block text-[44px]" />
                </div>
              ))}
            </div>
            <div className="mx-4 h-px bg-line" />
            <div className="grid grid-cols-3">
              <div className="px-4 py-4">
                <div className="label">Record</div>
                <div className="num mt-2.5 text-[20px]">
                  <span className="text-z2">{s.w}</span>
                  <span className="text-fg-4"> · </span>
                  <span className="text-fg-2">{s.d}</span>
                  <span className="text-fg-4"> · </span>
                  <span className="text-z5">{s.l}</span>
                </div>
              </div>
              <div className="px-4 py-4">
                <div className="label">Win rate</div>
                <div className="num mt-2.5 text-[20px]">{s.apps ? Math.round((s.w / s.apps) * 100) : 0}%</div>
              </div>
              <div className="px-4 py-4">
                <div className="label">Avg rating</div>
                <div className={`num mt-2.5 text-[20px] ${ratingTone(s.avgRating).text}`}>{s.avgRating.toFixed(2)}</div>
              </div>
            </div>
          </div>
        </Section>
      )}

      {form.length > 0 && (
        <Section title="Form" action={<span className="meta">Last {form.length}, oldest first</span>}>
          <div className="grid grid-cols-8 gap-1.5">
            {form.map((m) => {
              const r = result(m)
              return (
                <Link key={m.id} to={`/match/${m.id}`} className="press flex flex-col items-center gap-2">
                  <span className={`grid aspect-square w-full place-items-center rounded-[10px] text-[15px] font-semibold ${RESULT_CLS[r]}`}>{r}</span>
                  <span className={`text-[13px] font-medium tabular-nums ${ratingTone(m.rating).text}`}>{m.rating.toFixed(1)}</span>
                </Link>
              )
            })}
          </div>
        </Section>
      )}

      {records.length > 0 && (
        <Section title="Records">
          <div className="grid grid-cols-2 gap-2">{records}</div>
        </Section>
      )}

      {s.matches.length > 0 && (
        <Section title="Matches">
          <div className="card list overflow-hidden [--inset:60px]">
            {s.matches.map((m) => (
              <MatchRow key={m.id} m={m} />
            ))}
          </div>
        </Section>
      )}
    </Screen>
  )
}

function UnratedRow({ a, now, onRate }: { a: Activity; now: Date; onRate: () => void }) {
  const ago = differenceInCalendarDays(now, parseISO(a.start))
  const when = ago === 0 ? 'Today’s game' : ago === 1 ? 'Yesterday’s game' : fmt(a.start, 'EEEE d MMM')
  return (
    <button onClick={onRate} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150 active:bg-ink-2">
      <SportDot sport="football" size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium leading-5">{when}</span>
        <span className="meta block truncate">
          {dur(a.durationS)} · {km(a.distanceM, 1)} km{a.football ? ` · ${a.football.sprints} sprints` : ''}
        </span>
      </span>
      <span className="rounded-full bg-fg px-4 py-2 text-[14px] font-semibold leading-none text-ink-0">Rate</span>
    </button>
  )
}

function Record({ label, value, unit, m, act }: { label: string; value: string; unit?: string; m?: Match; act?: Activity }) {
  const inner = (
    <>
      <div className="label truncate">{label}</div>
      <div className="num mt-3 text-[28px]">
        {value}
        {unit && <span className="ml-1 text-[13px] font-normal tracking-normal text-fg-3">{unit}</span>}
      </div>
      <div className="meta mt-1.5 truncate">{m ? `${fmt(m.date, 'd MMM')} · ${m.opponent}` : act ? `${fmt(act.start, 'd MMM')} · not rated` : ''}</div>
    </>
  )
  return m || act ? (
    <Link to={m ? `/match/${m.id}` : `/activity/${act!.id}`} className="press card p-4">
      {inner}
    </Link>
  ) : (
    <div className="card p-4">{inner}</div>
  )
}

export function MatchRow({ m }: { m: Match }) {
  const r = result(m)
  return (
    <Link to={`/match/${m.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors duration-150 active:bg-ink-2">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-[9px] text-[13px] font-semibold ${RESULT_CLS[r]}`}>{r}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium leading-5">
          {m.scoreFor}–{m.scoreAgainst} vs {m.opponent}
        </span>
        <span className="meta block truncate">
          {fmt(m.date, 'EEE d MMM')} · {m.format}-a-side
          {m.goals ? ` · ${m.goals} ${m.goals === 1 ? 'goal' : 'goals'}` : ''}
          {m.assists ? ` · ${m.assists} ${m.assists === 1 ? 'assist' : 'assists'}` : ''}
        </span>
      </span>
      <RatingBadge rating={m.rating} size="row" />
    </Link>
  )
}
