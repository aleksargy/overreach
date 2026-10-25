// POST /api/sync: run one bounded sync step. The phone calls it until `done`.
import { garmin } from '../lib/garmin'
import { apiKey, failure, historyDays, json, noKey, refuse } from '../lib/http'
import { blobs } from '../lib/kv'
import { runStep } from '../lib/sync'

export default async (req: Request) => {
  const no = refuse(req)
  if (no) return no
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)
  const key = apiKey()
  if (!key) return noKey()
  const kv = blobs()
  try {
    // Netlify's docs give synchronous functions 30 s in one place and 60 s in another, so plan for 30:
    // Garmin requests stop by 24 s, which leaves time to write the results
    return json(await runStep({ kv, api: garmin(key, kv), budgetMs: 20_000, forceRecent: new URL(req.url).searchParams.has('fresh'), historyDays: historyDays() }))
  } catch (e) {
    return failure(e)
  }
}
