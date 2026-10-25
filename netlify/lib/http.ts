import { createHash, timingSafeEqual } from 'node:crypto'

/** Netlify's runtime exposes env through a global; plain Node (tests, scripts) has process.env. */
export function env(name: string): string | undefined {
  const netlify = (globalThis as { Netlify?: { env: { get(name: string): string | undefined } } }).Netlify
  return netlify?.env.get(name) ?? process.env[name]
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

const digest = (s: string) => createHash('sha256').update(s).digest()

/**
 * Every endpoint answers only requests carrying the passphrase set in Netlify.
 * Returns the response to send when the request isn't allowed, otherwise null.
 */
export function refuse(req: Request): Response | null {
  const pass = env('OVERREACH_PASSPHRASE')
  if (!pass) return json({ error: 'Add OVERREACH_PASSPHRASE to the site’s environment variables in Netlify, then redeploy.' }, 503)
  const given = req.headers.get('x-overreach-key') ?? ''
  if (!timingSafeEqual(digest(given), digest(pass))) return json({ error: 'That passphrase doesn’t match the one in Netlify.' }, 401)
  return null
}

export function apiKey(): string | null {
  return env('GARMIN_PERSONAL_API_KEY')?.trim() || null
}

/** OVERREACH_HISTORY_DAYS shortens the history walk, so trying your real account locally doesn't fetch two years */
export function historyDays(): number | undefined {
  const days = Number(env('OVERREACH_HISTORY_DAYS'))
  return Number.isFinite(days) && days >= 14 ? Math.min(Math.round(days), 730) : undefined
}

export const noKey = () => json({ error: 'Add GARMIN_PERSONAL_API_KEY to the site’s environment variables in Netlify, then redeploy.' }, 503)

export function failure(e: unknown): Response {
  const message = e instanceof Error ? e.message : String(e)
  console.error(message)
  return json({ error: message }, 502)
}
