import { ArchiveRestore, Check, CloudCheck, CloudUpload, Download, ExternalLink, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Screen } from '../../components/ui/Screen'
import { Field, Section, Segmented, Toggle, inputCls } from '../../components/ui/bits'
import { APP_NAME, APP_TAGLINE } from '../../config'
import { ApiError, getStatus, syncAll, type ServerStatus } from '../../data/api'
import { useStore } from '../../data/store'
import type { Race } from '../../data/types'
import { useUi } from '../../data/ui'
import { useWorld } from '../../data/world'
import { backupOf, counts, describe, readBackup } from '../../lib/backup'
import { ago, fmt } from '../../lib/format'
import { DISTANCES, formatGoal, parseGoal, typeGoal } from '../../lib/race'

export function SettingsScreen() {
  return (
    <Screen title="Settings" back>
      <Profile />
      <RaceSettings />
      <Garmin />
      <YourData />
      <footer className="mt-14 text-center">
        <div className="display text-[20px] font-extrabold leading-none">{APP_NAME}</div>
        <div className="meta mt-1.5 text-fg-4">{APP_TAGLINE}</div>
      </footer>
    </Screen>
  )
}

/** Just your name: heart rates and zones come from the watch, and the match log remembers your team, format and position. */
function Profile() {
  const name = useStore((s) => s.profile.name)
  const set = useStore((s) => s.setProfile)
  return (
    <Section title="You" className="!mt-0">
      <Field label="Name">
        <input value={name} onChange={(e) => set({ name: e.target.value })} className={inputCls} />
      </Field>
    </Section>
  )
}

/** Off unless you're training for something: then Run opens with a countdown and your goal pace, and afterwards the result. */
function RaceSettings() {
  const race = useStore((s) => s.profile.race)
  const set = useStore((s) => s.setProfile)
  const [goal, setGoal] = useState(race?.goalS ? formatGoal(race.goalS) : '')
  const [typing, setTyping] = useState(false)
  const update = (patch: Partial<Race>) => race && set({ race: { ...race, ...patch } })
  const goalOk = typing || !goal || (race && parseGoal(goal, race.distanceM) !== undefined)
  return (
    <Section title="Race">
      <div>
        <div className="flex items-center gap-3 pb-4">
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-semibold leading-5">Training for a race</span>
            <span className="meta block">Run opens with a countdown and your goal pace, then the result.</span>
          </span>
          <Toggle label="Training for a race" on={!!race} onChange={(on) => set({ race: on ? { date: '', distanceM: 42_195 } : undefined })} />
        </div>
        {race && (
          <div className="flex flex-col gap-4 border-t border-ink-2 py-4">
            <Segmented
              size="sm"
              value={race.distanceM}
              onChange={(m: number) => update({ distanceM: m, goalS: parseGoal(goal, m) })}
              options={DISTANCES.map((d) => ({ value: d.m as number, label: d.label }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Date">
                <input type="date" value={race.date} onChange={(e) => update({ date: e.target.value })} className={`${inputCls} tabular-nums`} />
              </Field>
              <Field label="Goal time" hint={goalOk ? undefined : race.distanceM >= 21_000 ? 'Like 3:30:00' : 'Like 19:30'}>
                <input
                  value={goal}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={race.distanceM >= 21_000 ? '3:30:00' : '19:30'}
                  onFocus={() => setTyping(true)}
                  onBlur={() => setTyping(false)}
                  onChange={(e) => {
                    const text = typeGoal(e.target.value, race.distanceM)
                    setGoal(text)
                    update({ goalS: parseGoal(text, race.distanceM) })
                  }}
                  className={`${inputCls} tabular-nums`}
                />
              </Field>
            </div>
          </div>
        )}
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
  const setUp = !sync.lastSync || sync.status === 'error'

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
      <div>
        <div className="flex items-center gap-3 pb-4">
          <span className={`h-2 w-2 shrink-0 rounded-full ${live ? 'bg-z2' : 'bg-warn'}`} />
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-semibold leading-5">{live ? 'Connected' : 'Showing sample data'}</span>
            <span className="meta block">
              {sync.lastSync ? `Last sync ${ago(sync.lastSync)}` : 'Never synced'}
              {garmin ? ` · ${garmin.activities.length} activities` : ''}
            </span>
          </span>
          {garmin && <Toggle label="Use Garmin data" on={sync.mode === 'live'} onChange={(on) => setSync({ mode: on ? 'live' : 'sample' })} />}
        </div>
        {/* how to connect, until it's connected, and again if a sync fails (a key that's run out, say) */}
        {setUp && (
          <ol className="border-t border-ink-2 py-3 text-[14.5px] leading-snug text-fg-2">
            {[
              <>
                Make a Personal API key in{' '}
                <a
                  href="https://connect.garmin.com/app/settings/personalApiToken"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-fg underline decoration-fg-4 underline-offset-2"
                >
                  Garmin Connect <ExternalLink size={12} />
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
        )}
        <div className="flex flex-col gap-3 border-t border-ink-2 pt-4">
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
          {sync.status === 'error' && sync.message && !busy && <p className="text-[13px] leading-snug text-bad">{sync.message}</p>}
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
  if (st.error) return <p className="text-[13px] leading-snug text-bad">{st.error}</p>
  const s = st.ok!
  if (!s.hasKey) return <p className="text-[13px] leading-snug text-bad">The passphrase works. Now add GARMIN_PERSONAL_API_KEY in Netlify and redeploy.</p>
  const warn = Object.keys(s.warnings ?? {})
  return (
    <div className="flex flex-col gap-1 text-[13px] leading-snug text-fg-3">
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-z2" />
        Server ready · {s.activities} activities · {s.days} days
      </span>
      {!s.backfillDone && s.activities > 0 && <span>History is still coming in. It carries on whenever the app is open and every morning on its own, so you can close it.</span>}
      {s.message && <span className="text-bad">{s.message}</span>}
      {warn.length > 0 && <span className="text-bad">Garmin didn’t send {warn.map((k) => WARN_LABEL[k] ?? k).join(', ')}. The rest synced fine.</span>}
    </div>
  )
}

/** "today at 14:32", "yesterday at 09:10", "3d ago" */
const when = (iso: string) => {
  const a = ago(iso)
  return a === 'today' || a === 'yesterday' ? `${a} at ${fmt(iso, 'HH:mm')}` : a
}

function Row({ icon, title, sub, onClick }: { icon: ReactNode; title: string; sub: string; onClick?: () => void }) {
  const inner = (
    <>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-2 text-fg-2">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold leading-5">{title}</span>
        <span className="meta block">{sub}</span>
      </span>
    </>
  )
  return onClick ? (
    <button onClick={onClick} className="flex w-full items-center gap-3 py-3.5 text-left transition-colors duration-150 active:bg-ink-2">
      {inner}
    </button>
  ) : (
    <div className="flex items-center gap-3 py-3.5">{inner}</div>
  )
}

const icon = { size: 18, strokeWidth: 1.75 }

function YourData() {
  const sync = useStore((s) => s.sync)
  const mergeBackup = useStore((s) => s.mergeBackup)
  const reset = useStore((s) => s.resetAll)
  const say = useUi((s) => s.say)
  const backupFile = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [sure, setSure] = useState(false)
  const connected = !!sync.passphrase && !!sync.lastSync

  const onBackup = async (f: File) => {
    let saved = null
    try {
      saved = readBackup(JSON.parse(await f.text()))
    } catch {
      /* not JSON */
    }
    if (!saved) return setResult({ ok: false, text: 'That file isn’t a backup from this app.' })
    const before = counts(backupOf(useStore.getState()))
    mergeBackup(saved)
    const after = counts(backupOf(useStore.getState()))
    const added = describe({ matches: after.matches - before.matches, workouts: after.workouts - before.workouts, body: after.body - before.body })
    setResult(added ? { ok: true, text: `Added ${added} from the backup.` } : { ok: true, text: 'Everything in that backup was already here.' })
  }

  const exportData = async () => {
    // the preview frame can't hand out files, so the button explains instead
    if (PREVIEW) return say('Backups download from the installed app')
    const name = `${APP_NAME.toLowerCase()}-backup-${fmt(new Date().toISOString(), 'yyyy-MM-dd')}.json`
    const file = new File([JSON.stringify({ app: APP_NAME, v: 1, exportedAt: new Date().toISOString(), ...backupOf(useStore.getState()) }, null, 2)], name, {
      type: 'application/json',
    })
    // a home-screen app on the phone can't always download, but the share sheet can save to Files
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] }).catch(() => {})
      return
    }
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <Section title="Your data">
      <div className="flex flex-col gap-2">
        <div className="list">
          {connected && (
            <Row
              icon={sync.copyPending ? <CloudUpload {...icon} /> : <CloudCheck {...icon} />}
              title="Copy on your server"
              sub={sync.copyPending ? 'Your latest changes are waiting to go up' : sync.copyAt ? `Up to date · ${when(sync.copyAt)}` : 'Updates a few seconds after each change'}
            />
          )}
          <Row icon={<Download {...icon} />} title="Export a backup" sub="Matches, workouts, exercises and weigh-ins as a file" onClick={() => void exportData()} />
          <Row
            icon={<ArchiveRestore {...icon} />}
            title="Restore from a backup"
            sub="Adds what’s in the file. Nothing here is replaced."
            onClick={() => backupFile.current?.click()}
          />
        </div>
        <input ref={backupFile} type="file" accept=".json,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && void onBackup(e.target.files[0])} />
        {result && (
          <p className={`tile flex gap-2 p-3.5 text-[13px] leading-snug ${result.ok ? 'text-fg-2' : 'text-bad'}`}>
            {result.ok && <Check size={16} className="mt-0.5 shrink-0 text-z2" />}
            {result.text}
          </p>
        )}
        <button
          onClick={() => {
            if (!sure) return setSure(true)
            reset()
            setSure(false)
            say('Everything reset')
          }}
          className={`press mt-2 h-12 rounded-full text-[14.5px] font-semibold ${sure ? 'bg-bad text-ink-0' : 'bg-bad/[0.13] text-bad'}`}
        >
          {sure ? 'Tap again to wipe everything on this phone' : 'Reset all data'}
        </button>
      </div>
    </Section>
  )
}
