import { ChevronRight, Info, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { RatingBadge } from '../../components/ActivityRow'
import { Ball } from '../../components/icons/SportIcon'
import { IconButton, Screen } from '../../components/ui/Screen'
import { Empty, SampleBadge, Section } from '../../components/ui/bits'
import { Ticker } from '../../components/ui/Ticker'
import type { Match } from '../../data/types'
import { useUi } from '../../data/ui'
import { useWorld } from '../../data/world'
import { dur, fmt, km } from '../../lib/format'
import { ratingTone, result } from '../../lib/football'
import { PlayerCard } from './PlayerCard'
import { season } from './season'

export function FootballScreen() {
  const w = useWorld()
  const open = useUi((s) => s.open)
  const s = season(w)
  const [explain, setExplain] = useState(false)
  const form = [...s.matches].slice(0, 8).reverse()
  return (
    <Screen
      title="Football"
      kicker={
        <span className="flex items-center gap-2">
          Season {s.label} · {s.apps} games {w.mode === 'sample' && <SampleBadge />}
        </span>
      }
      actions={
        <IconButton label="Log a match" onClick={() => open({ type: 'logMatch' })}>
          <Plus size={18} />
        </IconButton>
      }
    >
      {w.unrated.slice(0, 2).map((a) => (
        <button key={a.id} onClick={() => open({ type: 'logMatch', activityId: a.id })} className="press card mb-3 flex w-full items-center gap-3 border-warn/40 p-3.5 text-left">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-warn/15 text-warn">
            <Ball size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="label block text-warn">Unrated game</span>
            <span className="block truncate text-[15px] font-semibold">
              {a.name} · {fmt(a.start, 'EEE d MMM')}
            </span>
            <span className="font-mono text-[11px] text-fg-3">
              {dur(a.durationS)} · {km(a.distanceM, 1)} km{a.football ? ` · ${a.football.sprints} sprints` : ''}
            </span>
          </span>
          <span className="btn-primary h-10 shrink-0 px-4 text-[14px]">Rate</span>
        </button>
      ))}

      {s.card ? (
        <div className="pt-2">
          <PlayerCard card={s.card} name={w.profile.name} apps={s.apps} goals={s.goals} assists={s.assists} />
          <button onClick={() => setExplain((x) => !x)} className="mx-auto mt-3 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-fg-3">
            <Info size={13} /> How the card is built
          </button>
          {explain && (
            <div className="card mt-3 grid grid-cols-1 gap-2 p-4 text-[13px] text-fg-2">
              {s.card.attrs.map((a) => (
                <div key={a.key} className="flex justify-between gap-3">
                  <span>
                    <b className="font-mono text-fg">{a.key}</b> {a.label}
                  </span>
                  <span className="text-right text-fg-3">{a.hint}</span>
                </div>
              ))}
              <p className="mt-1 text-fg-3">Pace, stamina and work rate come from your watch. Shooting and passing come from what you log. Tiers: bronze under 65, silver 65+, gold 75+, in form 85+.</p>
            </div>
          )}
        </div>
      ) : (
        <Empty title="No card yet">Log three matches and your player card appears here.</Empty>
      )}

      <Section title="Season">
        <div className="card grid grid-cols-3 divide-x divide-line">
          {[
            { k: 'Apps', v: s.apps },
            { k: 'Goals', v: s.goals },
            { k: 'Assists', v: s.assists },
          ].map((x) => (
            <div key={x.k} className="p-3.5">
              <div className="label">{x.k}</div>
              <Ticker value={x.v} className="num mt-1 block text-[40px]" />
            </div>
          ))}
        </div>
        <div className="card mt-2 grid grid-cols-3 divide-x divide-line">
          <div className="p-3.5">
            <div className="label">Record</div>
            <div className="num mt-1 text-[24px]">
              <span className="text-z2">{s.w}</span>
              <span className="text-fg-4">-</span>
              <span>{s.d}</span>
              <span className="text-fg-4">-</span>
              <span className="text-z5">{s.l}</span>
            </div>
            <div className="font-mono text-[9.5px] uppercase text-fg-4">W-D-L</div>
          </div>
          <div className="p-3.5">
            <div className="label">Win rate</div>
            <div className="num mt-1 text-[24px]">{s.apps ? Math.round((s.w / s.apps) * 100) : 0}%</div>
          </div>
          <div className="p-3.5">
            <div className="label">Avg rating</div>
            <div className={`num mt-1 text-[24px] ${ratingTone(s.avgRating).text}`}>{s.avgRating.toFixed(2)}</div>
          </div>
        </div>
      </Section>

      {form.length > 0 && (
        <Section title="Form" action={<span className="font-mono text-[10.5px] uppercase text-fg-3">oldest → latest</span>}>
          <div className="grid grid-cols-8 gap-1.5">
            {form.map((m) => {
              const r = result(m)
              return (
                <Link key={m.id} to={`/match/${m.id}`} className="press flex flex-col items-center gap-1.5">
                  <span className={`grid aspect-square w-full place-items-center rounded-[6px] font-display text-[20px] font-black ${r === 'W' ? 'bg-z2 text-ink-0' : r === 'D' ? 'bg-ink-3 text-fg' : 'bg-z5 text-ink-0'}`}>{r}</span>
                  <span className={`num text-[14px] ${ratingTone(m.rating).text}`}>{m.rating.toFixed(1)}</span>
                </Link>
              )
            })}
          </div>
        </Section>
      )}

      <Section title="Records">
        <div className="grid grid-cols-2 gap-2">
          <Record label="Top speed" value={s.records.top ? `${s.records.top.a.topSpeedKmh}` : '–'} unit="km/h" m={s.records.top?.m} />
          <Record label="Most sprints" value={s.records.sprints ? `${s.records.sprints.a.sprints}` : '–'} m={s.records.sprints?.m} />
          <Record label="Best rating" value={s.records.bestRating ? s.records.bestRating.rating.toFixed(1) : '–'} m={s.records.bestRating} />
          <Record label="Most G+A" value={s.records.ga ? `${s.records.ga.goals + s.records.ga.assists}` : '–'} m={s.records.ga} />
        </div>
      </Section>

      <Section title="Matches">
        <div className="flex flex-col gap-2">
          {s.matches.map((m) => (
            <MatchRow key={m.id} m={m} />
          ))}
        </div>
      </Section>
    </Screen>
  )
}

function Record({ label, value, unit, m }: { label: string; value: string; unit?: string; m?: Match }) {
  const inner = (
    <>
      <div className="label">{label}</div>
      <div className="num mt-1.5 text-[34px]">
        {value}
        {unit && <span className="ml-1 font-sans text-[12px] font-medium text-fg-3">{unit}</span>}
      </div>
      <div className="mt-1 truncate font-mono text-[10px] uppercase text-fg-4">{m ? `${fmt(m.date, 'd MMM')} vs ${m.opponent}` : ''}</div>
    </>
  )
  return m ? (
    <Link to={`/match/${m.id}`} className="press card p-3.5">
      {inner}
    </Link>
  ) : (
    <div className="card p-3.5">{inner}</div>
  )
}

export function MatchRow({ m }: { m: Match }) {
  const r = result(m)
  return (
    <Link to={`/match/${m.id}`} className="press card flex items-center gap-3 p-3 pr-2.5">
      <span className={`grid h-10 w-7 shrink-0 place-items-center rounded-[6px] font-display text-[17px] font-black ${r === 'W' ? 'bg-z2/15 text-z2' : r === 'D' ? 'bg-ink-3 text-fg-2' : 'bg-z5/15 text-z5'}`}>{r}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">
          {m.scoreFor}–{m.scoreAgainst} vs {m.opponent}
        </span>
        <span className="block truncate font-mono text-[10.5px] uppercase tracking-[0.05em] text-fg-3">
          {fmt(m.date, 'EEE d MMM')} · {m.format}-a-side
          {m.goals ? ` · ${m.goals}G` : ''}
          {m.assists ? ` · ${m.assists}A` : ''}
        </span>
      </span>
      <RatingBadge rating={m.rating} size="row" />
      <ChevronRight size={16} className="text-fg-4" />
    </Link>
  )
}
