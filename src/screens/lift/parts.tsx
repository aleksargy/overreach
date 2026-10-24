import { ArrowDown, ArrowUp, ChevronRight, Feather, Hand, Plus, Sparkles, Trophy } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { EQUIPMENT, MUSCLES } from '../../data/exercises'
import type { Exercise, SetEntry, Workout } from '../../data/types'
import { dur, fmt } from '../../lib/format'
import { fmtKg, fmtRpe, volume, workingSets, type Suggestion } from '../../lib/lift'

export const MUSCLE_LABEL = Object.fromEntries(MUSCLES.map((m) => [m.key, m.label])) as Record<string, string>
export const EQUIPMENT_LABEL = Object.fromEntries(EQUIPMENT.map((m) => [m.key, m.label])) as Record<string, string>

/** "72.5 × 8", "+10 × 6", "12 reps", "45s" */
export function setText(ex: Exercise, s: SetEntry): string {
  if (ex.kind === 'duration') return `${s.secs ?? 0}s`
  if (ex.kind === 'bodyweight') return `${s.reps ?? 0} reps`
  if (ex.kind === 'weighted-bodyweight') return s.kg ? `+${fmtKg(s.kg)} × ${s.reps ?? 0}` : `BW × ${s.reps ?? 0}`
  return `${fmtKg(s.kg ?? 0)} × ${s.reps ?? 0}`
}

export function setsLine(ex: Exercise, sets: SetEntry[]): string {
  return sets
    .filter((s) => s.kind !== 'warmup')
    .map((s) => setText(ex, s) + (s.rpe ? ` @${fmtRpe(s.rpe)}` : ''))
    .join(', ')
}

export function tonnes(kg: number): string {
  return kg >= 1000 ? `${(kg / 1000).toFixed(1)} t` : `${Math.round(kg)} kg`
}

const TAG: Record<Suggestion['tag'], { label: string; cls: string; icon: ReactNode }> = {
  up: { label: 'Go up', cls: 'border-z2/40 bg-z2/10 text-z2', icon: <ArrowUp size={12} strokeWidth={2.5} /> },
  reps: { label: 'Add reps', cls: 'border-line-2 bg-ink-3 text-fg', icon: <Plus size={12} strokeWidth={2.5} /> },
  hold: { label: 'Hold', cls: 'border-z3/40 bg-z3/10 text-z3', icon: <Hand size={12} strokeWidth={2.5} /> },
  deload: { label: 'Deload', cls: 'border-z4/40 bg-z4/10 text-z4', icon: <ArrowDown size={12} strokeWidth={2.5} /> },
  easy: { label: 'Easy day', cls: 'border-z1/40 bg-z1/10 text-z1', icon: <Feather size={12} strokeWidth={2.5} /> },
  first: { label: 'New', cls: 'border-line-2 bg-ink-3 text-fg-2', icon: <Sparkles size={12} strokeWidth={2.5} /> },
}

export function SuggestionTag({ s, compact, timed }: { s: Suggestion; compact?: boolean; timed?: boolean }) {
  const t = s.tag === 'reps' && timed ? { ...TAG.reps, label: 'Add time' } : TAG[s.tag]
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border font-mono font-semibold uppercase ${compact ? 'h-5 px-1.5 text-[9px] tracking-[0.06em]' : 'h-6 px-2 text-[10px] tracking-[0.1em]'} ${t.cls}`}
    >
      {t.icon}
      {t.label}
    </span>
  )
}

/** The target in one glance: "72.5 kg × 6–10 @8". */
export function targetText(ex: Exercise, s: Suggestion): string {
  const at = `@${fmtRpe(s.rpe)}`
  if (ex.kind === 'duration' || ex.kind === 'bodyweight') return `${s.reps} ${at}`
  if (ex.kind === 'weighted-bodyweight') return `${s.kg ? `+${fmtKg(s.kg)} kg` : 'BW'} × ${s.reps} ${at}`
  return `${s.kg ? `${fmtKg(s.kg)} kg` : '?'} × ${s.reps} ${at}`
}

export function WorkoutRow({ w, prs }: { w: Workout; prs?: number }) {
  const mins = w.end ? (Date.parse(w.end) - Date.parse(w.start)) / 1000 : 0
  return (
    <Link to={`/lift/history/${w.id}`} className="press card flex items-center gap-3 p-3 pr-2.5">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[8px] bg-ink-2 font-display text-[17px] font-black uppercase text-fg-2">{fmt(w.start, 'd')}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold">{w.name}</span>
          {!!prs && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-z3/15 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-z3">
              <Trophy size={10} strokeWidth={2.5} />
              {prs}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[10.5px] uppercase tracking-[0.06em] text-fg-3">
          {fmt(w.start, 'EEE d MMM')} · {dur(mins)}
          {w.srpe ? ` · RPE ${w.srpe}` : ''}
        </span>
      </span>
      <span className="text-right">
        <span className="num block text-[24px]">
          {workingSets(w)}
          <span className="ml-0.5 font-sans text-[11px] font-medium text-fg-3">sets</span>
        </span>
        <span className="block font-mono text-[10px] text-fg-3">{tonnes(volume(w))}</span>
      </span>
      <ChevronRight size={16} className="text-fg-4" />
    </Link>
  )
}
