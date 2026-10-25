// GET /api/user: the copy of what you've typed into the app (matches, workouts,
// weigh-ins, routines, settings), kept here so a lost phone doesn't lose it.
// PUT /api/user: replace it. An empty copy never replaces one with something in it.
import { json, refuse } from '../lib/http'
import { blobs } from '../lib/kv'

interface Copy {
  v: 1
  savedAt: string
  data: Record<string, unknown>
}

const LISTS = ['matches', 'hiddenMatchIds', 'workouts', 'customExercises', 'routines', 'body']

const isCopy = (x: unknown): x is Copy => {
  const c = x as Copy | null
  return !!c && c.v === 1 && typeof c.savedAt === 'string' && !!c.data && typeof c.data === 'object' && LISTS.every((k) => c.data[k] === undefined || Array.isArray(c.data[k]))
}

const hasContent = (c: Copy) => ['matches', 'workouts', 'body', 'customExercises'].some((k) => (c.data[k] as unknown[] | undefined)?.length)

export default async (req: Request) => {
  const no = refuse(req)
  if (no) return no
  const kv = blobs()
  if (req.method === 'GET') return json(await kv.get<Copy>('user'))
  if (req.method !== 'PUT') return json({ error: 'Use GET or PUT.' }, 405)
  const copy: unknown = await req.json().catch(() => null)
  if (!isCopy(copy)) return json({ error: 'That isn’t a copy of your data.' }, 400)
  const saved = await kv.get<Copy>('user')
  if (saved && hasContent(saved) && !hasContent(copy)) return json({ error: 'The server’s copy has your data in it and this one is empty, so it was kept.' }, 409)
  await kv.set('user', copy)
  return json({ savedAt: copy.savedAt })
}
