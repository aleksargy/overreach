// Garmin Personal API client. The API key is swapped for a JWT (about 24 hours),
// which is cached in the store so every function call doesn't exchange again.
// Endpoints and limits: see the garmin-personal-api project memory.

import { createHash } from 'node:crypto'
import type { KV } from './kv'

export const GARMIN_HOST = 'https://personal.connectapi.garmin.com'
const TOKEN_PATH = '/personalapitoken-service/personal-api/personal-api-key/token'
/** exchange again when less than this is left on the token */
const REFRESH_S = 60 * 60

export class GarminError extends Error {
  constructor(
    public status: number,
    public path: string,
    body = '',
  ) {
    super(
      status === 429
        ? 'Garmin asked us to slow down. Sync carries on in the background later.'
        : `Garmin answered ${status} on ${path.split('?')[0]}${body ? `: ${body.slice(0, 160)}` : ''}`,
    )
  }
}

export interface Garmin {
  get<T = unknown>(path: string, query?: Record<string, string | number | undefined>): Promise<T | null>
  bytes(path: string): Promise<Uint8Array>
  /** requests made so far, for budgeting */
  readonly calls: number
}

interface CachedToken {
  jwt: string
  exp: number
  fp: string
}

function jwtExp(jwt: string): number {
  const part = jwt.split('.')[1]
  if (!part) throw new Error('Garmin’s token endpoint didn’t return a token. Check the API key.')
  const exp = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')).exp
  if (typeof exp !== 'number') throw new Error('Garmin’s token has no expiry.')
  return exp
}

export function garmin(apiKey: string, kv: KV, opts: { fetch?: typeof fetch; host?: string } = {}): Garmin {
  const f = opts.fetch ?? fetch
  const host = (opts.host ?? GARMIN_HOST).replace(/\/$/, '')
  // the cached token is only reused for the same key and host; the key itself is never stored
  const fp = createHash('sha256').update(`${host}\0${apiKey}`).digest('hex').slice(0, 24)
  let cached: CachedToken | null = null
  let calls = 0

  async function token(force = false): Promise<string> {
    const now = Date.now() / 1000
    if (!force) {
      cached ??= await kv.get<CachedToken>('token')
      if (cached && cached.fp === fp && cached.exp - now > REFRESH_S) return cached.jwt
    }
    calls++
    const res = await f(`${host}${TOKEN_PATH}`, {
      method: 'POST',
      headers: { Accept: '*/*', Authorization: `ApiKey ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(
        res.status === 401 || res.status === 403
          ? 'Garmin turned the API key down. It may have expired: make a new one in Garmin Connect and update GARMIN_PERSONAL_API_KEY in Netlify.'
          : `Couldn’t swap the API key for a token (${res.status}${body ? `: ${body.slice(0, 120)}` : ''}).`,
      )
    }
    const jwt = (await res.text()).trim()
    cached = { jwt, exp: jwtExp(jwt), fp }
    await kv.set('token', cached)
    return jwt
  }

  async function request(path: string, accept: string, retried = false): Promise<Response> {
    calls++
    const res = await f(`${host}${path}`, {
      headers: { Accept: accept, Authorization: `Bearer ${await token()}` },
      signal: AbortSignal.timeout(20_000),
    })
    if (res.status === 401 && !retried) {
      // revoked or expired early: exchange the key once more
      await token(true)
      return request(path, accept, true)
    }
    if (!res.ok) throw new GarminError(res.status, path, await res.text().catch(() => ''))
    return res
  }

  return {
    get calls() {
      return calls
    },
    async get<T>(path: string, query?: Record<string, string | number | undefined>) {
      const qs = new URLSearchParams()
      for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) qs.set(k, String(v))
      const q = qs.toString()
      const res = await request(q ? `${path}?${q}` : path, 'application/json')
      const text = await res.text()
      return text ? (JSON.parse(text) as T) : null
    },
    async bytes(path: string) {
      const res = await request(path, '*/*')
      return new Uint8Array(await res.arrayBuffer())
    },
  }
}
