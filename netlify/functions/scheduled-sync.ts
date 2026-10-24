// Once a day, early: fetch the newest data, then spend what's left of the run on
// history. Opening the app is the main trigger; this is the safety net that
// keeps the history whole when the app isn't opened for a while, and has the
// night's sleep and HRV waiting in the morning.
import { garmin } from '../lib/garmin'
import { apiKey } from '../lib/http'
import { blobs } from '../lib/kv'
import { runStep } from '../lib/sync'

export default async () => {
  const key = apiKey()
  if (!key) return
  const kv = blobs()
  // scheduled functions get 30 s
  const r = await runStep({ kv, api: garmin(key, kv), budgetMs: 18_000, forceRecent: true }).catch((e: unknown) => ({ message: String(e) }))
  console.log(r.message)
}

// cron runs in UTC
export const config = { schedule: '0 5 * * *' }
