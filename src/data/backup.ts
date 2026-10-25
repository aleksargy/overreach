// Keeps a copy of what you type (matches, workouts, weigh-ins, routines, settings)
// on your server, so a lost phone or a removed home-screen app doesn't take it
// with it. A copy goes up a few seconds after each change, and again when the app
// opens or syncs with one still waiting. The first time a phone with none of your
// data syncs, it takes the server's copy.

import { ApiError, getCopy, putCopy } from './api'
import { useStore } from './store'
import { useUi } from './ui'
import { BACKUP_KEYS, backupOf, counts, describe, hasContent } from '../lib/backup'

const DELAY_MS = 3_000
let timer: ReturnType<typeof setTimeout> | undefined
/** changes made so far, so one made while a copy is on its way isn't marked as sent */
let edits = 0

/** Only a phone that has synced talks to the server: before that it may have no passphrase, or a wrong one. */
const connected = () => {
  const { sync } = useStore.getState()
  return !!sync.passphrase && !!sync.lastSync
}

export async function pushCopy(): Promise<void> {
  clearTimeout(timer)
  timer = undefined
  const s = useStore.getState()
  if (!s.sync.copyPending || !connected()) return
  const at = edits
  try {
    const { savedAt } = await putCopy({ v: 1, savedAt: new Date().toISOString(), data: backupOf(s) })
    if (edits === at) useStore.getState().setSync({ copyPending: false, copyAt: savedAt })
  } catch (e) {
    // the server kept a fuller copy than this empty one: nothing to retry
    if (e instanceof ApiError && e.status === 409) useStore.getState().setSync({ copyPending: false })
    /* otherwise offline: it stays waiting and goes next time */
  }
}

async function restoreIfEmpty() {
  if (hasContent(backupOf(useStore.getState()))) return
  const saved = await getCopy().catch(() => null)
  if (!saved || !hasContent(saved.data)) return
  useStore.getState().mergeBackup(saved.data)
  useStore.getState().setSync({ copyPending: false, copyAt: saved.savedAt })
  useUi.getState().say(`Brought back ${describe(counts(saved.data))}`)
}

useStore.subscribe((s, prev) => {
  if (!s.hydrated) return
  // the app has just opened: a copy that didn't make it last time goes now
  if (!prev.hydrated) return void pushCopy()
  if (s.sync.lastSync !== prev.sync.lastSync) void (prev.sync.lastSync ? pushCopy() : restoreIfEmpty().then(pushCopy))
  if (BACKUP_KEYS.every((k) => s[k] === prev[k])) return
  edits++
  if (!s.sync.copyPending) s.setSync({ copyPending: true })
  clearTimeout(timer)
  timer = setTimeout(() => void pushCopy(), DELAY_MS)
})

// iOS can freeze a home-screen app soon after it's hidden, so a waiting copy goes straight away
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && timer && void pushCopy())
