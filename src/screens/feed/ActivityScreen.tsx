import { ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { Bars, StreamChart } from '../../components/charts/charts'
import { RouteArt } from '../../components/charts/RouteArt'
import { ZoneBar } from '../../components/charts/primitives'
import { SportIcon, SPORT_LABEL, sportColor } from '../../components/icons/SportIcon'
import { Screen } from '../../components/ui/Screen'
import { Empty, Section, Stat } from '../../components/ui/bits'
import type { Activity, GarminView, Stream } from '../../data/types'
import { useUi } from '../../data/ui'
import { useRunModel, useStream, useWorld } from '../../data/world'
import { clock, dur, fmt, kmh, km, pace, signed, swimPace } from '../../lib/format'
import { zoneBounds } from '../../lib/load'
import { mean } from '../../lib/math'
import { ghostsOf } from '../../lib/ghost'
import { racesIn } from '../../lib/race'
import { runInsight } from '../../lib/running'

const KIND: Record<string, string> = { easy: 'Easy', tempo: 'Tempo', intervals: 'Intervals', long: 'Long', race: 'Race', commute: 'Commute', endurance: 'Endurance', pool: 'Pool' }

export function ActivityScreen() {
  const { id } = useParams()
  const w = useWorld()
  const a = id ? w.byId.get(id) : undefined
  const stream = useStream(a)
  if (!a) {
    return (
      <Screen title="Activity" back>
        <Empty title="Not found">This activity isn't in your data any more.</Empty>
      </Screen>
    )
  }
  if (a.sport === 'strength' && a.workoutId) return <Navigate to={`/lift/history/${a.workoutId}`} replace />
  const bounds = zoneBounds(w.profile)
  // Garmin activities get their laps with the stream, and the climb from it when the summary had none
  const withLaps = a.laps || !stream?.laps ? a : { ...a, laps: stream.laps }
  const act = withLaps.elevGainM === undefined && stream?.alt ? { ...withLaps, elevGainM: climb(stream.alt) } : withLaps
  return (
    <Screen title={a.name} back bare>
      <div className="flex items-center gap-2 pt-2">
        <span style={{ color: sportColor(a.sport) }}>
          <SportIcon sport={a.sport} size={16} />
        </span>
        <span className="meta">
          {SPORT_LABEL[a.sport]}
          {a.kind && KIND[a.kind] ? `, ${KIND[a.kind].toLowerCase()}` : ''} · {fmt(a.start, 'EEE d MMM yyyy, HH:mm')}
        </span>
      </div>
      <h1 className="mt-2 text-[28px] font-semibold leading-[1.12] tracking-[-0.03em]">{a.name}</h1>

      {stream?.lat && (a.sport === 'run' || a.sport === 'ride') && (
        <div className="card mt-5 overflow-hidden">
          <RouteArt stream={stream} bounds={bounds} height={240} />
        </div>
      )}

      <HeadStats a={act} />

      {a.sport === 'football' && <FootballCta a={a} />}
      {a.sport === 'run' && racesIn(w.activities, w.profile.race).includes(a) && (
        <Link to={`/race/${a.id}`} className="btn-ghost mt-3 w-full">
          Open the race report
        </Link>
      )}
      {a.sport === 'run' && a.run && <RunAnalysis a={a} />}
      {a.sport === 'run' && <Ghosts a={a} />}
      {a.garmin && <GarminSays g={a.garmin} />}

      <Section title="Zones" action={<span className="meta">Load {Math.round(a.load)}</span>}>
        <div className="card p-4">
          <ZoneBar zones={a.zoneS} height={10} labels />
        </div>
      </Section>

      {stream && <Charts a={act} s={stream} bounds={bounds} />}

      {act.sport === 'run' && act.laps && act.laps.length > 1 && <Splits a={act} />}
      {act.sport === 'swim' && act.laps && <Lengths a={act} />}
    </Screen>
  )
}

function HeadStats({ a }: { a: Activity }) {
  const items: { label: string; value: string; unit?: string }[] = []
  if (a.sport === 'run') {
    items.push({ label: 'Distance', value: km(a.distanceM), unit: 'km' }, { label: 'Time', value: clock(a.durationS) }, { label: 'Pace', value: pace(a.avgSpeed), unit: '/km' })
    items.push(
      { label: 'Avg HR', value: String(a.avgHr ?? '–'), unit: 'bpm' },
      { label: 'Climb', value: String(a.elevGainM ?? 0), unit: 'm' },
      a.avgCadence ? { label: 'Cadence', value: String(a.avgCadence), unit: 'spm' } : { label: 'Max HR', value: String(a.maxHr ?? '–'), unit: 'bpm' },
    )
  } else if (a.sport === 'ride') {
    items.push(
      { label: 'Distance', value: km(a.distanceM), unit: 'km' },
      { label: 'Time', value: clock(a.durationS) },
      { label: 'Speed', value: kmh(a.avgSpeed).toFixed(1), unit: 'km/h' },
    )
    items.push(
      a.avgPower ? { label: 'Power', value: String(a.avgPower), unit: 'W' } : { label: 'Max HR', value: String(a.maxHr ?? '–'), unit: 'bpm' },
      { label: 'Climb', value: String(a.elevGainM ?? 0), unit: 'm' },
      { label: 'Avg HR', value: String(a.avgHr ?? '–'), unit: 'bpm' },
    )
  } else if (a.sport === 'swim') {
    items.push(
      { label: 'Distance', value: String(a.distanceM ?? 0), unit: 'm' },
      { label: 'Time', value: clock(a.durationS) },
      { label: 'Pace', value: swimPace(a.distanceM && a.laps ? a.distanceM / a.laps.reduce((s, l) => s + l.durationS, 0) : a.avgSpeed), unit: '/100m' },
    )
    items.push(
      { label: 'SWOLF', value: a.swim?.swolf ? String(a.swim.swolf) : '–' },
      { label: 'Lengths', value: String(a.swim?.lengths ?? '–') },
      { label: 'Avg HR', value: String(a.avgHr ?? '–'), unit: 'bpm' },
    )
  } else {
    items.push(
      { label: 'Time', value: dur(a.durationS) },
      a.distanceM || a.football ? { label: 'Distance', value: km(a.distanceM, 1), unit: 'km' } : { label: 'Max HR', value: String(a.maxHr ?? '–'), unit: 'bpm' },
      { label: 'Avg HR', value: String(a.avgHr ?? '–'), unit: 'bpm' },
    )
    if (a.football)
      items.push(
        { label: 'Sprints', value: String(a.football.sprints) },
        { label: 'Top speed', value: a.football.topSpeedKmh.toFixed(1), unit: 'km/h' },
        { label: 'Max HR', value: String(a.maxHr ?? '–'), unit: 'bpm' },
      )
  }
  return (
    <div className="card mt-3 grid grid-cols-3 gap-y-5 p-4">
      {items.map((it) => (
        <Stat key={it.label} label={it.label} value={it.value} unit={it.unit} size="sm" />
      ))}
    </div>
  )
}

/** This run against your running model: engine on the day, the conditions, football legs and drift. */
function RunAnalysis({ a }: { a: Activity }) {
  const w = useWorld()
  const m = useRunModel(w)
  if (!m) return null
  const x = runInsight(m, a)
  const rows: { k: string; v: string; sub?: string }[] = []
  if (x.engine) {
    const diff = x.vsTrend === undefined ? undefined : Math.round(x.vsTrend)
    rows.push({
      k: 'Engine',
      v: `${pace(x.engine)} /km at ${m.refHr} bpm`,
      sub: diff === undefined ? undefined : diff === 0 ? 'Right on your trend' : `${Math.abs(diff)} s/km ${diff < 0 ? 'better' : 'worse'} than your trend`,
    })
  }
  if (x.tempC !== undefined) rows.push({ k: 'Weather', v: `${Math.round(x.tempC)}°C${x.dewC !== undefined ? `, dew point ${Math.round(x.dewC)}°C` : ''}` })
  if (x.afterFootballH !== undefined && x.afterFootballH < 72)
    rows.push({ k: 'Legs', v: `${x.afterFootballH < 36 ? `${x.afterFootballH} hours` : `${Math.round(x.afterFootballH / 24)} days`} after football` })
  if (x.drift) rows.push({ k: 'Drift', v: x.drift.onset === undefined ? `None in ${x.drift.minutes} min` : `After ${x.drift.onset} min` })
  if (!rows.length) return null
  return (
    <Section title="Analysis">
      <div className="card list overflow-hidden">
        {rows.map((r) => (
          <div key={r.k} className="flex items-baseline justify-between gap-4 px-4 py-3">
            <span className="text-[15px] text-fg-2">{r.k}</span>
            <span className="text-right">
              <span className="block text-[15px] font-medium tabular-nums">{r.v}</span>
              {r.sub && <span className="meta block">{r.sub}</span>}
            </span>
          </div>
        ))}
      </div>
    </Section>
  )
}

/** Earlier runs on the same route the same way round, found from the outlines on the run summaries. */
function Ghosts({ a }: { a: Activity }) {
  const w = useWorld()
  const n = useMemo(() => ghostsOf(a, w.activities).length, [a, w])
  if (!n) return null
  return (
    <Link to={`/ghost/${a.id}`} className="press card mt-3 flex items-center gap-3 px-4 py-3.5">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium leading-5">Race your ghosts</span>
        <span className="meta block">{n === 1 ? 'One earlier run' : `${n} earlier runs`} on this route</span>
      </span>
      <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-fg-4" />
    </Link>
  )
}

function FootballCta({ a }: { a: Activity }) {
  const open = useUi((s) => s.open)
  const w = useWorld()
  const nav = useNavigate()
  const m = w.matchByActivity.get(a.id)
  return (
    <div className="mt-3">
      {m ? (
        <button className="btn-ghost w-full" onClick={() => nav(`/match/${m.id}`)}>
          Open the match report
        </button>
      ) : (
        <button className="btn-primary w-full" onClick={() => open({ type: 'logMatch', activityId: a.id })}>
          Rate this match
        </button>
      )}
    </div>
  )
}

function Charts({ a, s, bounds }: { a: Activity; s: Stream; bounds: number[] }) {
  return (
    <>
      {s.hr && (
        <Section
          title="Heart rate"
          action={
            <span className="meta">
              Avg {a.avgHr} · max {a.maxHr}
            </span>
          }
        >
          <div className="card p-4">
            <StreamChart values={s.hr} dt={s.dt} kind="hr" bounds={bounds} />
          </div>
        </Section>
      )}
      {a.sport === 'run' && s.v && (
        <Section title="Pace" action={<span className="meta">Avg {pace(a.avgSpeed)} /km</span>}>
          <div className="card p-4">
            <StreamChart values={smooth(s.v, 8).map((v) => (v > 1.2 ? 1000 / v : NaN))} dt={s.dt} kind="pace" format={(x) => pace(1000 / x)} />
          </div>
        </Section>
      )}
      {a.sport === 'ride' && s.pwr && (
        <Section title="Power" action={<span className="meta">Avg {a.avgPower} W</span>}>
          <div className="card p-4">
            <StreamChart values={smooth(s.pwr, 6)} dt={s.dt} kind="power" format={(x) => `${Math.round(x)}`} />
          </div>
        </Section>
      )}
      {s.alt && (a.sport === 'run' || a.sport === 'ride') && (
        <Section title="Elevation" action={<span className="meta">+{a.elevGainM} m</span>}>
          <div className="card p-4">
            <StreamChart values={s.alt} dt={s.dt} kind="alt" height={100} format={(x) => `${Math.round(x)} m`} />
          </div>
        </Section>
      )}
    </>
  )
}

/** Metres climbed, ignoring wobbles under 2 m so barometer noise doesn't add up. */
function climb(alt: number[]): number {
  let gain = 0
  let low = alt[0] ?? 0
  for (const x of alt) {
    if (x < low) low = x
    else if (x - low >= 2) {
      gain += x - low
      low = x
    }
  }
  return Math.round(gain)
}

function smooth(xs: number[], k: number) {
  return xs.map((_, i) => mean(xs.slice(Math.max(0, i - k), i + 1)))
}

function Splits({ a }: { a: Activity }) {
  const laps = a.laps!
  const paces = laps.map((l) => (l.avgSpeed ? 1000 / l.avgSpeed : 0))
  const fastest = Math.min(...paces)
  const slowest = Math.max(...paces)
  return (
    <Section title="Splits">
      <div className="card overflow-hidden">
        <div className="grid grid-cols-[32px_1fr_60px_44px] gap-3 border-b border-line px-4 py-2.5 text-[12px] font-medium text-fg-4">
          <span>Km</span>
          <span />
          <span className="text-right">Pace</span>
          <span className="text-right">HR</span>
        </div>
        {laps.map((l, i) => {
          const p = paces[i]
          const t = slowest === fastest ? 1 : 1 - (p - fastest) / (slowest - fastest)
          const best = p === fastest
          return (
            <div key={i} className="grid grid-cols-[32px_1fr_60px_44px] items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
              <span className="text-[14px] tabular-nums text-fg-3">{i + 1}</span>
              <span className="h-1.5 rounded-full bg-ink-3">
                <span className={`block h-full rounded-full ${best ? 'bg-fg' : 'bg-fg-4'}`} style={{ width: `${30 + t * 70}%` }} />
              </span>
              <span className={`text-right text-[15px] font-medium tabular-nums ${best ? '' : 'text-fg-2'}`}>{l.distanceM < 950 ? pace(l.avgSpeed) + '*' : pace(l.avgSpeed)}</span>
              <span className="text-right text-[14px] tabular-nums text-fg-3">{l.avgHr}</span>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

function Lengths({ a }: { a: Activity }) {
  const laps = a.laps!
  return (
    <Section
      title="Lengths"
      action={
        <span className="meta">
          {a.swim?.poolM} m pool{a.swim?.stroke ? ` · ${a.swim.stroke}` : ''}
        </span>
      }
    >
      <div className="card p-4">
        <Bars values={laps.map((l) => l.durationS)} height={110} highlight={laps.reduce((b, l, i) => (l.durationS < laps[b].durationS ? i : b), 0)} />
        <p className="mt-3 text-[12px] text-fg-4">Seconds per {a.swim?.poolM} m length. Shorter is faster. Fastest length highlighted.</p>
      </div>
    </Section>
  )
}

/** Garmin's own training-effect bands */
const TE_BAND = ['No effect', 'Minor', 'Maintaining', 'Improving', 'Highly improving', 'Overreaching']
const FEEL = ['Very weak', 'Weak', 'Normal', 'Strong', 'Very strong']

/** What the watch made of the session, and what you told it afterwards. */
function GarminSays({ g }: { g: GarminView }) {
  const items = [
    g.aerobicTE !== undefined && { label: 'Aerobic effect', value: g.aerobicTE.toFixed(1) },
    g.anaerobicTE !== undefined && { label: 'Anaerobic effect', value: g.anaerobicTE.toFixed(1) },
    g.load !== undefined && { label: 'Training load', value: String(g.load) },
    g.rpe !== undefined && { label: 'Your effort', value: String(g.rpe), unit: '/10' },
    g.feel !== undefined && { label: 'You felt', value: FEEL[Math.round(g.feel / 25)] ?? '' },
    g.bodyBattery !== undefined && { label: 'Body Battery', value: signed(g.bodyBattery, 0) },
  ].filter((x): x is { label: string; value: string; unit?: string } => !!x && x.value !== '')
  if (!items.length) return null
  const te = Math.max(g.aerobicTE ?? 0, g.anaerobicTE ?? 0)
  return (
    <Section title="Garmin’s view" action={g.aerobicTE !== undefined ? <span className="meta">{TE_BAND[Math.min(5, Math.floor(te))]}</span> : undefined}>
      <div className="card grid grid-cols-3 gap-y-5 p-4">
        {items.map((it) => (
          <Stat key={it.label} label={it.label} value={it.value} unit={it.unit} size="sm" />
        ))}
      </div>
    </Section>
  )
}
