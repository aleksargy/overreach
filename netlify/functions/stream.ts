// GET /api/stream?id=g-123: an activity's samples and laps, read from its FIT
// file the first time and kept in the store after that.
import type { GarminActivity, Stream } from '../../src/data/types'
import { fitFromDownload, streamFromFit } from '../lib/fit'
import { garmin } from '../lib/garmin'
import { apiKey, failure, json, noKey, refuse } from '../lib/http'
import { blobs } from '../lib/kv'

export default async (req: Request) => {
  const no = refuse(req)
  if (no) return no
  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!/^g-\d+$/.test(id)) return json({ error: 'Unknown activity.' }, 400)
  const kv = blobs()
  const cached = await kv.get<Stream>(`stream/${id}`)
  if (cached) return json(cached)
  const a = (await kv.get<Record<string, GarminActivity>>('activities'))?.[id]
  if (!a?.garminId) return json({ error: 'Unknown activity.' }, 404)
  const key = apiKey()
  if (!key) return noKey()
  try {
    const stream = streamFromFit(fitFromDownload(await garmin(key, kv).bytes(`/download-service/files/activity/${a.garminId}`)), id, a.sport)
    await kv.set(`stream/${id}`, stream)
    return json(stream)
  } catch (e) {
    return failure(e)
  }
}
