// Hourly: fetch the newest data, then spend what's left of the run on history,
// so the app has everything when you open it.
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

export const config = { schedule: '@hourly' }
