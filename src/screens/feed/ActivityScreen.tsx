import { Navigate, useNavigate, useParams } from 'react-router'
import { Bars, StreamChart } from '../../components/charts/charts'
import { RouteArt } from '../../components/charts/RouteArt'
import { ZoneBar } from '../../components/charts/primitives'
import { SportIcon, SPORT_LABEL } from '../../components/icons/SportIcon'
import { Screen } from '../../components/ui/Screen'
import { Empty, Section, Stat } from '../../components/ui/bits'
import type { Activity, Stream } from '../../data/types'
import { useUi } from '../../data/ui'
import { useStream, useWorld } from '../../data/world'
import { clock, dur, fmt, kmh, km, pace, swimPace } from '../../lib/format'
import { zoneBounds } from '../../lib/load'
import { mean } from '../../lib/math'

const KIND: Record<string, string> = { easy: 'Easy', tempo: 'Tempo', intervals: 'Intervals', long: 'Long', commute: 'Commute', endurance: 'Endurance', pool: 'Pool' }

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
    <Screen title={a.name} back>
      <div className="flex items-center gap-2 pt-1">
        <SportIcon sport={a.sport} size={16} className="text-fg-3" />
        <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-fg-3">
          {SPORT_LABEL[a.sport]}
          {a.kind && KIND[a.kind] ? ` · ${KIND[a.kind]}` : ''} · {fmt(a.start, 'EEE d MMM yyyy · HH:mm')}
        </span>
      </div>
      <h1 className="mt-2 font-display text-[46px] font-black uppercase leading-[0.88]">{a.name}</h1>

      {stream?.lat && (a.sport === 'run' || a.sport === 'ride') && (
        <div className="-mx-4 mt-4 border-y border-line bg-ink-1/60">
          <RouteArt stream={stream} bounds={bounds} height={250} />
        </div>
      )}

      <HeadStats a={act} />

      {a.sport === 'football' && <FootballCta a={a} />}

      <Section title="Zones" action={<span className="font-mono text-[10.5px] uppercase text-fg-3">load {Math.round(a.load)}</span>}>
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
      { label: 'Cadence', value: String(a.avgCadence ?? '–'), unit: 'spm' },
    )
  } else if (a.sport === 'ride') {
    items.push(
      { label: 'Distance', value: km(a.distanceM), unit: 'km' },
      { label: 'Time', value: clock(a.durationS) },
      { label: 'Speed', value: kmh(a.avgSpeed).toFixed(1), unit: 'km/h' },
    )
    items.push(
      { label: 'Power', value: String(a.avgPower ?? '–'), unit: 'W' },
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
    <div className="card mt-4 grid grid-cols-3 gap-y-4 p-4">
      {items.map((it) => (
        <Stat key={it.label} label={it.label} value={it.value} unit={it.unit} size="sm" />
      ))}
    </div>
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
            <span className="font-mono text-[10.5px] text-fg-3">
              avg {a.avgHr} · max {a.maxHr}
            </span>
          }
        >
          <div className="card p-4">
            <StreamChart values={s.hr} dt={s.dt} kind="hr" bounds={bounds} />
          </div>
        </Section>
      )}
      {a.sport === 'run' && s.v && (
        <Section title="Pace" action={<span className="font-mono text-[10.5px] text-fg-3">avg {pace(a.avgSpeed)} /km</span>}>
          <div className="card p-4">
            <StreamChart values={smooth(s.v, 8).map((v) => (v > 1.2 ? 1000 / v : NaN))} dt={s.dt} kind="pace" format={(x) => pace(1000 / x)} />
          </div>
        </Section>
      )}
      {a.sport === 'ride' && s.pwr && (
        <Section title="Power" action={<span className="font-mono text-[10.5px] text-fg-3">avg {a.avgPower} W</span>}>
          <div className="card p-4">
            <StreamChart values={smooth(s.pwr, 6)} dt={s.dt} kind="power" format={(x) => `${Math.round(x)}`} />
          </div>
        </Section>
      )}
      {s.alt && (a.sport === 'run' || a.sport === 'ride') && (
        <Section title="Elevation" action={<span className="font-mono text-[10.5px] text-fg-3">+{a.elevGainM} m</span>}>
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
        <div className="grid grid-cols-[36px_1fr_64px_48px] gap-2 border-b border-line px-4 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-4">
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
            <div key={i} className="grid grid-cols-[36px_1fr_64px_48px] items-center gap-2 border-b border-line px-4 py-2 last:border-0">
              <span className="num text-[17px] text-fg-3">{i + 1}</span>
              <span className="h-2 rounded-full bg-ink-3">
                <span className={`block h-full rounded-full ${best ? 'bg-fg' : 'bg-fg-4'}`} style={{ width: `${30 + t * 70}%` }} />
              </span>
              <span className={`num text-right text-[18px] ${best ? '' : 'text-fg-2'}`}>{l.distanceM < 950 ? pace(l.avgSpeed) + '*' : pace(l.avgSpeed)}</span>
              <span className="text-right font-mono text-[12px] text-fg-3">{l.avgHr}</span>
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
        <span className="font-mono text-[10.5px] text-fg-3">
          {a.swim?.poolM} m pool{a.swim?.stroke ? ` · ${a.swim.stroke}` : ''}
        </span>
      }
    >
      <div className="card p-4">
        <Bars values={laps.map((l) => l.durationS)} height={110} highlight={laps.reduce((b, l, i) => (l.durationS < laps[b].durationS ? i : b), 0)} />
        <p className="mt-2 text-[12px] text-fg-3">Seconds per {a.swim?.poolM} m length. Shorter is faster. Fastest length highlighted.</p>
      </div>
    </Section>
  )
}
