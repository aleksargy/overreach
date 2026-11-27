import { FlipHorizontal2, Pencil, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Bars, StreamChart } from '../../components/charts/charts'
import { PitchHeatmap } from '../../components/charts/PitchHeatmap'
import { zoneColor } from '../../components/charts/primitives'
import { IconButton, Screen } from '../../components/ui/Screen'
import { Empty, Section, Segmented } from '../../components/ui/bits'
import { useStore } from '../../data/store'
import { useUi } from '../../data/ui'
import { useFootballAnalysis, useStream, useWorld } from '../../data/world'
import { fmt } from '../../lib/format'
import { FEEL, headToHead, ordinal, ratingTone, result, sameOpponent, type Bands, type Half } from '../../lib/football'
import { zoneBounds, zoneOf } from '../../lib/load'
import { median } from '../../lib/math'
import { MatchReplay } from './MatchReplay'
import { RatingLines } from './RatingLines'

export function MatchReportScreen() {
  const { id } = useParams()
  const w = useWorld()
  const nav = useNavigate()
  const open = useUi((s) => s.open)
  const saveMatch = useStore((s) => s.saveMatch)
  const deleteMatch = useStore((s) => s.deleteMatch)
  const m = w.matches.find((x) => x.id === id)
  const act = m?.activityId ? w.byId.get(m.activityId) : undefined
  const an = useFootballAnalysis(act, w)
  const stream = useStream(act)
  const [half, setHalf] = useState<'all' | '1' | '2'>('all')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // the games against this side before this one, in the same format
  const before = useMemo(() => (m ? headToHead(w.matches.filter((x) => x.format === m.format && x.date < m.date && sameOpponent(x.opponent, m.opponent)))[0] : undefined), [m, w])
  const ratingMedian = useMemo(() => {
    const others = m ? w.matches.filter((x) => x.id !== m.id && x.format === m.format) : []
    return others.length >= 2 ? median(others.map((x) => x.rating)) : undefined
  }, [m, w])

  if (!m) {
    return (
      <Screen title="Match" back>
        <Empty title="Match not found">It may have been deleted.</Empty>
      </Screen>
    )
  }

  const r = result(m)
  const tone = ratingTone(m.rating)
  const heat = an ? (half === 'all' ? an.heat : half === '1' ? an.heat.slice(0, an.half) : an.heat.slice(an.half)) : []
  const bounds = zoneBounds(w.profile)

  return (
    <Screen
      title="Match report"
      back
      bare
      actions={
        <IconButton label="Edit match" onClick={() => open({ type: 'logMatch', matchId: m.id })}>
          <Pencil size={16} strokeWidth={2} />
        </IconButton>
      }
    >
      <div className="label">
        {fmt(m.date, 'EEEE d MMM · HH:mm')} · {m.format}-a-side{before ? ` · ${ordinal(before.games + 1)} meeting` : ''}
      </div>

      {/* the score */}
      <section className="hero mt-3 flex flex-col gap-3.5 bg-ink-1">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <Side name={m.team} ours />
          <span className="num-hero text-[62px] leading-none">
            {m.scoreFor}–{m.scoreAgainst}
          </span>
          <Side name={m.opponent} />
        </div>
        <span className={`pill self-center px-3.5 py-[5px] font-extrabold ${r === 'W' ? '[--p:var(--good)]' : r === 'L' ? '[--p:var(--bad)]' : '[--p:var(--fg-2)]'}`}>
          {r === 'W' ? 'Win' : r === 'L' ? 'Loss' : 'Draw'}
        </span>
        <div className="grid grid-cols-3 border-t border-ink-2 pt-3.5">
          {[
            { k: 'Goals', v: m.goals },
            { k: 'Assists', v: m.assists },
            { k: 'Felt', v: FEEL[m.feel] },
          ].map((x) => (
            <div key={x.k} className="flex min-w-0 flex-col items-center gap-0.5">
              <span className="num max-w-full truncate text-[24px] leading-[1.2]">{x.v}</span>
              <span className="label">{x.k}</span>
            </div>
          ))}
        </div>
      </section>

      {/* the rating, and every line that moved it from 6.00 */}
      <section className="hero mt-2.5 flex flex-col gap-1.5 bg-gold-tint">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[13px] font-bold text-gold-label">Match rating</h2>
          {ratingMedian !== undefined && (
            <span className="pill [--p:var(--gold-head)]">
              Your {m.format}s median {ratingMedian.toFixed(1)}
            </span>
          )}
        </div>
        <div className="mb-2 mt-0.5 flex items-baseline gap-2.5">
          <span className="num-hero text-[64px] leading-[0.95] text-gold-head">{m.rating.toFixed(1)}</span>
          <span className="text-[15px] font-bold text-gold-label">{tone.word}</span>
        </div>
        <RatingLines m={m} />
      </section>

      {act && an ? (
        <>
          <section className="tile mt-2.5 flex flex-col gap-2.5">
            <h2 className="t-section">From the watch</h2>
            <div className="grid grid-cols-4">
              {[
                { v: (an.distanceM / 1000).toFixed(1), u: 'km' },
                { v: an.topSpeedKmh.toFixed(1), u: 'km/h top' },
                { v: String(an.sprints), u: 'sprints' },
                { v: String(Math.round(an.mPerMin)), u: 'm/min' },
              ].map((x) => (
                <div key={x.u} className="flex min-w-0 flex-col gap-0.5">
                  <span className="num text-[22px] leading-[1.2]">{x.v}</span>
                  <span className="truncate text-[11.5px] font-semibold text-fg-3">{x.u}</span>
                </div>
              ))}
            </div>
            <Speeds bands={an.bands} />
          </section>

          <Halves halves={an.halves} />

          <section className="tile mt-2.5 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="t-section">Where you played</h2>
              <button onClick={() => saveMatch({ ...m, flip: !m.flip })} title="Attacking the other way? Tap to turn it round" className="link text-[12.5px]">
                <FlipHorizontal2 size={13} strokeWidth={2} className="mr-1" /> Attacking →
              </button>
            </div>
            <PitchHeatmap points={heat} format={m.format} flip={m.flip} />
            <Segmented
              size="sm"
              value={half}
              onChange={setHalf}
              options={[
                { value: 'all', label: 'Full game' },
                { value: '1', label: '1st half' },
                { value: '2', label: '2nd half' },
              ]}
            />
          </section>

          {/* the game played back, on the same pitch */}
          {stream?.lat && <MatchReplay stream={stream} format={m.format} flip={m.flip} />}

          <Section title="Intensity" action={<span className="label">Metres per 5 minutes</span>}>
            <Bars
              values={an.buckets.map((b) => Math.round(b.distM))}
              labels={an.buckets.map((b, i) => (i % 2 === 0 ? `${b.startMin}′` : null))}
              colors={an.buckets.map((b) => (b.avgHr ? zoneColor(zoneOf(b.avgHr, bounds)) : 'rgb(var(--fg-4))'))}
              marker={an.fadeMinute !== undefined ? { index: an.fadeMinute / 5, label: `Fade ${an.fadeMinute}′` } : undefined}
              height={140}
              valueLabels
            />
          </Section>

          {stream?.hr && (
            <Section title="Heart rate">
              <StreamChart values={stream.hr} dt={stream.dt} kind="hr" bounds={bounds} height={150} />
            </Section>
          )}
        </>
      ) : (
        <Section title="From the watch">
          <p className="text-[14px] leading-snug text-fg-3">This match isn’t linked to a recording, so there’s no heatmap or work rate. Edit the match to link one.</p>
        </Section>
      )}

      {m.notes && (
        <Section title="Your notes">
          <p className="text-[16px] leading-snug text-fg-2">“{m.notes}”</p>
        </Section>
      )}

      <div className="mt-8 flex justify-center">
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-[14px] text-fg-3">Delete this match?</span>
            <button
              className="btn h-10 bg-bad px-4 text-[13px] text-ink-0"
              onClick={() => {
                deleteMatch(m.id)
                nav('/football')
              }}
            >
              Delete
            </button>
            <button className="btn-ghost h-10 px-4 text-[13px]" onClick={() => setConfirmDelete(false)}>
              Keep
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="link text-fg-4">
            <Trash2 size={14} strokeWidth={2} className="mr-1" /> Delete match
          </button>
        )}
      </div>
    </Screen>
  )
}

/** Under a kilometre in metres (to 10), over it in kilometres. */
const distance = (m: number) => (m < 995 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`)

/** Where the distance came from: one bar split by speed, sage getting stronger with it, and each part's distance under it. */
function Speeds({ bands }: { bands: Bands }) {
  const parts = [
    { key: 'Walk', m: bands.walk, color: 'rgb(var(--football) / 0.2)' },
    { key: 'Jog', m: bands.jog, color: 'rgb(var(--football) / 0.45)' },
    { key: 'Run', m: bands.run, color: 'rgb(var(--football) / 0.7)' },
    { key: 'Sprint', m: bands.sprint, color: 'rgb(var(--football))' },
  ]
  return (
    <div className="mt-1 flex flex-col gap-3 border-t border-ink-2 pt-3.5">
      <div className="flex h-3 gap-[3px]">
        {parts.map((p) => (p.m > 0 ? <span key={p.key} className="min-w-2 rounded-md" style={{ flex: p.m, background: p.color }} /> : null))}
      </div>
      <div className="grid grid-cols-4">
        {parts.map((p) => (
          <div key={p.key} className="flex min-w-0 flex-col gap-[3px]">
            <span className="label flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
              {p.key}
            </span>
            <span className="text-[14px] font-bold">{distance(p.m)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * The two halves side by side, the way a match's stats are shown on television: each half's number at its side,
 * and a bar under them split between the two. The bigger part is solid when it's clearly bigger (5% or more).
 */
function Halves({ halves: [a, b] }: { halves: [Half, Half] }) {
  const rows = [
    { key: 'Distance', unit: 'km', a: a.distanceM, b: b.distanceM, show: (m: number) => (m / 1000).toFixed(1) },
    { key: 'Metres a minute', a: a.mPerMin, b: b.mPerMin, show: (x: number) => String(Math.round(x)) },
    { key: 'High intensity', unit: 'm', a: a.hiDistM, b: b.hiDistM, show: (m: number) => String(Math.round(m / 10) * 10) },
    { key: 'Sprints', a: a.sprints, b: b.sprints, show: String },
    { key: 'Top speed', unit: 'km/h', a: a.topSpeedKmh, b: b.topSpeedKmh, show: (x: number) => x.toFixed(1) },
    a.avgHr && b.avgHr ? { key: 'Heart rate', unit: 'bpm', a: a.avgHr, b: b.avgHr, show: String } : null,
  ].filter((r) => r !== null)
  const side = (x: number, other: number) =>
    Math.max(x, other) < Math.min(x, other) * 1.05 ? 'rgb(var(--football) / 0.45)' : x > other ? 'rgb(var(--football))' : 'rgb(var(--football) / 0.2)'
  return (
    <Section title={`1st half · ${Math.round(a.minutes)}′`} action={<span className="t-section">{`2nd half · ${Math.round(b.minutes)}′`}</span>}>
      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <div key={r.key} className="flex flex-col gap-1.5">
            <div className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-2">
              <span className="num text-[20px] leading-none">{r.show(r.a)}</span>
              <span className="text-center text-[12.5px] font-semibold text-fg-3">
                {r.key}
                {r.unit && <span className="font-medium"> {r.unit}</span>}
              </span>
              <span className="num text-right text-[20px] leading-none">{r.show(r.b)}</span>
            </div>
            {r.a + r.b > 0 && (
              <div className="flex h-1.5 gap-[3px]">
                <span className="rounded-full" style={{ flex: r.a, background: side(r.a, r.b) }} />
                <span className="rounded-full" style={{ flex: r.b, background: side(r.b, r.a) }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  )
}

/** A side on the scoreboard: its initials in a circle (yours in sage) and its name. */
function Side({ name, ours }: { name: string; ours?: boolean }) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase()
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5">
      <span className={`grid h-[42px] w-[42px] place-items-center rounded-full text-[13px] font-extrabold ${ours ? 'bg-football-tint text-football' : 'bg-ink-2 text-fg-3'}`}>
        {initials}
      </span>
      <span className={`line-clamp-2 break-words text-center text-[13.5px] font-bold leading-[1.2] ${ours ? '' : 'text-fg-2'}`}>{name}</span>
    </div>
  )
}
