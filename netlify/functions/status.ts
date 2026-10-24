// GET /api/status: is the server set up, and how far has sync got?
import { apiKey, env, json, refuse } from '../lib/http'
import { blobs } from '../lib/kv'
import { isCaughtUp, loadAll } from '../lib/sync'

export default async (req: Request) => {
  const no = refuse(req)
  if (no) return no
  const kv = blobs()
  const { state, data } = await loadAll(kv)
  const body: Record<string, unknown> = {
    configured: !!apiKey() && !!env('OVERREACH_PASSPHRASE'),
    hasKey: !!apiKey(),
    lastSync: state.lastSync,
    activities: Object.keys(data.activities).length,
    days: Object.keys(data.dailies).length,
    backfillDone: isCaughtUp(state),
    pending: state.pending.length,
    message: state.error?.message,
    warnings: state.warnings,
  }
  // field names (never values) of each Garmin response, for fixing a mapping that misses something
  if (new URL(req.url).searchParams.has('shapes')) body.shapes = await kv.get('shapes')
  return json(body)
}
