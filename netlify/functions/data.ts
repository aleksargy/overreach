// GET /api/data: everything synced so far, for the phone to keep in IndexedDB.
import { json, refuse } from '../lib/http'
import { blobs } from '../lib/kv'
import { loadAll } from '../lib/sync'

export default async (req: Request) => {
  const no = refuse(req)
  if (no) return no
  const { state, data } = await loadAll(blobs())
  return json({
    activities: Object.values(data.activities).sort((a, b) => b.start.localeCompare(a.start)),
    dailies: Object.values(data.dailies).sort((a, b) => a.date.localeCompare(b.date)),
    body: Object.values(data.body).sort((a, b) => b.date.localeCompare(a.date)),
    profile: state.profile,
    updatedAt: state.lastSync ?? state.recentAt ?? null,
  })
}
