import { useMemo } from 'react'
import { useParams } from 'react-router'
import { StreamChart } from '../../components/charts/charts'
import { GapChart, gapLabel } from '../../components/charts/running'
import { Screen } from '../../components/ui/Screen'
import { Empty, Section } from '../../components/ui/bits'
import { useStream, useWorld } from '../../data/world'
import { clock, fmt, pace } from '../../lib/format'
import { zoneBounds } from '../../lib/load'
import { raceName, raceReport } from '../../lib/race'

/** "3:30" for a goal of whole minutes over an hour */
const short = (s: number) => (s >= 3600 && s % 60 === 0 ? clock(s).slice(0, -3) : clock(s))

/** A race: the finish against your goal and your best, how it was paced, the splits and your heart rate. */
export function RaceReportScreen() {
  const { id } = useParams()
  const w = useWorld()
  const a = id ? w.byId.get(id) : undefined
  const stream = useStream(a)
  const r = useMemo(() => (a && stream ? raceReport(a, stream, { race: w.profile.race, earlier: w.activities }) : undefined), [a, stream, w])
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
  const verdicts = [
    under !== undefined && {
      text: under >= 0 ? `${clock(under)} inside your ${short(goal!)} goal` : `${clock(-under)} over your ${short(goal!)} goal`,
      p: under >= 0 ? '--good' : '--bad',
    },
    r.bestS !== undefined && {
      text: r.timeS < r.bestS ? `A best by ${clock(r.bestS - r.timeS)}` : `${clock(r.timeS - r.bestS)} off your best`,
      p: r.timeS < r.bestS ? '--football' : '--run-label',
    },
  ].filter((x): x is { text: string; p: string } => !!x)
  const stats = [
    { k: 'Pace', v: pace(D / r.timeS), u: '/km' },
    a.avgHr ? { k: 'Avg HR', v: String(a.avgHr), u: 'bpm' } : undefined,
    { k: '2nd half', v: `${diff <= 0 ? '−' : '+'}${clock(Math.abs(diff))}`, u: '' },
    a.run?.tempC !== undefined ? { k: 'Halfway', v: String(Math.round(a.run.tempC)), u: '°C' } : undefined,
  ].filter((x): x is { k: string; v: string; u: string } => !!x)
  return (
    <Screen title="Race report" back bare>
      <div className="label">
        {fmt(a.start, 'EEEE d MMM yyyy')} · {raceName(D)}
      </div>
      <h1 className="t-page mt-0.5">{a.name}</h1>

      <section className="hero mt-4 flex flex-col gap-2.5 bg-run-tint">
        <h2 className="text-[13px] font-bold text-run-label">Finish</h2>
        <span className="num-hero text-[64px] text-run-head">{clock(r.timeS)}</span>
        {verdicts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {verdicts.map((x) => (
              <span key={x.text} className="pill" style={{ ['--p' as string]: `var(${x.p})` }}>
                {x.text}
              </span>
            ))}
          </div>
        )}
        <div className={`mt-1 grid gap-2 border-t border-run/[0.14] pt-3 ${stats.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
          {stats.map((x) => (
            <div key={x.k} className="flex min-w-0 flex-col gap-0.5">
              <span className="num whitespace-nowrap text-[20px] leading-[1.2] text-run-head">
                {x.v}
                {x.u && <span className="ml-0.5 font-sans text-[12px] font-semibold tracking-normal text-run-label">{x.u}</span>}
              </span>
              <span className="truncate text-[12px] font-semibold text-run-label">{x.k}</span>
            </div>
          ))}
        </div>
      </section>

      <Section
        title={goal !== undefined ? 'Against the clock' : 'Pacing'}
        action={<span className="label">{goal !== undefined ? `Goal pace ${pace(1 / goalPer!)} /km` : `Even pace ${pace(D / r.timeS)} /km`}</span>}
      >
        <GapChart lines={[{ pts: r.gap, color: 'rgb(var(--run))', width: 2.5 }]} height={160} />
      </Section>

      <Section title="Splits" action={<span className="label">Every {splitM / 1000} km</span>}>
        <div className={`grid ${cols} gap-2 pb-2 text-[12px] font-semibold text-fg-3`}>
          <span>Km</span>
          {long && <span className="text-right">Time</span>}
          <span className="text-right">Pace</span>
          {goalPer && <span className="text-right">Goal</span>}
          <span className="text-right">HR</span>
        </div>
        <div className="list">
          {r.splits.map((s, i) => {
            const len = s.toM - (i ? r.splits[i - 1].toM : 0)
            const vs = goalPer ? s.s - goalPer * len : undefined
            return (
              <div key={s.toM} className={`grid ${cols} items-baseline gap-2 py-2`}>
                <span className="text-[14px] tabular-nums text-fg-3">{+(s.toM / 1000).toFixed(1)}</span>
                {long && <span className="text-right text-[14px] tabular-nums text-fg-2">{clock(s.s)}</span>}
                <span className="num text-right text-[16px] tabular-nums">{pace(len / s.s)}</span>
                {vs !== undefined && <span className={`text-right text-[13px] font-bold tabular-nums ${vs <= 0 ? 'text-good' : 'text-bad'}`}>{gapLabel(-vs)}</span>}
                <span className="text-right text-[14px] tabular-nums text-fg-3">{s.hr ?? ''}</span>
              </div>
            )
          })}
        </div>
      </Section>

      {stream?.hr && (
        <Section
          title="Heart rate"
          action={
            r.settledHr && r.finishHr ? (
              <span className="label">
                Settled {r.settledHr} · finished {r.finishHr}
              </span>
            ) : undefined
          }
        >
          <StreamChart values={stream.hr} dt={stream.dt} kind="hr" bounds={zoneBounds(w.profile)} height={150} />
        </Section>
      )}
    </Screen>
  )
}
