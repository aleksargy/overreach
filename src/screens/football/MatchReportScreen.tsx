import { FlipHorizontal2, Pencil, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { RatingBadge } from '../../components/ActivityRow'
import { Bars, StreamChart } from '../../components/charts/charts'
import { PitchHeatmap } from '../../components/charts/PitchHeatmap'
import { zoneColor } from '../../components/charts/primitives'
import { IconButton, Screen } from '../../components/ui/Screen'
import { Delta, Empty, Section, Segmented } from '../../components/ui/bits'
import { useStore } from '../../data/store'
import { useUi } from '../../data/ui'
import { useFootballAnalysis, useStream, useWorld } from '../../data/world'
import { fmt, signed } from '../../lib/format'
import { FEEL, baselineFor, ordinal, ratingTone, result, standfirst } from '../../lib/football'
import { zoneBounds, zoneOf } from '../../lib/load'
import { median } from '../../lib/math'
import { rowsFor } from './season'

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

  const base = useMemo(() => (m ? baselineFor(m.format, rowsFor(w, w.matches.filter((x) => x.id !== m.id))) : null), [m, w])
  const seasonMedian = useMemo(() => {
    if (!m) return null
    const others = rowsFor(w, w.matches.filter((x) => x.id !== m.id && x.format === m.format)).filter((r) => r.analysis)
    if (!others.length) return null
    return {
      dist: median(others.map((r) => r.analysis!.distanceM)),
      sprints: median(others.map((r) => r.analysis!.sprints)),
      top: median(others.map((r) => r.analysis!.topSpeedKmh)),
      rating: median(w.matches.filter((x) => x.id !== m.id).map((x) => x.rating)),
    }
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
  const fadeBucket = an?.fadeMinute !== undefined ? Math.floor(an.fadeMinute / 5) : undefined

  return (
    <Screen
      title="Match report"
      back
      actions={
        <IconButton label="Edit match" onClick={() => open({ type: 'logMatch', matchId: m.id })}>
          <Pencil size={16} />
        </IconButton>
      }
    >
      <div className="pt-2">
        <div className="flex items-center gap-2">
          <span className="bg-bad px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-0">Match report</span>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-fg-3">
            {fmt(m.date, 'EEE d MMM yyyy · HH:mm')} · {m.format}-a-side
          </span>
        </div>
        <h1 className="mt-3 text-balance font-display text-[44px] font-black uppercase leading-[0.9]">{m.headline}</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-fg-2">{standfirst(m, an ?? act?.football)}</p>
      </div>

      {/* scoreboard */}
      <div className="mt-6 overflow-hidden rounded-card border border-line bg-ink-1">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-5">
          <div className="min-w-0 text-left">
            <div className="line-clamp-2 break-words font-display text-[19px] font-extrabold uppercase leading-[0.95]">{m.team}</div>
            <div className="mt-1 font-mono text-[10px] uppercase text-fg-3">You</div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="num grid h-[68px] min-w-[52px] place-items-center rounded-[6px] bg-ink-0 px-1 text-[56px]">{m.scoreFor}</span>
            <span className="num text-[24px] text-fg-4">:</span>
            <span className="num grid h-[68px] min-w-[52px] place-items-center rounded-[6px] bg-ink-0 px-1 text-[56px] text-fg-2">{m.scoreAgainst}</span>
          </div>
          <div className="min-w-0 text-right">
            <div className="line-clamp-2 break-words font-display text-[19px] font-extrabold uppercase leading-[0.95] text-fg-2">{m.opponent}</div>
            <div className={`mt-1 font-mono text-[10px] font-semibold uppercase ${r === 'W' ? 'text-z2' : r === 'L' ? 'text-z5' : 'text-fg-3'}`}>
              {r === 'W' ? 'Win' : r === 'L' ? 'Defeat' : 'Draw'}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 border-t border-line">
          {[
            { k: 'Goals', v: m.goals },
            { k: 'Assists', v: m.assists },
            { k: 'Felt', v: FEEL[m.feel] },
          ].map((x, i) => (
            <div key={x.k} className={`px-4 py-3 ${i ? 'border-l border-line' : ''}`}>
              <div className="label">{x.k}</div>
              <div className={`mt-1 ${typeof x.v === 'number' ? 'num text-[28px]' : 'font-display text-[19px] font-extrabold uppercase leading-tight'}`}>{x.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* rating */}
      <Section title="Rating">
        <div className="card p-4">
          <div className="flex items-center gap-4">
            <RatingBadge rating={m.rating} size="lg" />
            <div>
              <div className={`font-display text-[28px] font-black uppercase leading-none ${tone.text}`}>{tone.word}</div>
              {seasonMedian && (
                <div className="mt-1 font-mono text-[11px] text-fg-3">
                  Season median {seasonMedian.rating.toFixed(1)} · <Delta value={m.rating - seasonMedian.rating} />
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-col">
            <div className="flex justify-between border-b border-line py-2 text-[14px] text-fg-3">
              <span>Starting point</span>
              <span className="font-mono">6.00</span>
            </div>
            {m.breakdown.map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0">
                <span className="text-[14px] text-fg-2">{f.label}</span>
                <span className="flex items-center gap-2">
                  <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-ink-3">
                    <span
                      className={`absolute top-0 h-full ${f.value >= 0 ? 'left-1/2 bg-good' : 'right-1/2 bg-bad'}`}
                      style={{ width: `${Math.min(50, Math.abs(f.value) * 30)}%` }}
                    />
                  </span>
                  <span className={`w-12 text-right font-mono text-[13px] font-semibold ${f.value > 0 ? 'text-good' : f.value < 0 ? 'text-bad' : 'text-fg-3'}`}>{signed(f.value, 2)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {act && an ? (
        <>
          <Section
            title="Heatmap"
            action={
              <button
                onClick={() => saveMatch({ ...m, flip: !m.flip })}
                className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-fg-3"
              >
                <FlipHorizontal2 size={14} /> Flip
              </button>
            }
          >
            <PitchHeatmap points={heat} format={m.format} flip={m.flip} />
            <div className="mt-2">
              <Segmented size="sm" value={half} onChange={setHalf} options={[{ value: 'all', label: 'Full game' }, { value: '1', label: '1st half' }, { value: '2', label: '2nd half' }]} />
            </div>
            <p className="mt-2 text-[12px] text-fg-4">Pitch framed from your GPS. Tap flip if you were attacking the other way.</p>
          </Section>

          <Section title="Engine">
            <div className="grid grid-cols-3 gap-2">
              <PhysStat label="Distance" value={(an.distanceM / 1000).toFixed(2)} unit="km" delta={seasonMedian ? (an.distanceM - seasonMedian.dist) / 1000 : undefined} dp={2} />
              <PhysStat label="Sprints" value={String(an.sprints)} delta={seasonMedian ? an.sprints - seasonMedian.sprints : undefined} dp={0} />
              <PhysStat label="Top speed" value={an.topSpeedKmh.toFixed(1)} unit="km/h" delta={seasonMedian ? an.topSpeedKmh - seasonMedian.top : undefined} />
              <PhysStat label="Work rate" value={String(Math.round(an.mPerMin))} unit="m/min" delta={base ? an.mPerMin - base.mPerMin : undefined} dp={0} />
              <PhysStat label="High speed" value={String(Math.round(an.hiDistM))} unit="m" />
              <PhysStat label="Avg HR" value={String(an.avgHr ?? '–')} unit="bpm" />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="card p-3">
                <div className="label">Sprints by half</div>
                <div className="num mt-1 text-[26px]">
                  {an.sprintsByHalf[0]} <span className="text-fg-4">/</span> {an.sprintsByHalf[1]}
                </div>
              </div>
              <div className="card p-3">
                <div className="label">Legs went</div>
                <div className={`num mt-1 text-[26px] ${an.fadeMinute !== undefined ? 'text-bad' : 'text-good'}`}>{an.fadeMinute !== undefined ? `${ordinal(an.fadeMinute)} min` : 'Never'}</div>
              </div>
            </div>
          </Section>

          <Section title="Intensity" action={<span className="font-mono text-[10.5px] uppercase text-fg-3">metres per 5 min</span>}>
            <div className="card p-4">
              <Bars
                values={an.buckets.map((b) => Math.round(b.distM))}
                labels={an.buckets.map((b, i) => (i % 2 === 0 ? `${b.startMin}′` : null))}
                colors={an.buckets.map((b) => (b.avgHr ? zoneColor(zoneOf(b.avgHr, bounds)) : 'rgb(var(--fg-4))'))}
                marker={fadeBucket !== undefined ? { index: fadeBucket, label: `Fade ${an.fadeMinute}′` } : undefined}
                height={140}
                valueLabels
              />
              <p className="mt-3 text-[12px] text-fg-3">Bar colour is your average heart-rate zone in that block.</p>
            </div>
          </Section>

          {stream?.hr && (
            <Section title="Heart rate">
              <div className="card p-4">
                <StreamChart values={stream.hr} dt={stream.dt} kind="hr" bounds={bounds} height={150} />
              </div>
            </Section>
          )}
        </>
      ) : (
        <Section title="Engine">
          <Empty title="No watch data">This match isn't linked to a recording, so there's no heatmap or work rate. Edit the match to link one.</Empty>
        </Section>
      )}

      {m.notes && (
        <Section title="Your notes">
          <blockquote className="border-l-2 border-fg-4 pl-4 font-display text-[24px] font-bold uppercase leading-tight text-fg-2">“{m.notes}”</blockquote>
        </Section>
      )}

      <div className="mt-10 flex justify-center">
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-[14px] text-fg-3">Delete this match?</span>
            <button
              className="btn h-10 bg-bad px-4 text-ink-0"
              onClick={() => {
                deleteMatch(m.id)
                nav('/football')
              }}
            >
              Delete
            </button>
            <button className="btn-ghost h-10 px-4" onClick={() => setConfirmDelete(false)}>
              Keep
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-fg-4">
            <Trash2 size={14} /> Delete match
          </button>
        )}
      </div>
    </Screen>
  )
}

function PhysStat({ label, value, unit, delta, dp = 1 }: { label: string; value: string; unit?: string; delta?: number; dp?: number }) {
  return (
    <div className="card min-w-0 p-3">
      <div className="label truncate">{label}</div>
      <div className="num mt-1 text-[26px]">
        {value}
        {unit && <span className="ml-0.5 font-sans text-[10px] font-medium text-fg-3">{unit}</span>}
      </div>
      {delta !== undefined && (
        <div className="mt-0.5">
          <Delta value={delta} dp={dp} />
        </div>
      )}
    </div>
  )
}
