import { ArrowDown, ArrowUp, Check, ChevronRight, Minus, Pencil, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { IconButton, Screen } from '../../components/ui/Screen'
import { Sheet } from '../../components/ui/Sheet'
import { Empty, Section, Segmented, inputCls, plainText, useAutoFocus } from '../../components/ui/bits'
import { useStore } from '../../data/store'
import type { Exercise, LiftGoal, Programme, ProgrammeRun, Routine, SetEntry } from '../../data/types'
import { useUi } from '../../data/ui'
import { useWorld, type World } from '../../data/world'
import { goalDay, goalProgress, isStretch, liftsOf, mainLiftsOf, nudge, suggestGoal } from '../../lib/goals'
import { doneThisWeek, focusOf, historyFor, nextRoutine, openRun, routinesOf, sessionsByWeek, setText, weekOfRun } from '../../lib/lift'
import { uid } from '../../lib/rng'

/** a new programme runs this many weeks until you say otherwise */
export const DEFAULT_WEEKS = 10

/** Where you are in a programme you're on: "Week 3 of 10", "Week 3" with no end, or "10 weeks done" once they're up. */
export function programmeWhen(p: Programme, now: Date): string {
  const run = openRun(p)
  if (!run) return ''
  const week = weekOfRun(run, now)
  if (p.weeks && week > p.weeks) return `${p.weeks} weeks done`
  return p.weeks ? `Week ${week} of ${p.weeks}` : `Week ${week}`
}

/** "3 workouts · 3 a week · 10 weeks" */
export function programmeMeta(p: Programme, w: World): string {
  const n = routinesOf(p, w.routines).length
  return [`${n} ${n === 1 ? 'workout' : 'workouts'}`, `${p.perWeek} a week`, p.weeks ? `${p.weeks} weeks` : 'no end'].join(' · ')
}

/**
 * This week's sessions against the plan, as short capsules: solid for each one done, faint for each to go. (Not
 * dots: three dots in a corner read as a menu.) `tinted` on the lilac.
 */
export function WeekBars({ p, w, tinted }: { p: Programme; w: World; tinted?: boolean }) {
  const done = doneThisWeek(p, w.routines, w.workouts, w.now)
  return (
    <span role="img" aria-label={`${done} of ${p.perWeek} this week`} className="flex shrink-0 items-center gap-1">
      {Array.from({ length: Math.max(done, p.perWeek) }, (_, i) => (
        <span key={i} className={`h-1.5 w-4 rounded-full ${i >= done ? 'bg-strength/[0.22]' : tinted ? 'bg-strength-head' : 'bg-strength'}`} />
      ))}
    </span>
  )
}

/** How far through its weeks a programme you're on is: an 8 px track, this week counted, full once they're up. */
export function WeeksTrack({ p, now, className = '' }: { p: Programme; now: Date; className?: string }) {
  const run = openRun(p)
  if (!run || !p.weeks) return null
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-strength/[0.16] ${className}`}>
      <div className="h-full rounded-full bg-strength" style={{ width: `${Math.min(100, (weekOfRun(run, now) / p.weeks) * 100)}%` }} />
    </div>
  )
}

/**
 * A run of a programme week by week: a column for each week, a capsule for each session it's planned for, solid for
 * each one done; faint for the weeks still to come.
 */
function RunWeeks({ p, run, w }: { p: Programme; run: ProgrammeRun; w: World }) {
  const counts = sessionsByWeek(p, run, w.routines, w.workouts, w.now)
  const weeks = Math.max(counts.length, p.weeks ?? 0)
  const done = counts.reduce((a, b) => a + b, 0)
  return (
    <div
      role="img"
      aria-label={`${done} ${done === 1 ? 'session' : 'sessions'} in ${counts.length} ${counts.length === 1 ? 'week' : 'weeks'}`}
      className={`mt-4 flex items-end ${weeks > 16 ? 'gap-0.5' : 'gap-1'}`}
    >
      {Array.from({ length: weeks }, (_, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col-reverse gap-[3px]">
          {Array.from({ length: Math.max(p.perWeek, counts[i] ?? 0) }, (_, j) => (
            <span key={j} className={`h-1.5 rounded-full ${j < (counts[i] ?? 0) ? 'bg-strength' : i < counts.length ? 'bg-strength/[0.22]' : 'bg-strength/[0.08]'}`} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** A set as a goal says it: "82.5 × 6", or "+10 × 6" for weight added to you. */
const goalText = (ex: Exercise, x: { kg: number; reps: number }) => setText(ex, { id: '', kind: 'working', kg: x.kg, reps: x.reps, done: true } as SetEntry)

/** A goal and how it's going: from where it stood to it, your best set since it was set, and a track between them. */
function GoalRow({ g, w, run }: { g: LiftGoal; w: World; run: ProgrammeRun }) {
  const ex = w.exerciseById.get(g.exerciseId)
  if (!ex) return null
  const at = goalProgress(g, ex, historyFor(ex.id, w.workouts), run, w.now, w.body.find((b) => b.weightKg)?.weightKg)
  return (
    <div className="py-3">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold leading-5">{ex.name}</span>
          <span className="meta block truncate">
            {goalText(ex, g.from)} → {goalText(ex, g)}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className={`num text-[17px] leading-[1.25] ${at.done ? 'text-football' : ''}`}>{goalText(ex, at.now)}</span>
          {at.done ? (
            <span className="pill [--p:var(--football)]">Done</span>
          ) : at.pace === 'on' ? (
            <span className="pill [--p:var(--good)]">On pace</span>
          ) : at.pace === 'behind' ? (
            <span className="pill [--p:var(--bad)]">Behind</span>
          ) : null}
        </span>
      </div>
      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-strength/[0.16]">
        <div className={`h-full rounded-full ${at.done ? 'bg-football' : 'bg-strength'}`} style={{ width: `${(at.done ? 1 : at.share) * 100}%` }} />
      </div>
    </div>
  )
}

/** Make a programme, three times a week for ten weeks with nothing in it yet, and open it to fill in. */
export function useNewProgramme() {
  const save = useStore((s) => s.saveProgramme)
  const nav = useNavigate()
  return () => {
    const id = `p-${uid()}`
    save({ id, name: 'New programme', routineIds: [], perWeek: 3, weeks: DEFAULT_WEEKS, runs: [] })
    nav(`/lift/programme/${id}?edit=1`)
  }
}

/** Your programmes: the one you're on first, then the rest, and any workout that's in none of them. */
export function ProgrammesScreen() {
  const w = useWorld()
  const create = useNewProgramme()
  // a programme made and left with nothing in it is tidied away on the way back here
  useEffect(() => {
    const { programmes, deleteProgramme } = useStore.getState()
    for (const p of programmes) if (!p.routineIds.length && !p.runs.length) deleteProgramme(p.id)
  }, [])
  const current = w.programme
  const last = (p: Programme) => p.runs[p.runs.length - 1]?.start ?? ''
  const others = w.programmes.filter((p) => p.id !== current?.id && (p.routineIds.length || p.runs.length)).sort((a, b) => last(b).localeCompare(last(a)))
  const loose = w.routines.filter((r) => r.items.length && !w.programmes.some((p) => p.routineIds.includes(r.id)))
  return (
    <Screen
      title="Programmes"
      back
      actions={
        <IconButton label="New programme" onClick={create} active>
          <Plus size={18} strokeWidth={2.2} />
        </IconButton>
      }
    >
      {current && <Running w={w} p={current} />}
      {others.length > 0 && (
        <Section>
          <div className="list -my-1">
            {others.map((p) => (
              <Link key={p.id} to={`/lift/programme/${p.id}`} className="flex items-center gap-3 py-3 transition-colors duration-150 active:bg-ink-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold leading-5">{p.name}</span>
                  <span className="meta block truncate">{programmeMeta(p, w)}</span>
                </span>
                <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-fg-4" />
              </Link>
            ))}
          </div>
        </Section>
      )}
      {loose.length > 0 && (
        <Section title="Not in a programme">
          <div className="flex flex-wrap gap-2">
            {loose.map((r) => (
              <Link key={r.id} to={`/lift/workout/${r.id}`} className="chip px-3.5 text-[14px]">
                {r.name}
              </Link>
            ))}
          </div>
        </Section>
      )}
      {!current && !others.length && (
        <div className="mt-2.5">
          <Empty
            title="No programmes yet"
            action={
              <button onClick={create} className="btn-primary mt-3 w-full">
                New programme
              </button>
            }
          />
        </div>
      )}
    </Screen>
  )
}

/** The programme you're on, on the lilac: its week, this week's sessions, and how far through its weeks it is. */
function Running({ w, p }: { w: World; p: Programme }) {
  return (
    <Link to={`/lift/programme/${p.id}`} className="hero press flex flex-col gap-1 bg-strength-tint">
      <div className="flex items-center justify-between gap-3 text-strength-label">
        <span className="text-[13px] font-bold">{programmeWhen(p, w.now)}</span>
        <WeekBars p={p} w={w} tinted />
      </div>
      <span className="display mt-1 text-balance text-[44px] font-extrabold leading-none tracking-[-0.035em] text-strength-head">{p.name}</span>
      <span className="text-[13px] text-strength-head/80">{programmeMeta(p, w)}</span>
      <WeeksTrack p={p} now={w.now} className="mt-3" />
    </Link>
  )
}

/**
 * One programme: where you are in it and its workouts, with Start (or Run again) underneath when you're not on it.
 * Edit turns it into its name, how often, how long, and its workouts in order.
 */
export function ProgrammeScreen() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const w = useWorld()
  const nav = useNavigate()
  const save = useStore((s) => s.saveProgramme)
  const remove = useStore((s) => s.deleteProgramme)
  const start = useStore((s) => s.startProgramme)
  const stop = useStore((s) => s.stopProgramme)
  const open = useUi((s) => s.open)
  const say = useUi((s) => s.say)
  const [sure, setSure] = useState<'stop' | 'delete' | null>(null)
  const p = w.programmes.find((x) => x.id === id)
  // a new programme opens on its name, ready to type over
  const nameRef = useAutoFocus<HTMLInputElement>(params.get('edit') === '1' && !!p && !p.routineIds.length && !p.runs.length)
  if (!p) {
    return (
      <Screen title="Programme" back>
        <Empty title="Not found" />
      </Screen>
    )
  }
  const editing = params.get('edit') === '1'
  const setEditing = (v: boolean) => {
    if (!v && !p.name.trim()) save({ ...p, name: 'Programme' })
    setSure(null)
    setParams(v ? { edit: '1' } : {}, { replace: true })
  }
  // the programme as it stands now, not as it stood when a sheet was opened over it
  const latest = () => useStore.getState().programmes.find((x) => x.id === p.id) ?? p
  const change = (patch: Partial<Programme>) => save({ ...latest(), ...patch })
  const workouts = routinesOf(p, w.routines)
  // the list as it is, in its order: a workout deleted since drops out of it here
  const setWorkouts = (fn: (list: Routine[]) => Routine[]) => change({ routineIds: fn(routinesOf(latest(), useStore.getState().routines.concat(w.routines))).map((r) => r.id) })
  const move = (i: number, d: -1 | 1) =>
    setWorkouts((list) => {
      const j = i + d
      if (j < 0 || j >= list.length) return list
      const out = [...list]
      ;[out[i], out[j]] = [out[j], out[i]]
      return out
    })
  const add = () => open({ type: 'pickRoutine', exclude: workouts.map((r) => r.id), onPick: (rid) => change({ routineIds: [...latest().routineIds, rid] }) })
  const running = w.programme?.id === p.id
  const run = openRun(p)
  const over = !!run && !!p.weeks && weekOfRun(run, w.now) > p.weeks
  const next = running ? nextRoutine(w.routines, w.workouts, p) : undefined
  const ready = workouts.some((r) => r.items.length)
  // on sample data the sample lifter's programme shows too: that one isn't yours to delete
  const mine = useStore.getState().programmes.some((x) => x.id === p.id)
  const shown = p.weeks ?? DEFAULT_WEEKS
  const goals = run?.goals ?? []
  const setGoals = () => open({ type: 'goals', programmeId: p.id })

  return (
    <Screen
      title={p.name || 'Programme'}
      back
      bare
      actions={
        <IconButton label={editing ? 'Done' : 'Edit programme'} onClick={() => setEditing(!editing)} active={editing}>
          {editing ? <Check size={17} strokeWidth={2.25} /> : <Pencil size={15} />}
        </IconButton>
      }
    >
      {editing ? (
        <>
          {/* no "Name" label: iOS offers your contact card to anything called that */}
          <input
            ref={nameRef}
            value={p.name}
            onChange={(e) => change({ name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            aria-label="Programme"
            placeholder="Full body, Upper/lower…"
            maxLength={32}
            enterKeyHint="done"
            autoCapitalize="sentences"
            {...plainText}
            className={`${inputCls} mt-2`}
            // a new programme's stand-in name is selected, so typing replaces it
            onFocus={(e) => !p.routineIds.length && !p.runs.length && e.currentTarget.select()}
          />
          <div className="label mb-2 mt-6">Times a week</div>
          <Segmented value={p.perWeek} options={[2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }))} onChange={(perWeek) => change({ perWeek })} />
          <div className="label mb-2 mt-6">Length</div>
          <div className="flex items-center gap-2.5">
            <button aria-label="A week shorter" disabled={shown <= 1} onClick={() => change({ weeks: shown - 1 })} className="round h-9 w-9 text-fg-2 disabled:opacity-30">
              <Minus size={15} />
            </button>
            <span className={`num w-7 text-center text-[20px] ${p.weeks ? '' : 'text-fg-4'}`}>{shown}</span>
            <button aria-label="A week longer" disabled={shown >= 52} onClick={() => change({ weeks: shown + 1 })} className="round h-9 w-9 text-fg-2 disabled:opacity-30">
              <Plus size={15} />
            </button>
            <span className={`meta ${p.weeks ? '' : 'text-fg-4'}`}>weeks</span>
            <button aria-pressed={!p.weeks} onClick={() => change({ weeks: p.weeks ? undefined : DEFAULT_WEEKS })} className={`chip ml-auto h-9 ${p.weeks ? '' : 'chip-on'}`}>
              No end
            </button>
          </div>
          <div className="label mb-1 mt-6">Workouts</div>
          <div className="list">
            {workouts.map((r, i) => (
              <div key={r.id} className="flex items-center gap-1 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold">{r.name}</span>
                  {r.items.length > 0 && <span className="meta block truncate">{focusOf(r, w.exerciseById)}</span>}
                </span>
                <button
                  aria-label={`Move ${r.name} up`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  className="press grid h-8 w-8 place-items-center text-fg-3 disabled:opacity-25"
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  aria-label={`Move ${r.name} down`}
                  disabled={i === workouts.length - 1}
                  onClick={() => move(i, 1)}
                  className="press grid h-8 w-8 place-items-center text-fg-3 disabled:opacity-25"
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  aria-label={`Take ${r.name} out`}
                  onClick={() => setWorkouts((list) => list.filter((_, k) => k !== i))}
                  className="press -mr-2 grid h-8 w-8 place-items-center text-fg-3"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
          <button onClick={add} className="btn-ghost mt-4 w-full">
            <Plus size={18} /> Add workouts
          </button>
          {mine && (
            <button
              onClick={() => {
                if (sure !== 'delete') return setSure('delete')
                remove(p.id)
                say(`${p.name || 'Programme'} deleted`)
                nav('/lift/programmes', { replace: true })
              }}
              className={`press mt-3 h-12 w-full rounded-full text-[14.5px] font-semibold ${sure === 'delete' ? 'bg-bad text-ink-0' : 'text-fg-3'}`}
            >
              {sure === 'delete' ? 'Tap again to delete it' : 'Delete programme'}
            </button>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="label">{running ? programmeWhen(p, w.now) : programmeMeta(p, w)}</div>
            {running && <WeekBars p={p} w={w} />}
          </div>
          <h1 className="t-page mt-0.5 text-balance">{p.name}</h1>
          {running && run && <RunWeeks p={p} run={run} w={w} />}
          {running &&
            run &&
            (goals.length ? (
              <Section
                title="Goals"
                action={
                  <button onClick={setGoals} className="link">
                    Edit
                  </button>
                }
                className="!mt-6"
              >
                <div className="list -my-1">
                  {goals.map((g) => (
                    <GoalRow key={g.exerciseId} g={g} w={w} run={run} />
                  ))}
                </div>
              </Section>
            ) : (
              ready && (
                <button onClick={setGoals} className="btn-ghost mt-6 w-full">
                  Set goals
                </button>
              )
            ))}
          {workouts.length ? (
            <div className="tile list mt-6 py-1">
              {workouts.map((r) => (
                <Link key={r.id} to={`/lift/workout/${r.id}`} className="flex items-center gap-3 py-3 transition-colors duration-150 active:bg-ink-2">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-bold leading-5">{r.name}</span>
                      {next?.id === r.id && <span className="pill shrink-0 [--p:var(--strength)]">Next</span>}
                    </span>
                    {r.items.length > 0 && <span className="meta block truncate">{focusOf(r, w.exerciseById)}</span>}
                  </span>
                  <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-fg-4" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-6">
              <Empty
                title="Nothing in it yet"
                action={
                  <button onClick={() => setEditing(true)} className="btn-primary mt-3 w-full">
                    Add workouts
                  </button>
                }
              />
            </div>
          )}
          {ready && (!running || over) && (
            <button
              onClick={() => {
                start(p)
                nav('/lift')
              }}
              className="btn-primary mt-6 w-full"
            >
              {p.runs.length ? 'Run again' : 'Start programme'}
            </button>
          )}
          {running && (
            <button
              onClick={() => {
                if (sure !== 'stop') return setSure('stop')
                stop(p)
                setSure(null)
              }}
              className={`press mt-3 h-12 w-full rounded-full text-[14.5px] font-semibold ${sure === 'stop' ? 'bg-bad text-ink-0' : 'text-fg-3'}`}
            >
              {sure === 'stop' ? 'Tap again to stop it' : 'Stop programme'}
            </button>
          )}
        </>
      )}
    </Screen>
  )
}

/**
 * Goals for the run of a programme you're on: every lift in it with weight on it and a session to go from, each
 * workout's first suggested the first time. Tick one to suggest it, move it a step either way, then save.
 */
export function GoalsSheet() {
  const sheet = useUi((s) => s.sheet)
  const close = useUi((s) => s.close)
  const open = sheet?.type === 'goals'
  return (
    <Sheet open={open} onClose={close} title="Goals">
      {open && <GoalsForm programmeId={sheet.programmeId} />}
    </Sheet>
  )
}

function GoalsForm({ programmeId }: { programmeId: string }) {
  const w = useWorld()
  const save = useStore((s) => s.setGoals)
  const close = useUi((s) => s.close)
  const p = w.programmes.find((x) => x.id === programmeId)
  const run = p && openRun(p)
  const bodyKg = w.body.find((b) => b.weightKg)?.weightKg
  // the lifts a goal can go on: with weight on them, and done at least once to go from
  const lifts = useMemo(
    () => (p ? liftsOf(p, w.routines, w.exerciseById).map((ex) => ({ ex, history: historyFor(ex.id, w.workouts) })) : []).filter((l) => l.history.length),
    [p, w],
  )
  const by = p && run ? goalDay(p, run, w.now) : ''
  const suggest = (ex: Exercise) => suggestGoal(ex, lifts.find((l) => l.ex.id === ex.id)?.history ?? [], { now: w.now, by, bodyKg })
  // what's saved, or the first time each workout's first lift, suggested
  const [draft, setDraft] = useState<Map<string, LiftGoal>>(() => {
    if (run?.goals?.length) return new Map(run.goals.map((g) => [g.exerciseId, g]))
    return new Map((p ? mainLiftsOf(p, w.routines, w.exerciseById) : []).flatMap((ex) => (suggest(ex) ? [[ex.id, suggest(ex)!] as const] : [])))
  })
  if (!p || !run) return null
  const put = (id: string, g?: LiftGoal) =>
    setDraft((d) => {
      const out = new Map(d)
      if (g) out.set(id, g)
      else out.delete(id)
      return out
    })
  return (
    <div className="pb-2">
      <div className="list">
        {lifts.map(({ ex, history }) => {
          const g = draft.get(ex.id)
          return (
            <div key={ex.id} className="py-3">
              <button onClick={() => put(ex.id, g ? undefined : suggest(ex))} aria-pressed={!!g} className="press flex w-full items-center gap-3 text-left">
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${g ? 'bg-strength text-ink-0' : 'border-[1.5px] border-line-2'}`}>
                  {g && <Check size={14} strokeWidth={2.75} />}
                </span>
                <span className={`min-w-0 flex-1 truncate text-[16px] font-semibold ${g ? '' : 'text-fg-3'}`}>{ex.name}</span>
                {g && isStretch(g, ex, history, bodyKg) && <span className="pill shrink-0 [--p:var(--strength)]">Stretch</span>}
              </button>
              {g && (
                <div className="mt-2 flex items-center gap-2 pl-9">
                  <span className="meta min-w-0 flex-1 truncate">from {goalText(ex, g.from)}</span>
                  <button aria-label={`${ex.name} goal a step lighter`} onClick={() => put(ex.id, nudge(g, ex, -1, bodyKg))} className="round h-9 w-9 text-fg-2">
                    <Minus size={15} />
                  </button>
                  <span className="num min-w-[84px] text-center text-[17px] tabular-nums">{goalText(ex, g)}</span>
                  <button aria-label={`${ex.name} goal a step heavier`} onClick={() => put(ex.id, nudge(g, ex, 1, bodyKg))} className="round h-9 w-9 text-fg-2">
                    <Plus size={15} />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <button
        onClick={() => {
          save(
            p,
            lifts.flatMap((l) => draft.get(l.ex.id) ?? []),
          )
          close()
        }}
        className="btn-primary mt-5 w-full"
      >
        Save goals
      </button>
    </div>
  )
}

/** Add workouts to a programme: yours that aren't in it yet, or a new one, made and opened to fill in. */
export function PickRoutineSheet() {
  const sheet = useUi((s) => s.sheet)
  const close = useUi((s) => s.close)
  const open = sheet?.type === 'pickRoutine'
  return (
    <Sheet
      open={open}
      onClose={close}
      title="Add workouts"
      footer={
        <button onClick={close} className="btn-primary w-full">
          Done
        </button>
      }
    >
      {open && <RoutinePicker onPick={sheet.onPick} exclude={sheet.exclude} />}
    </Sheet>
  )
}

function RoutinePicker({ onPick, exclude }: { onPick: (id: string) => void; exclude: string[] }) {
  const w = useWorld()
  const close = useUi((s) => s.close)
  const save = useStore((s) => s.saveRoutine)
  const nav = useNavigate()
  // what's gone in while the sheet has been open, so each is ticked and can't go in twice
  const [added, setAdded] = useState<string[]>([])
  const list = w.routines.filter((r) => r.items.length && !exclude.includes(r.id))
  const fresh = () => {
    const id = `r-${uid()}`
    save({ id, name: 'New workout', focus: '', items: [] })
    onPick(id)
    close()
    nav(`/lift/workout/${id}?edit=1`)
  }
  return (
    <div>
      <button onClick={fresh} className="chip h-11 w-full justify-center">
        <Plus size={16} /> New workout
      </button>
      <div className="mt-1">
        {list.map((r) => {
          const done = added.includes(r.id)
          return (
            <button
              key={r.id}
              disabled={done}
              onClick={() => {
                onPick(r.id)
                setAdded((x) => [...x, r.id])
              }}
              className="press flex w-full items-center gap-3 border-b border-ink-3 py-3 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-semibold">{r.name}</span>
                <span className="meta block truncate">{focusOf(r, w.exerciseById)}</span>
              </span>
              {done ? (
                <span className="grid h-7 w-7 place-items-center rounded-full bg-strength text-ink-0">
                  <Check size={15} strokeWidth={2.75} />
                </span>
              ) : (
                <Plus size={18} className="text-fg-3" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
