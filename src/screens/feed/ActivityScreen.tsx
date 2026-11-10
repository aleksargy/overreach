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
import { useStream, useWorld } from '../../data/world'
import { clock, dur, fmt, kmh, km, pace, swimPace } from '../../lib/format'
import { zoneBounds } from '../../lib/load'
import { mean } from '../../lib/math'
import { coursesOf } from '../../lib/ghost'
import { racesIn } from '../../lib/race'

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
      <h1 className="t-page mt-2">{a.name}</h1>

      {stream?.lat && (a.sport === 'run' || a.sport === 'ride') && (
        <div className="card mt-5 overflow-hidden">
          <RouteArt stream={stream} bounds={bounds} height={230} />
        </div>
      )}

      <HeadStats a={act} />

      {a.sport === 'football' && <FootballCta a={a} />}
      {a.sport === 'run' && racesIn(w.activities, w.profile.race).includes(a) && (
        <Link to={`/race/${a.id}`} className="btn-ghost mt-6 w-full">
          Open the race report
        </Link>
      )}
      {a.sport === 'run' && <Ghosts a={a} />}
      {a.garmin && <GarminSays g={a.garmin} />}

      <Section title="Zones" action={<span className="meta">Load {Math.round(a.load)}</span>}>
        <ZoneBar zones={a.zoneS} height={12} labels />
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
    <div className="mt-6 grid grid-cols-3 gap-x-3 gap-y-6">
      {items.map((it) => (
        <Stat key={it.label} label={it.label} value={it.value} unit={it.unit} />
      ))}
    </div>
  )
}

/** Earlier runs over the same roads, found from the outlines on the run summaries: the ghost screen races them where you both ran. */
function Ghosts({ a }: { a: Activity }) {
  const w = useWorld()
  const courses = useMemo(() => coursesOf(a, w.activities), [a, w])
  if (!courses.length) return null
  const n = new Set(courses.flatMap((c) => c.ghosts.map((g) => g.a.id))).size
  const whole = courses.filter((c) => c.to - c.from >= 0.9 * (a.distanceM ?? 0)).length
  const where = whole === courses.length ? 'on this route' : whole ? 'on all or part of this route' : 'on stretches of this route'
  return (
    <Link to={`/ghost/${a.id}`} className="press card mt-3 flex items-center gap-3 px-4 py-3.5">
      <span className="min-w-0 flex-1">
        <span className="t-name block">Race your ghosts</span>
        <span className="meta block">
          {n === 1 ? 'One earlier run' : `${n} earlier runs`} {where}
        </span>
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
    <div className="mt-6">
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
          <StreamChart values={s.hr} dt={s.dt} kind="hr" bounds={bounds} />
        </Section>
      )}
      {a.sport === 'run' && s.v && (
        <Section title="Pace" action={<span className="meta">Avg {pace(a.avgSpeed)} /km</span>}>
          <StreamChart values={smooth(s.v, 8).map((v) => (v > 1.2 ? 1000 / v : NaN))} dt={s.dt} kind="pace" format={(x) => pace(1000 / x)} />
        </Section>
      )}
      {a.sport === 'ride' && s.pwr && (
        <Section title="Power" action={<span className="meta">Avg {a.avgPower} W</span>}>
          <StreamChart values={smooth(s.pwr, 6)} dt={s.dt} kind="power" format={(x) => `${Math.round(x)}`} />
        </Section>
      )}
      {s.alt && (a.sport === 'run' || a.sport === 'ride') && (
        <Section title="Elevation" action={<span className="meta">+{a.elevGainM} m</span>}>
          <StreamChart values={s.alt} dt={s.dt} kind="alt" height={100} format={(x) => `${Math.round(x)} m`} />
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
      <div>
        <div className="grid grid-cols-[28px_1fr_64px_44px] gap-3 border-b border-fg/[0.13] pb-2 text-[12.5px] font-medium text-fg-4">
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
            <div key={i} className="grid grid-cols-[28px_1fr_64px_44px] items-center gap-3 border-b border-fg/[0.08] py-2 last:border-0">
              <span className="text-[14px] tabular-nums text-fg-3">{i + 1}</span>
              <span className="h-[9px]">
                <span className={`block h-full ${best ? 'solid' : 'hatch'}`} style={{ width: `${30 + t * 70}%` }} />
              </span>
              <span className={`num text-right text-[16.5px] ${best ? '' : 'text-fg-2'}`}>{l.distanceM < 950 ? pace(l.avgSpeed) + '*' : pace(l.avgSpeed)}</span>
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
      <Bars values={laps.map((l) => l.durationS)} height={110} highlight={laps.reduce((b, l, i) => (l.durationS < laps[b].durationS ? i : b), 0)} />
      <p className="meta mt-3">Seconds per {a.swim?.poolM} m length. The fastest is filled in.</p>
    </Section>
  )
}

/** Garmin's own training-effect bands */
const TE_BAND = ['No effect', 'Minor', 'Maintaining', 'Improving', 'Highly improving', 'Overreaching']
const FEEL = ['Very weak', 'Weak', 'Normal', 'Strong', 'Very strong']

/** What the watch made of the session, and what you told it afterwards. */
function GarminSays({ g }: { g: GarminView }) {
  const te = Math.max(g.aerobicTE ?? 0, g.anaerobicTE ?? 0)
  const items: { label: string; value: string; unit?: string; sub?: string }[] = []
  if (te > 0) items.push({ label: 'Training effect', value: te.toFixed(1), sub: TE_BAND[Math.min(5, Math.floor(te))] })
  if (g.rpe !== undefined) items.push({ label: 'Your effort', value: String(g.rpe), unit: '/10' })
  if (g.feel !== undefined && FEEL[Math.round(g.feel / 25)]) items.push({ label: 'You felt', value: FEEL[Math.round(g.feel / 25)] })
  if (!items.length) return null
  return (
    <Section title="From the watch">
      <div className="grid grid-cols-3 gap-x-3">
        {items.map((it) => (
          <Stat key={it.label} label={it.label} value={it.value} unit={it.unit} sub={it.sub} />
        ))}
      </div>
    </Section>
  )
}
