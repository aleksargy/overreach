import { differenceInCalendarDays, parseISO } from 'date-fns'
import { Info, Plus } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { RatingBadge } from '../../components/ActivityRow'
import { PitchHeatmap } from '../../components/charts/PitchHeatmap'
import { SportDot } from '../../components/icons/SportIcon'
import { IconButton, Screen } from '../../components/ui/Screen'
import { Empty, SampleBadge, Section, Segmented } from '../../components/ui/bits'
import { Swipeable } from '../../components/ui/Swipe'
import { Ticker } from '../../components/ui/Ticker'
import type { Activity, Format, Match, Position } from '../../data/types'
import { useSkipRating, useUi } from '../../data/ui'
import { useWorld } from '../../data/world'
import { dur, fmt, km } from '../../lib/format'
import { POSITIONS, headToHead, ratingTone, recordWords, recurringPoints, result, rivals, seasonPitch, type Rivalry } from '../../lib/football'
import { PlayerCard } from './PlayerCard'
import { season } from './season'

const RESULT_CLS = { W: 'bg-z2/15 text-z2', D: 'bg-fg/10 text-fg-2', L: 'bg-z5/15 text-z5' } as const

/** the format you last looked at, kept while the app is open */
let lastPicked: Format | undefined

export function FootballScreen() {
  const w = useWorld()
  const open = useUi((s) => s.open)
  const skip = useSkipRating()
  const s = season(w)
  const [explain, setExplain] = useState(false)
  const [picked, setPicked] = useState(lastPicked)
  const f = picked !== undefined && s.formats.includes(picked) ? picked : s.formats[0]
  const fs = f !== undefined ? s.format(f) : undefined
  const form = fs ? fs.matches.slice(0, 8).reverse() : []
  const { top, sprints, bestRating, ga } = fs?.records ?? {}
  const records = [
    top && <Record key="top" label="Top speed" value={top.a.topSpeedKmh.toFixed(1)} unit="km/h" m={top.m} act={top.act} />,
    sprints && <Record key="sprints" label="Most sprints" value={`${sprints.a.sprints}`} m={sprints.m} act={sprints.act} />,
    bestRating && <Record key="rating" label="Best rating" value={bestRating.rating.toFixed(1)} m={bestRating} />,
    ga && ga.goals + ga.assists > 0 && <Record key="ga" label="Most goals and assists" value={`${ga.goals + ga.assists}`} m={ga} />,
  ].filter(Boolean)
  const unrated = w.unrated.slice(0, s.apps ? 2 : 3)
  // rivalries run across seasons, but only against the same kind of game
  const h2h = f !== undefined ? headToHead(w.matches.filter((m) => m.format === f)) : []
  const { nemesis, favourite } = rivals(h2h)
  const met = h2h.filter((r) => r.games >= 2).slice(0, 6)
  const recurring = fs ? recurringPoints(fs.matches.slice(0, 10)).slice(0, 4) : []
  const [pos, setPos] = useState<Position | 'all'>('all')
  const positions = [...new Set((fs?.pitch ?? []).map((x) => x.position).filter((x): x is Position => !!x))]
  const where = pos !== 'all' && positions.includes(pos) ? pos : 'all'
  const pitch = useMemo(() => fs && seasonPitch(fs.pitch.filter((x) => where === 'all' || x.position === where).map((x) => x.trace)), [w, f, where])
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
        <div className="mb-8">
          <div className="card list overflow-hidden [--inset:68px]">
            <AnimatePresence initial={false}>
              {unrated.map((a) => (
                <Swipeable key={a.id} hint="Skip" onSwipe={() => skip(a.id)}>
                  <UnratedRow a={a} now={w.now} onRate={() => open({ type: 'logMatch', activityId: a.id })} />
                </Swipeable>
              ))}
            </AnimatePresence>
          </div>
          <p className="mt-2 px-1 text-[12px] text-fg-4">Swipe a game left if you&rsquo;d rather not rate it.</p>
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
                Pace, stamina and work rate come from your watch. Shooting and passing come from what you log. Each game is judged against its own format first, so a goal in 11s
                counts for more than one in 7s. Tiers: bronze under 65, silver 65+, gold 75+, in form 85+.
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

      {s.formats.length > 1 && f !== undefined && (
        <div className="mt-10">
          <Segmented
            value={f}
            onChange={(v) => {
              lastPicked = v
              setPicked(v)
            }}
            options={s.formats.map((x) => ({ value: x, label: `${x}-a-side` }))}
          />
          <p className="meta mt-2.5 px-1">Results, form and records only compare games of the same format.</p>
        </div>
      )}

      {fs && fs.apps > 0 && (
        <Section title="Season">
          <div className="card overflow-hidden">
            <div className="grid grid-cols-3">
              {[
                { k: 'Apps', v: fs.apps },
                { k: 'Goals', v: fs.goals },
                { k: 'Assists', v: fs.assists },
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
                  <span className="text-z2">{fs.w}</span>
                  <span className="text-fg-4"> · </span>
                  <span className="text-fg-2">{fs.d}</span>
                  <span className="text-fg-4"> · </span>
                  <span className="text-z5">{fs.l}</span>
                </div>
              </div>
              <div className="px-4 py-4">
                <div className="label">Win rate</div>
                <div className="num mt-2.5 text-[20px]">{Math.round((fs.w / fs.apps) * 100)}%</div>
              </div>
              <div className="px-4 py-4">
                <div className="label">Avg rating</div>
                <div className={`num mt-2.5 text-[20px] ${ratingTone(fs.avgRating).text}`}>{fs.avgRating.toFixed(2)}</div>
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
          {recurring.length > 0 && (
            <div className="mt-5">
              <div className="label mb-2.5">Keeps coming up</div>
              <div className="flex flex-wrap gap-2">
                {recurring.map((x) => (
                  <span key={`${x.good}${x.text}`} className="chip">
                    <span className={`text-[13px] font-semibold ${x.good ? 'text-z2' : 'text-z5'}`}>{x.good ? '+' : '−'}</span>
                    {x.text}
                    <span className="tabular-nums text-fg-4">×{x.games}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {records.length > 0 && (
        <Section title="Records">
          <div className="grid grid-cols-2 gap-2">{records}</div>
        </Section>
      )}

      {pitch && pitch.games >= 2 && f !== undefined && (
        <Section title="Where you play" action={<span className="meta">{pitch.games} games this season</span>}>
          {positions.length > 1 && (
            <div className="mb-3">
              <Segmented
                size="sm"
                value={where}
                onChange={setPos}
                options={[{ value: 'all' as const, label: 'All' }, ...positions.map((p) => ({ value: p, label: POSITIONS.find((x) => x.key === p)?.label ?? p }))]}
              />
            </div>
          )}
          <PitchHeatmap points={pitch.points} format={f} attacking={pitch.sure} />
          <p className="mt-2.5 px-1 text-[12px] text-fg-4">
            {pitch.sure
              ? 'Every half turned so you attack left to right, judged from where you stood at kick-off.'
              : 'Every half laid the same way round, but which end you attacked couldn’t be told, so it may be back to front.'}
          </p>
        </Section>
      )}

      {met.length > 0 && (
        <Section title="Head to head" action={<span className="meta">Every season</span>}>
          {(nemesis || favourite) && (
            <div className="mb-2 grid grid-cols-2 gap-2">
              {nemesis && <Rival label="Bogey team" r={nemesis} />}
              {favourite && <Rival label="Favourite fixture" r={favourite} />}
            </div>
          )}
          <div className="card list overflow-hidden">
            {met.map((r) => (
              <RivalRow key={r.opponent} r={r} />
            ))}
          </div>
        </Section>
      )}

      {fs && fs.matches.length > 0 && (
        <Section title="Matches">
          <div className="card list overflow-hidden [--inset:60px]">
            {fs.matches.map((m) => (
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

function Rival({ label, r }: { label: string; r: Rivalry }) {
  return (
    <div className="card p-4">
      <div className="label truncate">{label}</div>
      <div className="mt-2.5 line-clamp-2 text-[17px] font-semibold leading-tight">{r.opponent}</div>
      <div className="meta mt-1.5">
        {recordWords(r).replace(/^./, (c) => c.toUpperCase())} · {r.scored}–{r.conceded}
      </div>
    </div>
  )
}

function RivalRow({ r }: { r: Rivalry }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium leading-5">{r.opponent}</span>
        <span className="meta block truncate">
          {r.games} games · {r.scored}–{r.conceded} on goals
        </span>
      </span>
      <span className="num shrink-0 text-[15px]">
        <span className="text-z2">{r.w}</span>
        <span className="text-fg-4"> · </span>
        <span className="text-fg-2">{r.d}</span>
        <span className="text-fg-4"> · </span>
        <span className="text-z5">{r.l}</span>
      </span>
      <RatingBadge rating={r.avgRating} size="row" />
    </div>
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
