import { Info, Plus } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { RatingBadge } from '../../components/ActivityRow'
import { PitchHeatmap } from '../../components/charts/PitchHeatmap'
import { Mark } from '../../components/ui/Mark'
import { IconButton, Screen } from '../../components/ui/Screen'
import { StandoutLine } from '../../components/ui/Standout'
import { Empty, SampleBadge, Section, Segmented } from '../../components/ui/bits'
import type { Activity, Format, Match, Position } from '../../data/types'
import { useUi } from '../../data/ui'
import { useWorld } from '../../data/world'
import { fmt } from '../../lib/format'
import { POSITIONS, headToHead, ratingTone, recordWords, recurringPoints, result, rivals, seasonPitch, type Rivalry } from '../../lib/football'
import { IN_FORM, PlayerCard } from './PlayerCard'
import { RateTile } from './RateTile'
import { season } from './season'

/** A result as a form guide shows it: a win in green, a defeat in red, a draw in graphite. */
const RESULT_CLS = { W: 'bg-z2 text-ink-0', D: 'bg-line-2 text-fg', L: 'bg-bad text-ink-0' } as const

export function ResultMark({ r, className = '' }: { r: 'W' | 'D' | 'L'; className?: string }) {
  return <span className={`grid place-items-center font-extrabold ${RESULT_CLS[r]} ${className}`}>{r}</span>
}

/** the format you last looked at, kept while the app is open */
let lastPicked: Format | undefined

export function FootballScreen() {
  const w = useWorld()
  const open = useUi((s) => s.open)
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
    ga && ga.goals + ga.assists > 0 && <Record key="ga" label="Goals and assists" value={`${ga.goals + ga.assists}`} m={ga} />,
  ].filter(Boolean)
  const unrated = w.unrated.slice(0, 2)
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
        <IconButton label="Log a match" onClick={() => open({ type: 'logMatch' })} active>
          <Plus size={18} strokeWidth={2.2} />
        </IconButton>
      }
    >
      {s.formats.length > 1 && f !== undefined && (
        <div className="mb-2.5">
          <Segmented
            value={f}
            onChange={(v) => {
              lastPicked = v
              setPicked(v)
            }}
            options={s.formats.map((x) => ({ value: x, label: `${x}-a-side` }))}
          />
        </div>
      )}

      {s.card ? (
        <>
          <div className="flex items-stretch gap-3">
            <PlayerCard card={s.card} name={w.profile.name.trim()} />
            {fs && <SeasonTiles fs={fs} column />}
          </div>
          <button onClick={() => setExplain((x) => !x)} aria-expanded={explain} className="link mx-auto mt-3 flex">
            <Info size={14} strokeWidth={2} className="mr-1" /> How the card is built
          </button>
          {explain && (
            <div className="tile mt-2.5">
              <div className="list">
                {s.card.attrs.map((a) => (
                  <div key={a.key} className="flex items-baseline justify-between gap-3 py-2.5 text-[14px]">
                    <span className="text-fg-2">
                      <span className="mr-2 font-bold text-fg">{a.key}</span>
                      {a.label}
                    </span>
                    <span className="text-right text-[13px] text-fg-3">{a.hint}</span>
                  </div>
                ))}
              </div>
              <p className="meta mt-2 leading-snug">
                Pace, stamina and work rate come from your watch. Shooting and passing come from what you log. Each game is judged against its own format first, so a goal in 11s
                counts for more than one in 7s. The edge is bronze under 65, silver from 65 and gold from 75, and the card says you&rsquo;re in form when your form is {IN_FORM} or
                more.
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          <Empty title="No card yet">
            {s.apps === 0 && s.games > 0
              ? `Your watch has ${s.games} games this season. Rate three and your player card appears here.`
              : `Rate ${3 - Math.min(2, s.apps)} more ${s.apps === 2 ? 'game' : 'games'} and your player card appears here.`}
          </Empty>
          {fs && fs.apps > 0 && <SeasonTiles fs={fs} />}
        </>
      )}

      <AnimatePresence initial={false}>
        {unrated.map((a) => (
          <div key={a.id} className="mt-2.5">
            <RateTile a={a} w={w} />
          </div>
        ))}
      </AnimatePresence>

      {w.news.football && <StandoutLine s={w.news.football} className="mt-2.5" />}

      {form.length > 0 && (
        <Section title="Form">
          <div className="flex gap-[5px]">
            {form.map((m) => (
              <Link
                key={m.id}
                to={`/match/${m.id}`}
                className={`press flex h-11 min-w-0 flex-1 flex-col items-center justify-center rounded-[14px] leading-[1.1] ${RESULT_CLS[result(m)]}`}
              >
                <span className="text-[13px] font-extrabold">{result(m)}</span>
                <span className="text-[10.5px] font-bold tabular-nums">{m.rating.toFixed(1)}</span>
              </Link>
            ))}
          </div>
          {recurring.length > 0 && (
            <div className="mt-4">
              <div className="label mb-1">Keeps coming up</div>
              <div className="list">
                {recurring.map((x) => (
                  <div key={`${x.good}${x.text}`} className="flex items-center gap-2.5 py-2.5 text-[14px]">
                    <Mark good={x.good} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-fg-2">{x.text}</span>
                    <span className="text-[12.5px] font-semibold tabular-nums text-fg-3">×{x.games}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {records.length > 0 && (
        <Section title="Records">
          <div className="grid grid-cols-2 gap-x-3 gap-y-4">{records}</div>
        </Section>
      )}

      {pitch && pitch.games >= 2 && f !== undefined && (
        <Section title="Where you play" action={<span className="label">{pitch.sure ? 'Attacking →' : 'Either way round'}</span>}>
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
          <PitchHeatmap points={pitch.points} format={f} />
          <p className="mt-3 text-[13px] text-fg-2">
            {pitch.games} games this season{pitch.sure ? '' : ', and which end you attacked couldn’t be told'}
          </p>
        </Section>
      )}

      {met.length > 0 && (
        <Section title="Head to head" action={<span className="label">Every season</span>}>
          {(nemesis || favourite) && (
            <div className="mb-3 grid grid-cols-2 gap-x-3">
              {nemesis && <Rival label="Bogey team" r={nemesis} />}
              {favourite && <Rival label="Favourite fixture" r={favourite} />}
            </div>
          )}
          <div className="list">
            {met.map((r) => (
              <RivalRow key={r.opponent} r={r} />
            ))}
          </div>
        </Section>
      )}

      {fs && fs.matches.length > 0 && (
        <Section title="Matches">
          <div className="list">
            {fs.matches.map((m) => (
              <MatchRow key={m.id} m={m} />
            ))}
          </div>
        </Section>
      )}
    </Screen>
  )
}

type FormatSeason = ReturnType<ReturnType<typeof season>['format']>

/** The season beside the card: apps, goals and assists, the average rating, and wins, draws and defeats as a bar. */
function SeasonTiles({ fs, column }: { fs: FormatSeason; column?: boolean }) {
  if (!fs.apps) return null
  const mini = 'flex flex-col justify-center rounded-2xl bg-ink-1 px-3 py-2.5'
  return (
    <div className={column ? 'flex min-w-0 flex-1 flex-col gap-2' : 'mt-2.5 grid grid-cols-2 gap-2'}>
      <div className={mini}>
        <span className="display text-[24px] font-bold leading-[1.2]">{fs.apps}</span>
        <span className="label">Apps</span>
      </div>
      <div className={mini}>
        <span className="display text-[24px] font-bold leading-[1.2]">
          {fs.goals} · {fs.assists}
        </span>
        <span className="label">Goals · assists</span>
      </div>
      <div className={mini}>
        <span className={`display text-[24px] font-bold leading-[1.2] ${ratingTone(fs.avgRating).text}`}>{fs.avgRating.toFixed(1)}</span>
        <span className="label">Avg rating</span>
      </div>
      <div className={`${mini} flex-1 gap-2`}>
        <div className="flex h-2 gap-0.5">
          {fs.w > 0 && <span className="rounded-[3px] bg-z2" style={{ flex: fs.w }} />}
          {fs.d > 0 && <span className="rounded-[3px] bg-line-2" style={{ flex: fs.d }} />}
          {fs.l > 0 && <span className="rounded-[3px] bg-bad" style={{ flex: fs.l }} />}
        </div>
        <span className="label">
          W{fs.w} · D{fs.d} · L{fs.l}
        </span>
      </div>
    </div>
  )
}

function Record({ label, value, unit, m, act }: { label: string; value: string; unit?: string; m?: Match; act?: Activity }) {
  const inner = (
    <>
      <div className="label truncate">{label}</div>
      <div className="num mt-2 text-[24px]">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      <div className="meta mt-1 truncate">{m ? `${fmt(m.date, 'd MMM')} · ${m.opponent}` : act ? `${fmt(act.start, 'd MMM')} · not rated` : ''}</div>
    </>
  )
  return m || act ? (
    <Link to={m ? `/match/${m.id}` : `/activity/${act!.id}`} className="press min-w-0">
      {inner}
    </Link>
  ) : (
    <div className="min-w-0">{inner}</div>
  )
}

function Rival({ label, r }: { label: string; r: Rivalry }) {
  return (
    <div className="min-w-0">
      <div className="label truncate">{label}</div>
      <div className="t-name mt-1.5 line-clamp-2">{r.opponent}</div>
      <div className="meta mt-1.5">
        {recordWords(r).replace(/^./, (c) => c.toUpperCase())} · {r.scored}–{r.conceded}
      </div>
    </div>
  )
}

function RivalRow({ r }: { r: Rivalry }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold leading-5">{r.opponent}</span>
        <span className="meta block truncate">
          {r.games} games · {r.scored}–{r.conceded} on goals
        </span>
      </span>
      <span className="num shrink-0 text-[16px]">
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
    <Link to={`/match/${m.id}`} className="flex items-center gap-3 py-3 transition-colors duration-150 active:bg-ink-2">
      <ResultMark r={r} className="h-8 w-8 shrink-0 rounded-[10px] text-[13px]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold leading-5">
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
