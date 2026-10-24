// POST /api/sync: run one bounded sync step. The phone calls it until `done`.
import { garmin } from '../lib/garmin'
import { apiKey, failure, json, noKey, refuse } from '../lib/http'
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
    // well inside the 60 s function limit, with room to write the results
    return json(await runStep({ kv, api: garmin(key, kv), budgetMs: 25_000, forceRecent: new URL(req.url).searchParams.has('fresh') }))
  } catch (e) {
    return failure(e)
  }
}
