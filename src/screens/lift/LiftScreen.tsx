import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { Play, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { IconButton, Screen } from '../../components/ui/Screen'
import { SampleBadge, Section, Segmented, inputCls } from '../../components/ui/bits'
import { MUSCLES } from '../../data/exercises'
import { useStore } from '../../data/store'
import type { Muscle, Routine } from '../../data/types'
import { useUi } from '../../data/ui'
import { useWorld, type World } from '../../data/world'
import { bestE1rm, fmtKg, hasE1rm, historyFor, prsFor, suggest, volume, workingSets } from '../../lib/lift'
import { planNext, setsByMuscle } from '../../lib/plan'
import { toneFor } from '../../lib/readiness'
import { EQUIPMENT_LABEL, MUSCLE_LABEL, SuggestionTag, WorkoutRow, targetText, tonnes } from './parts'

type Tab = 'train' | 'history' | 'exercises'

export function LiftScreen() {
  const w = useWorld()
  const open = useUi((s) => s.open)
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab | null) ?? 'train'
  const month = w.workouts.filter((x) => differenceInCalendarDays(w.now, parseISO(x.start)) < 28)
  return (
    <Screen
      title="Lift"
      kicker={
        <span className="flex items-center gap-2">
          {w.workouts.length ? `${month.length} ${month.length === 1 ? 'session' : 'sessions'} in 4 weeks` : 'Log your first session'} {w.mode === 'sample' && <SampleBadge />}
        </span>
      }
      actions={
        <IconButton label="New exercise" onClick={() => open({ type: 'exercise' })}>
          <Plus size={18} />
        </IconButton>
      }
    >
      <Segmented
        value={tab}
        onChange={(t) => setParams(t === 'train' ? {} : { tab: t }, { replace: true })}
        options={[
          { value: 'train', label: 'Train' },
          { value: 'history', label: 'History' },
          { value: 'exercises', label: 'Exercises' },
        ]}
      />
      {tab === 'train' && <Train w={w} />}
      {tab === 'history' && <History w={w} />}
      {tab === 'exercises' && <Library w={w} />}
    </Screen>
  )
}

function useBegin() {
  const active = useStore((s) => s.active)
  const start = useStore((s) => s.startWorkout)
  const setOpen = useUi((s) => s.setWorkoutOpen)
  return (r?: Routine) => {
    if (!active) start(r)
    setOpen(true)
  }
}

function Train({ w }: { w: World }) {
  const active = useStore((s) => s.active)
  const begin = useBegin()
  const plan = useMemo(
    () =>
      planNext({
        now: w.now,
        routines: w.routines,
        workouts: w.workouts,
        exercises: w.exerciseById,
        activities: w.activities,
        nextFootball: w.nextFootball,
        readiness: w.readiness?.score,
      }),
    [w],
  )
  const month = w.workouts.filter((x) => differenceInCalendarDays(w.now, parseISO(x.start)) < 28)
  const monthPrs = useMemo(() => month.reduce((a, x) => a + prsFor(x, w.workouts, w.exerciseById).length, 0), [month, w])

  return (
    <>
      {active ? <ActiveCard /> : plan && <UpNext w={w} routine={plan.routine} reasons={plan.reasons} onStart={() => begin(plan.routine)} />}

      <Section title="Routines">
        <div className="flex flex-col gap-2">
          {plan?.statuses.map((st) => (
            <div key={st.routine.id} className="card flex items-center gap-3 p-3.5">
              <span className="min-w-0 flex-1">
                <span className="block font-display text-[22px] font-extrabold uppercase leading-none">{st.routine.name}</span>
                <span className="mt-1 block truncate text-[13px] text-fg-3">{st.routine.focus}</span>
                <span className="mt-1.5 block font-mono text-[10.5px] uppercase tracking-[0.04em] text-fg-3">
                  {st.routine.items.length} exercises · {st.sets} sets ·{' '}
                  {st.daysSince === undefined ? 'not done yet' : st.daysSince === 0 ? 'done today' : st.daysSince === 1 ? 'yesterday' : `${st.daysSince} days ago`}
                </span>
              </span>
              <button
                onClick={() => begin(st.routine)}
                className="press grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line-2 bg-ink-2 text-fg"
                aria-label={`Start ${st.routine.name}`}
              >
                <Play size={16} fill="currentColor" />
              </button>
            </div>
          ))}
          <button
            onClick={() => begin()}
            className="press flex h-14 items-center justify-center gap-2 rounded-card border border-dashed border-line-2 text-[14px] font-semibold text-fg-2"
          >
            <Plus size={16} /> Empty workout
          </button>
        </div>
      </Section>

      <MuscleSets w={w} />

      <Section title="Last 4 weeks">
        <div className="card grid grid-cols-4 divide-x divide-line">
          {[
            { label: 'Sessions', value: String(month.length) },
            { label: 'Sets', value: String(month.reduce((a, x) => a + workingSets(x), 0)) },
            { label: 'Volume', value: tonnes(month.reduce((a, x) => a + volume(x), 0)).replace(' ', '') },
            { label: 'PRs', value: String(monthPrs) },
          ].map((s) => (
            <div key={s.label} className="px-3 py-3.5">
              <div className="label mb-1.5">{s.label}</div>
              <div className="num text-[26px]">{s.value}</div>
            </div>
          ))}
        </div>
      </Section>
    </>
  )
}

function ActiveCard() {
  const active = useStore((s) => s.active)!
  const setOpen = useUi((s) => s.setWorkoutOpen)
  const done = active.exercises.reduce((a, we) => a + we.sets.filter((s) => s.done).length, 0)
  const total = active.exercises.reduce((a, we) => a + we.sets.length, 0)
  return (
    <button onClick={() => setOpen(true)} className="press chamfer relative mt-4 block w-full overflow-hidden rounded-card border border-line bg-ink-1 p-4 text-left">
      <div className="spectrum absolute inset-x-0 top-0 h-[2px]" />
      <span className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-z5 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-z5" />
        </span>
        <span className="label text-fg-2">In progress</span>
      </span>
      <span className="mt-2 block font-display text-[40px] font-black uppercase leading-[0.86]">{active.name}</span>
      <span className="mt-2 block font-mono text-[11px] uppercase text-fg-3">
        {done} of {total} sets done · started {format(parseISO(active.start), 'HH:mm')}
      </span>
      <span className="btn-primary mt-4 w-full">Resume</span>
    </button>
  )
}

function UpNext({ w, routine, reasons, onStart }: { w: World; routine: Routine; reasons: string[]; onStart: () => void }) {
  const r = w.readiness
  const tone = r ? toneFor(r.score).tone : null
  const toneCls = tone === 'good' ? 'text-z2' : tone === 'ok' ? 'text-z3' : tone === 'warn' ? 'text-z4' : 'text-z5'
  return (
    <section className="chamfer relative mt-4 overflow-hidden rounded-card border border-line bg-ink-1">
      <div className="spectrum absolute inset-x-0 top-0 h-[2px] opacity-80" />
      <div className="p-4">
        <div className="flex items-center justify-between">
          <span className="label">Up next</span>
          {r && <span className={`font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] ${toneCls}`}>Readiness {r.score}</span>}
        </div>
        <h2 className="mt-2 font-display text-[48px] font-black uppercase leading-[0.84]">{routine.name}</h2>
        <div className="mt-1.5 text-[13px] text-fg-3">{routine.focus}</div>
        <ul className="mt-3 flex flex-col gap-1.5">
          {reasons.map((x) => (
            <li key={x} className="flex gap-2.5 text-[14px] leading-snug text-fg-2">
              <span className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-fg-3" />
              {x}
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-line">
        {routine.items.map((it) => {
          const ex = w.exerciseById.get(it.exerciseId)
          if (!ex) return null
          const s = suggest(ex, historyFor(ex.id, w.workouts), w.readiness?.score)
          return (
            <div key={it.exerciseId} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-semibold">{ex.name}</span>
                <span className="block font-mono text-[10.5px] text-fg-3">
                  {it.sets} sets · {targetText(ex, s)}
                </span>
              </span>
              <SuggestionTag s={s} compact timed={ex.kind === 'duration'} />
            </div>
          )
        })}
      </div>
      <div className="p-3">
        <button onClick={onStart} className="btn-primary h-[52px] w-full text-[16px]">
          <Play size={16} fill="currentColor" /> Start {routine.name}
        </button>
      </div>
    </section>
  )
}

const TRACKED: Muscle[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core']

/** Weekly hard sets per muscle against the 10–20 range most hypertrophy work lands in. */
function MuscleSets({ w }: { w: World }) {
  const sets = useMemo(() => setsByMuscle(w.workouts, w.exerciseById, w.now), [w])
  const max = 24
  return (
    <Section title="Sets this week" action={<span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-fg-3">target 10–20</span>}>
      <div className="card px-4 py-3">
        {TRACKED.map((m) => {
          const v = sets.get(m) ?? 0
          const color = v >= 20.5 ? 'bg-z4' : v >= 10 ? 'bg-z2' : v > 0 ? 'bg-fg-3' : 'bg-transparent'
          return (
            <div key={m} className="grid grid-cols-[84px_1fr_30px] items-center gap-3 py-[5px]">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-fg-3">{MUSCLE_LABEL[m]}</span>
              <span className="relative h-2.5 rounded-full bg-ink-3">
                <span className="absolute inset-y-0 rounded-[2px] bg-fg/[0.07]" style={{ left: `${(10 / max) * 100}%`, width: `${(10 / max) * 100}%` }} />
                <span className={`absolute inset-y-0 left-0 rounded-full ${color}`} style={{ width: `${Math.min(1, v / max) * 100}%` }} />
              </span>
              <span className="num text-right text-[16px]">{v ? fmtKg(Math.round(v * 2) / 2) : '–'}</span>
            </div>
          )
        })}
        <p className="mt-2 text-[12px] leading-snug text-fg-3">Working sets in the last 7 days. Secondary muscles count as half a set.</p>
      </div>
    </Section>
  )
}

function History({ w }: { w: World }) {
  const groups = useMemo(() => {
    const out = new Map<string, typeof w.workouts>()
    for (const x of w.workouts) {
      const k = format(parseISO(x.start), 'MMMM yyyy')
      out.set(k, [...(out.get(k) ?? []), x])
    }
    return [...out.entries()]
  }, [w])
  const prs = useMemo(() => new Map(w.workouts.map((x) => [x.id, prsFor(x, w.workouts, w.exerciseById).length])), [w])
  if (!w.workouts.length) return <p className="mt-6 text-fg-3">Finish a workout and it shows up here.</p>
  return (
    <div className="mt-2">
      {groups.map(([k, list]) => (
        <Section key={k} title={k} action={<span className="font-mono text-[10.5px] text-fg-3">{list.length} sessions</span>} className="!mt-6">
          <div className="flex flex-col gap-2">
            {list.map((x) => (
              <WorkoutRow key={x.id} w={x} prs={prs.get(x.id)} />
            ))}
          </div>
        </Section>
      ))}
    </div>
  )
}

function Library({ w }: { w: World }) {
  const open = useUi((s) => s.open)
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState<Muscle | 'all'>('all')
  const stats = useMemo(() => {
    const out = new Map<string, { last: string; best: number }>()
    for (const ex of w.exercises) {
      const h = historyFor(ex.id, w.workouts)
      if (h.length) out.set(ex.id, { last: h[0].date, best: Math.max(...h.map((s) => bestE1rm(ex, s.sets))) })
    }
    return out
  }, [w])
  const list = w.exercises
    .filter((e) => (muscle === 'all' || e.muscle === muscle) && e.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (stats.get(b.id)?.last ?? '').localeCompare(stats.get(a.id)?.last ?? '') || a.name.localeCompare(b.name))
  return (
    <div className="mt-4">
      <div className="relative">
        <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises" className={`${inputCls} pl-10`} />
      </div>
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        {[{ key: 'all' as const, label: 'All' }, ...MUSCLES].map((m) => (
          <button key={m.key} onClick={() => setMuscle(m.key)} className={`chip shrink-0 ${muscle === m.key ? 'chip-on' : ''}`}>
            {m.label}
          </button>
        ))}
      </div>
      <button
        onClick={() => open({ type: 'exercise' })}
        className="press mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-card border border-dashed border-line-2 text-[14px] font-semibold text-fg-2"
      >
        <Plus size={16} /> Custom exercise
      </button>
      <div className="mt-2">
        {list.map((e) => {
          const st = stats.get(e.id)
          return (
            <Link key={e.id} to={`/lift/exercise/${e.id}`} className="press flex items-center gap-3 border-b border-line py-3">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[15px] font-semibold">{e.name}</span>
                  {e.custom && <span className="rounded-full border border-line-2 px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.08em] text-fg-3">Custom</span>}
                </span>
                <span className="mt-0.5 block font-mono text-[10.5px] uppercase tracking-[0.05em] text-fg-3">
                  {MUSCLE_LABEL[e.muscle]} · {EQUIPMENT_LABEL[e.equipment]}
                </span>
              </span>
              {st ? (
                <span className="text-right">
                  {st.best > 0 && hasE1rm(e) ? (
                    <span className="num block text-[19px]">
                      {fmtKg(Math.round(st.best))}
                      <span className="ml-0.5 font-sans text-[10px] font-medium text-fg-3">e1RM</span>
                    </span>
                  ) : null}
                  <span className="block font-mono text-[10px] text-fg-4">{format(parseISO(st.last), 'd MMM')}</span>
                </span>
              ) : (
                <span className="font-mono text-[10px] uppercase text-fg-4">New</span>
              )}
            </Link>
          )
        })}
        {!list.length && <p className="py-6 text-center text-fg-3">Nothing matches. Make it a custom exercise.</p>}
      </div>
    </div>
  )
}
