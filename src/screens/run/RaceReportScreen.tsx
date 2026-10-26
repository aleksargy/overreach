import { useMemo } from 'react'
import { useParams } from 'react-router'
import { StreamChart } from '../../components/charts/charts'
import { GapChart, gapLabel } from '../../components/charts/running'
import { Screen } from '../../components/ui/Screen'
import { Empty, Section, Stat } from '../../components/ui/bits'
import { useStream, useWorld } from '../../data/world'
import { clock, fmt, pace } from '../../lib/format'
import { zoneBounds } from '../../lib/load'
import { raceName, raceReport, type RaceReport } from '../../lib/race'

/** "3:30" for a goal of whole minutes over an hour */
const short = (s: number) => (s >= 3600 && s % 60 === 0 ? clock(s).slice(0, -3) : clock(s))

/** A race told like the back page: the result, how it was paced, the splits and what the heart did. */
export function RaceReportScreen() {
  const { id } = useParams()
  const w = useWorld()
  const a = id ? w.byId.get(id) : undefined
  const stream = useStream(a)
  const r = useMemo(() => (a && stream ? raceReport(a, stream, { race: w.profile.race, earlier: w.activities, name: w.profile.name }) : undefined), [a, stream, w])
  if (!a || (stream && !r)) {
    return (
      <Screen title="Race report" back>
        <Empty title="No report for this one">{a ? 'The recording is too short or has no distance to go on.' : 'This run isn’t in your data any more.'}</Empty>
      </Screen>
    )
  }
  if (!r) {
    return (
      <Screen title="Race report" back>
        <p className="meta pt-4">Loading the race…</p>
      </Screen>
    )
  }
  const D = r.race.distanceM
  const goal = r.race.goalS
  const under = goal !== undefined ? goal - r.timeS : undefined
  const splitM = r.splits[0]?.toM ?? 1000
  const goalPer = goal !== undefined ? goal / D : undefined
  const ahead = r.gap.reduce((b, g) => (g.s > b.s ? g : b), r.gap[0])
  const diff = r.halves[1] - r.halves[0]
  // 1 km splits are their own pace, so the time column only shows for 5 km ones
  const long = splitM > 1000
  // written out in full, so Tailwind sees every one
  const cols = long
    ? goalPer
      ? 'grid-cols-[44px_1fr_60px_60px_56px_40px]'
      : 'grid-cols-[44px_1fr_60px_60px_40px]'
    : goalPer
      ? 'grid-cols-[44px_1fr_60px_56px_40px]'
      : 'grid-cols-[44px_1fr_60px_40px]'
  return (
    <Screen title="Race report" back bare>
      <div className="pt-2">
        <div className="meta">
          {fmt(a.start, 'EEEE d MMMM yyyy')} · {raceName(D)}
        </div>
        <h1 className="mt-2 text-balance text-[28px] font-semibold leading-[1.12] tracking-[-0.03em]">{r.headline}</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-fg-2">{standfirst(r, a.run?.tempC)}</p>
      </div>

      <div className="card mt-7 p-4">
        <div className="label">Finish</div>
        <div className="num-hero -ml-0.5 mt-3 text-[64px]">{clock(r.timeS)}</div>
        {under !== undefined && (
          <div className={`mt-3 text-[15px] font-medium ${under >= 0 ? 'text-good' : 'text-warn'}`}>
            {under >= 0 ? `${clock(under)} inside your ${short(goal!)} goal` : `${clock(-under)} over your ${short(goal!)} goal`}
          </div>
        )}
        {r.bestS !== undefined && (
          <div className="meta mt-1">{r.timeS < r.bestS ? `A PB by ${clock(r.bestS - r.timeS)}` : `${clock(r.timeS - r.bestS)} off your best of ${clock(r.bestS)}`}</div>
        )}
        <div className="mt-5 grid grid-cols-3 gap-y-5 border-t border-line pt-4">
          <Stat label="Pace" value={pace(D / r.timeS)} unit="/km" size="sm" />
          <Stat label="Avg HR" value={String(a.avgHr ?? '–')} unit="bpm" size="sm" />
          <Stat label="2nd half" value={`${diff <= 0 ? '−' : '+'}${clock(Math.abs(diff))}`} size="sm" />
        </div>
      </div>

      <Section
        title={goal !== undefined ? 'Against the clock' : 'Pacing'}
        action={<span className="meta">{goal !== undefined ? `Ahead of ${pace(1 / goalPer!)} /km` : 'Against an even pace'}</span>}
      >
        <div className="card p-4">
          <GapChart lines={[{ pts: r.gap, color: 'rgb(var(--run))', width: 2 }]} height={160} />
          <p className="meta mt-3 leading-snug">
            {goal !== undefined
              ? `Above the line you were ahead of the ${short(goal)} pace. ${ahead.s > 5 ? `Most in hand: ${gapLabel(ahead.s)} at ${Math.round(ahead.m / 1000)} km. ` : ''}You finished ${gapLabel(goal - r.timeS)}.`
              : `Above the line you were ahead of an even ${pace(D / r.timeS)} a km, the pace that gives the same finish. ${ahead.s > 5 ? `You were ${gapLabel(ahead.s)} up at ${Math.round(ahead.m / 1000)} km.` : 'You never banked much time early.'}`}
          </p>
        </div>
      </Section>

      <Section title="Splits" action={<span className="meta">Every {splitM / 1000} km</span>}>
        <div className="card overflow-hidden">
          <div className={`grid ${cols} gap-2 border-b border-line px-4 py-2.5 text-[12px] font-medium text-fg-4`}>
            <span>Km</span>
            {long && <span className="text-right">Time</span>}
            <span className="text-right">Pace</span>
            {goalPer && <span className="text-right">Goal</span>}
            <span className="text-right">HR</span>
          </div>
          {r.splits.map((s, i) => {
            const len = s.toM - (i ? r.splits[i - 1].toM : 0)
            const vs = goalPer ? s.s - goalPer * len : undefined
            return (
              <div key={s.toM} className={`grid ${cols} items-baseline gap-2 border-b border-line px-4 py-2.5 last:border-0`}>
                <span className="text-[14px] tabular-nums text-fg-3">{+(s.toM / 1000).toFixed(1)}</span>
                {long && <span className="text-right text-[14px] tabular-nums text-fg-2">{clock(s.s)}</span>}
                <span className="text-right text-[15px] font-medium tabular-nums">{pace(len / s.s)}</span>
                {vs !== undefined && <span className={`text-right text-[13px] tabular-nums ${vs <= 0 ? 'text-good' : 'text-warn'}`}>{gapLabel(-vs)}</span>}
                <span className="text-right text-[14px] tabular-nums text-fg-3">{s.hr ?? ''}</span>
              </div>
            )
          })}
        </div>
      </Section>

      {stream?.hr && (
        <Section title="Heart rate">
          <div className="card p-4">
            {r.settledHr && r.finishHr && (
              <p className="mb-4 text-[15px] leading-snug text-fg-2">
                Settled at {r.settledHr} and finished at {r.finishHr}
                {r.driftM !== undefined ? `, creeping up from ${Math.round(r.driftM / 1000)} km.` : '.'}
              </p>
            )}
            <StreamChart values={stream.hr} dt={stream.dt} kind="hr" bounds={zoneBounds(w.profile)} height={150} />
          </div>
        </Section>
      )}
    </Screen>
  )
}

function standfirst(r: RaceReport, tempC?: number): string {
  const diff = r.halves[1] - r.halves[0]
  const parts = [
    `${clock(r.halves[0])} for the first half, ${clock(r.halves[1])} for the second: ${Math.abs(diff) < 5 ? 'dead even' : diff < 0 ? `a negative split by ${clock(-diff)}` : `${clock(diff)} slower coming home`}.`,
    r.fadeM !== undefined ? `The pace fell away from ${Math.round(r.fadeM / 1000)} km.` : '',
    tempC !== undefined ? `${Math.round(tempC)}°C at halfway.` : '',
  ]
  return parts.filter(Boolean).join(' ')
}
