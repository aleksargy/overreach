import { ArrowLeftRight, Check } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Sheet } from '../../components/ui/Sheet'
import { Segmented, Stepper, inputCls } from '../../components/ui/bits'
import { useStore } from '../../data/store'
import type { Format, Match, MomentKey, Position } from '../../data/types'
import { useUi } from '../../data/ui'
import { loadFootballAnalysis, useWorld } from '../../data/world'
import { FEEL, FORMATS, MOMENTS, POSITIONS, baselineFor, headline, rateMatch } from '../../lib/football'
import { dur, fmt, km } from '../../lib/format'
import { uid } from '../../lib/rng'
import { rowsFor } from './season'

export function LogMatchSheet() {
  const sheet = useUi((s) => s.sheet)
  const close = useUi((s) => s.close)
  const open = sheet?.type === 'logMatch'
  return (
    <Sheet open={open} onClose={close} title={sheet?.type === 'logMatch' && sheet.matchId ? 'Edit match' : 'Log a match'} kicker="Match report">
      {open && <Form key={(sheet.activityId ?? '') + (sheet.matchId ?? '')} activityId={sheet.activityId} matchId={sheet.matchId} />}
    </Sheet>
  )
}

function Form({ activityId, matchId }: { activityId?: string; matchId?: string }) {
  const w = useWorld()
  const saveMatch = useStore((s) => s.saveMatch)
  const close = useUi((s) => s.close)
  const showReveal = useUi((s) => s.showReveal)
  const editing = matchId ? w.matches.find((m) => m.id === matchId) : undefined
  const p = w.profile

  const candidates = useMemo(() => {
    const list = w.activities.filter((a) => a.sport === 'football').slice(0, 8)
    return list.filter((a) => a.id === activityId || a.id === editing?.activityId || !w.matchByActivity.has(a.id) || w.matchByActivity.get(a.id)?.id === matchId)
  }, [w, activityId, editing, matchId])

  const [linked, setLinked] = useState<string | undefined>(editing?.activityId ?? activityId ?? candidates.find((a) => !w.matchByActivity.has(a.id))?.id)
  const linkedAct = linked ? w.byId.get(linked) : undefined
  const [format, setFormat] = useState<Format>(editing?.format ?? ((Number(linkedAct?.kind) || p.format) as Format))
  const [team, setTeam] = useState(editing?.team ?? (format <= 6 ? p.team : 'My team'))
  const [opponent, setOpponent] = useState(editing?.opponent ?? (format <= 6 ? p.opponent : 'Opposition'))
  const [scoreFor, setFor] = useState(editing?.scoreFor ?? 0)
  const [scoreAgainst, setAgainst] = useState(editing?.scoreAgainst ?? 0)
  const [goals, setGoals] = useState(editing?.goals ?? 0)
  const [assists, setAssists] = useState(editing?.assists ?? 0)
  const [position, setPosition] = useState<Position>(editing?.position ?? p.position)
  const [moments, setMoments] = useState<MomentKey[]>(editing?.moments ?? [])
  const [feel, setFeel] = useState(editing?.feel ?? 6)
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!editing && linkedAct?.kind && Number(linkedAct.kind)) setFormat(Number(linkedAct.kind) as Format)
  }, [linkedAct, editing])

  const toggle = (k: MomentKey) => setMoments((ms) => (ms.includes(k) ? ms.filter((x) => x !== k) : [...ms, k]))
  const tooMany = goals + assists > scoreFor

  async function submit() {
    setBusy(true)
    const act = linked ? w.byId.get(linked) : undefined
    const analysis = act ? await loadFootballAnalysis(act, w) : null
    const date = act?.start ?? editing?.date ?? new Date().toISOString()
    const history = rowsFor(
      w,
      w.matches.filter((m) => m.id !== editing?.id && m.date < date),
    )
    const baseline = baselineFor(format, history)
    const { rating, breakdown } = rateMatch({ format, scoreFor, scoreAgainst, goals, assists, moments, position, feel, analysis: analysis ?? undefined, baseline })
    const m: Match = {
      id: editing?.id ?? `m-${uid()}`,
      activityId: act?.id,
      date,
      format,
      team: team.trim() || 'My team',
      opponent: opponent.trim() || 'Opposition',
      scoreFor,
      scoreAgainst,
      goals,
      assists,
      moments,
      position,
      feel,
      notes: notes.trim() || undefined,
      flip: editing?.flip,
      rating,
      breakdown,
      headline: '',
      createdAt: editing?.createdAt ?? new Date().toISOString(),
    }
    m.headline = headline(m, p.name, analysis ?? undefined, baseline)
    saveMatch(m)
    setBusy(false)
    close()
    setTimeout(() => showReveal(m.id), 260)
  }

  return (
    <div className="flex flex-col gap-6 pb-2">
      <div>
        <div className="label mb-2">Watch recording</div>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {candidates.map((a) => (
            <button
              key={a.id}
              onClick={() => setLinked(a.id)}
              className={`press min-w-[148px] shrink-0 rounded-[10px] border p-3 text-left ${linked === a.id ? 'border-fg bg-ink-3' : 'border-line-2 bg-ink-1'}`}
            >
              <span className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-fg-3">{fmt(a.start, 'EEE d MMM')}</span>
                {linked === a.id && <Check size={14} />}
              </span>
              <span className="mt-1 block font-display text-[20px] font-extrabold uppercase leading-none">{a.name}</span>
              <span className="mt-1 block font-mono text-[10.5px] text-fg-3">
                {dur(a.durationS)} · {km(a.distanceM, 1)} km
              </span>
            </button>
          ))}
          <button
            onClick={() => setLinked(undefined)}
            className={`press min-w-[120px] shrink-0 rounded-[10px] border p-3 text-left ${!linked ? 'border-fg bg-ink-3' : 'border-dashed border-line-2'}`}
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-fg-3">No watch</span>
            <span className="mt-1 block text-[13px] text-fg-2">Rate it from what you log</span>
          </button>
        </div>
      </div>

      <div>
        <div className="label mb-2">Format</div>
        <Segmented size="sm" value={format} onChange={setFormat} options={FORMATS.map((f) => ({ value: f, label: `${f}s` }))} />
      </div>

      <div className="rounded-card border border-line bg-ink-1 p-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
          <div className="flex flex-col items-center gap-2">
            <input
              aria-label="Your team"
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              className="w-full bg-transparent text-center font-display text-[18px] font-extrabold uppercase tracking-wide text-fg focus:outline-none"
            />
            <Stepper value={scoreFor} onChange={setFor} big stack />
          </div>
          <button aria-label="Swap team names" onClick={() => (setTeam(opponent), setOpponent(team))} className="press mt-1 grid h-8 w-8 place-items-center rounded-full text-fg-3">
            <ArrowLeftRight size={15} />
          </button>
          <div className="flex flex-col items-center gap-2">
            <input
              aria-label="Opponent"
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
              className="w-full bg-transparent text-center font-display text-[18px] font-extrabold uppercase tracking-wide text-fg-2 focus:outline-none"
            />
            <Stepper value={scoreAgainst} onChange={setAgainst} big stack />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-card border border-line bg-ink-1 py-4">
          <Stepper label="Your goals" value={goals} onChange={setGoals} />
        </div>
        <div className="rounded-card border border-line bg-ink-1 py-4">
          <Stepper label="Assists" value={assists} onChange={setAssists} />
        </div>
      </div>
      {tooMany && <p className="-mt-4 text-[13px] text-warn">That's more goals and assists than your team scored. Check the score.</p>}

      <div>
        <div className="label mb-2">Where you played</div>
        <Segmented size="sm" value={position} onChange={setPosition} options={POSITIONS.map((x) => ({ value: x.key, label: x.label }))} />
      </div>

      <div>
        <div className="label mb-2">Moments</div>
        <div className="flex flex-wrap gap-2">
          {MOMENTS.map((m) => {
            const on = moments.includes(m.key)
            return (
              <button key={m.key} onClick={() => toggle(m.key)} className={`chip ${on ? (m.delta > 0 ? 'border-z2 bg-z2 text-ink-0' : 'border-z5 bg-z5 text-ink-0') : ''}`}>
                <span className={`font-mono text-[11px] ${on ? '' : m.delta > 0 ? 'text-z2' : 'text-z5'}`}>{m.delta > 0 ? '+' : '−'}</span>
                {m.label}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <div className="flex items-end justify-between">
          <span className="label">How did you play?</span>
          <span className="font-display text-[26px] font-black uppercase leading-none">{FEEL[feel]}</span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={feel}
          onChange={(e) => setFeel(Number(e.target.value))}
          aria-label="How did you play, 1 to 10"
          className="feel mt-3 w-full"
          style={{ ['--p' as string]: `${((feel - 1) / 9) * 100}%` }}
        />
        <div className="mt-1 flex justify-between font-mono text-[10px] text-fg-4">
          <span>1</span>
          <span>{feel}/10</span>
          <span>10</span>
        </div>
      </div>

      <div>
        <div className="label mb-2">Notes</div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Calf was tight, keeper rotation killed us…"
          className={`${inputCls} h-auto py-3`}
        />
      </div>

      <button onClick={submit} disabled={busy} className="btn-primary h-14 w-full text-[17px] disabled:opacity-60">
        {busy ? 'Crunching…' : editing ? 'Save and re-rate' : 'Rate my game'}
      </button>
    </div>
  )
}
