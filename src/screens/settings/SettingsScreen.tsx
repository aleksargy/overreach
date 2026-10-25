import { Check, Download, ExternalLink, RefreshCw, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Screen } from '../../components/ui/Screen'
import { Field, NumInput, Section, Segmented, Toggle, inputCls } from '../../components/ui/bits'
import { APP_NAME, APP_TAGLINE } from '../../config'
import { ApiError, getStatus, syncAll, type ServerStatus } from '../../data/api'
import { useStore } from '../../data/store'
import type { Format, Position } from '../../data/types'
import { useUi } from '../../data/ui'
import { useWorld } from '../../data/world'
import { FORMATS, POSITIONS } from '../../lib/football'
import { ago, fmt } from '../../lib/format'
import { importHevy } from '../../lib/hevy'
import { zoneBounds } from '../../lib/load'

export function SettingsScreen() {
  return (
    <Screen title="Settings" back>
      <Profile />
      <Garmin />
      <Football />
      <ImportExport />
      <footer className="mt-14 text-center">
        <div className="text-[17px] font-semibold tracking-[-0.02em]">{APP_NAME}</div>
        <div className="mt-1 text-[13px] text-fg-4">{APP_TAGLINE}</div>
      </footer>
    </Screen>
  )
}

function Profile() {
  const p = useStore((s) => s.profile)
  const set = useStore((s) => s.setProfile)
  const z = zoneBounds(p)
  return (
    <Section title="You" className="!mt-0">
      <div className="flex flex-col gap-4">
        <Field label="Name">
          <input value={p.name} onChange={(e) => set({ name: e.target.value })} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Max heart rate">
            <NumInput label="Max heart rate" value={p.hrMax} onChange={(v) => v && v > 120 && v < 230 && set({ hrMax: v })} className={`${inputCls} tabular-nums`} />
          </Field>
          <Field label="Resting heart rate">
            <NumInput label="Resting heart rate" value={p.hrRest} onChange={(v) => v && v > 30 && v < 100 && set({ hrRest: v })} className={`${inputCls} tabular-nums`} />
          </Field>
        </div>
        <div>
          <div className="flex h-1.5 gap-[3px]">
            {[1, 2, 3, 4, 5].map((i) => (
              <span key={i} className="flex-1 rounded-full" style={{ background: `rgb(var(--z${i}))` }} />
            ))}
          </div>
          <div className="mt-2 grid grid-cols-5 text-[12px] tabular-nums text-fg-3">
            {z.slice(0, 5).map((b, i) => (
              <span key={i}>
                Z{i + 1} <span className="text-fg-2">{Math.round(b)}+</span>
              </span>
            ))}
          </div>
          <p className="meta mt-2.5">Zones are 50, 60, 70, 80 and 90% of max. They drive training load across every sport.</p>
        </div>
      </div>
    </Section>
  )
}

function Football() {
  const p = useStore((s) => s.profile)
  const set = useStore((s) => s.setProfile)
  return (
    <Section title="Football">
      <div className="flex flex-col gap-4">
        <Field label="Your team">
          <input value={p.team} onChange={(e) => set({ team: e.target.value })} className={inputCls} />
        </Field>
        <div>
          <div className="label mb-2.5">Usual format</div>
          <Segmented size="sm" value={p.format} onChange={(v: Format) => set({ format: v })} options={FORMATS.map((f) => ({ value: f, label: `${f}s` }))} />
        </div>
        <div>
          <div className="label mb-2.5">Usual position</div>
          <Segmented size="sm" value={p.position} onChange={(v: Position) => set({ position: v })} options={POSITIONS.map((x) => ({ value: x.key, label: x.label }))} />
        </div>
      </div>
    </Section>
  )
}

const OFFLINE = 'Can’t reach the sync functions. They go live once the app is deployed to Netlify.'
const PREVIEW = import.meta.env.VITE_PREVIEW === '1'

/** What the server says about itself, checked whenever the passphrase settles. */
function useServerStatus(pass: string | undefined, bump: number) {
  const [st, setSt] = useState<{ ok?: ServerStatus; error?: string } | null>(null)
  useEffect(() => {
    if (!pass || PREVIEW) return setSt(null)
    let alive = true
    const t = setTimeout(() => {
      getStatus()
        .then((ok) => alive && setSt({ ok }))
        .catch((e: unknown) => {
          if (!alive) return
          const offline = !(e instanceof ApiError) || e.status === 404
          setSt({ error: offline ? OFFLINE : e.message })
        })
    }, 500)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [pass, bump])
  return st
}

function Garmin() {
  const sync = useStore((s) => s.sync)
  const setSync = useStore((s) => s.setSync)
  const garmin = useStore((s) => s.garmin)
  const w = useWorld()
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [bump, setBump] = useState(0)
  const server = useServerStatus(sync.passphrase, bump)
  const live = w.mode === 'live'

  const run = async () => {
    setBusy(true)
    setProgress('Connecting…')
    try {
      const added = await syncAll((s) => setProgress(s.done ? 'Loading it into the app…' : s.message))
      setProgress(added ? `Done: ${added} new ${added === 1 ? 'activity' : 'activities'}` : 'Up to date')
    } catch (e) {
      setProgress(null)
      const offline = !(e instanceof ApiError) || e.status === 404
      setSync({ status: 'error', message: offline ? OFFLINE : e.message })
    } finally {
      setBusy(false)
      setBump((n) => n + 1)
    }
  }

  return (
    <Section title="Garmin">
      <div className="card overflow-hidden">
        <div className="flex items-center gap-3 p-4">
          <span className={`h-2 w-2 shrink-0 rounded-full ${live ? 'bg-z2' : 'bg-warn'}`} />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium leading-5">{live ? 'Connected' : 'Showing sample data'}</span>
            <span className="meta block">
              {sync.lastSync ? `Last sync ${ago(sync.lastSync)}` : 'Never synced'}
              {garmin ? ` · ${garmin.activities.length} activities` : ''}
            </span>
          </span>
          {garmin && <Toggle label="Use Garmin data" on={sync.mode === 'live'} onChange={(on) => setSync({ mode: on ? 'live' : 'sample' })} />}
        </div>
        <ol className="mx-4 border-t border-line py-3 text-[14px] leading-snug text-fg-2">
          {[
            <>
              Get a Personal API key from the{' '}
              <a
                href="https://developer.garmin.com/gc-developer-program/overview/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-fg underline decoration-fg-4 underline-offset-2"
              >
                Garmin developer programme <ExternalLink size={12} />
              </a>
              .
            </>,
            <>
              In Netlify, add two environment variables: <code className="font-mono text-[12.5px] text-fg">GARMIN_PERSONAL_API_KEY</code> and a passphrase of your choice as{' '}
              <code className="font-mono text-[12.5px] text-fg">OVERREACH_PASSPHRASE</code>.
            </>,
            <>Type the same passphrase here and sync. The key never leaves the server.</>,
          ].map((step, i) => (
            <li key={i} className="flex gap-3 py-1.5">
              <span className="w-4 shrink-0 text-[14px] font-medium tabular-nums text-fg-4">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <div className="mx-4 flex flex-col gap-3 border-t border-line py-4">
          <Field label="Passphrase">
            <input
              type="password"
              autoComplete="current-password"
              value={sync.passphrase ?? ''}
              onChange={(e) => setSync({ passphrase: e.target.value })}
              placeholder="The one you set in Netlify"
              className={inputCls}
            />
          </Field>
          <button onClick={run} disabled={busy || !sync.passphrase} className="btn-primary w-full disabled:opacity-40">
            <RefreshCw size={16} className={busy ? 'animate-spin' : ''} /> {busy ? 'Syncing…' : 'Sync now'}
          </button>
          {progress && <p className="meta">{progress}</p>}
          {sync.status === 'error' && sync.message && !busy && <p className="text-[13px] leading-snug text-warn">{sync.message}</p>}
          {PREVIEW && <p className="text-[12.5px] leading-snug text-fg-3">This preview runs on sample data. Sync works once the app is on Netlify.</p>}
          {server && !busy && <ServerLine st={server} />}
        </div>
      </div>
    </Section>
  )
}

const WARN_LABEL: Record<string, string> = {
  activities: 'activities',
  dailies: 'daily summaries',
  hrv: 'HRV',
  sleep: 'sleep',
  weight: 'weight',
  zones: 'heart rate zones',
  fit: 'a FIT file',
}

function ServerLine({ st }: { st: { ok?: ServerStatus; error?: string } }) {
  if (st.error) return <p className="text-[13px] leading-snug text-warn">{st.error}</p>
  const s = st.ok!
  if (!s.hasKey) return <p className="text-[13px] leading-snug text-warn">The passphrase works. Now add GARMIN_PERSONAL_API_KEY in Netlify and redeploy.</p>
  const warn = Object.keys(s.warnings ?? {})
  return (
    <div className="flex flex-col gap-1 text-[13px] leading-snug text-fg-3">
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-z2" />
        Server ready · {s.activities} activities · {s.days} days
      </span>
      {!s.backfillDone && s.activities > 0 && <span>History is still coming in. It carries on whenever the app is open and every morning on its own, so you can close it.</span>}
      {s.message && <span className="text-warn">{s.message}</span>}
      {warn.length > 0 && <span className="text-warn">Garmin didn’t send {warn.map((k) => WARN_LABEL[k] ?? k).join(', ')}. The rest synced fine.</span>}
    </div>
  )
}

function ImportExport() {
  const w = useWorld()
  const importWorkouts = useStore((s) => s.importWorkouts)
  const reset = useStore((s) => s.resetAll)
  const say = useUi((s) => s.say)
  const file = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<string | null>(null)
  const [sure, setSure] = useState(false)

  const onFile = async (f: File) => {
    try {
      const r = importHevy(await f.text(), w.exercises)
      importWorkouts(r.workouts, r.exercises)
      setResult(
        `Imported ${r.workouts.length} workouts from ${r.rows} sets.${r.exercises.length ? ` ${r.exercises.length} exercises were new, so they’re now custom exercises: set their muscle group under Exercises in Lift.` : ''}`,
      )
      say(`Imported ${r.workouts.length} workouts`)
    } catch (e) {
      setResult(e instanceof Error ? e.message : String(e))
    }
  }

  const exportData = () => {
    // the preview frame can't hand out files, so the button explains instead
    if (import.meta.env.VITE_PREVIEW === '1') return say('Backups download from the installed app')
    const s = useStore.getState()
    const data = {
      app: APP_NAME,
      exportedAt: new Date().toISOString(),
      profile: s.profile,
      matches: s.matches,
      workouts: s.workouts,
      customExercises: s.customExercises,
      exerciseEdits: s.exerciseEdits,
      routines: s.routines,
      body: s.body,
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${APP_NAME.toLowerCase()}-backup-${fmt(new Date().toISOString(), 'yyyy-MM-dd')}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <Section title="Your data">
      <div className="flex flex-col gap-2">
        <button onClick={() => file.current?.click()} className="press card flex items-center gap-3 p-4 text-left">
          <Upload size={18} strokeWidth={1.75} className="shrink-0 text-fg-2" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium leading-5">Import from Hevy</span>
            <span className="meta block">In Hevy: Settings, Export data, Export workouts. Pick the CSV here.</span>
          </span>
        </button>
        <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
        {result && (
          <p className="card flex gap-2 p-3.5 text-[13px] leading-snug text-fg-2">
            <Check size={16} className="mt-0.5 shrink-0 text-z2" />
            {result}
          </p>
        )}
        <button onClick={exportData} className="press card flex items-center gap-3 p-4 text-left">
          <Download size={18} strokeWidth={1.75} className="shrink-0 text-fg-2" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium leading-5">Export a backup</span>
            <span className="meta block">Matches, workouts, exercises and weigh-ins as JSON. Garmin data can always be synced again.</span>
          </span>
        </button>
        <button
          onClick={() => {
            if (!sure) return setSure(true)
            reset()
            setSure(false)
            say('Everything reset')
          }}
          className={`press mt-2 h-12 rounded-full text-[14px] font-medium ${sure ? 'bg-bad text-ink-0' : 'text-bad/80 ring-1 ring-inset ring-bad/25'}`}
        >
          {sure ? 'Tap again to wipe everything on this phone' : 'Reset all data'}
        </button>
      </div>
    </Section>
  )
}
