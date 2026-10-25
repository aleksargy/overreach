// Local stand-in for the Netlify functions: the real handlers and a local Blobs
// store, so the app can be worked on without deploying. Vite proxies /api here.
//   npm run dev:api    a fake Garmin with a year of generated history (passphrase "dev")
//   npm run dev:real   your real Garmin account, with the key from .env.local through
//                      varlock and a store of its own, so real data never mixes with fake
// Only this Mac can reach it: it listens on 127.0.0.1. `--port` and `--blobs <dir>`
// let npm run screens run its own copy next to yours.
import { BlobsServer } from '@netlify/blobs/server'
import { createServer } from 'node:http'
import { fakeGarmin } from '../tests/fake-garmin'

const arg = (name: string) => process.argv[process.argv.indexOf(name) + 1]
const PORT = process.argv.includes('--port') ? Number(arg('--port')) : 8788
const real = process.argv.includes('--real')

if (real && !process.env.GARMIN_PERSONAL_API_KEY) {
  console.error('No GARMIN_PERSONAL_API_KEY. Put it in .env.local (see README, "Your Garmin key") and start with npm run dev:real.')
  process.exit(1)
}

const blobs = new BlobsServer({ directory: process.argv.includes('--blobs') ? arg('--blobs') : real ? '.netlify/real-blobs' : '.netlify/dev-blobs', token: 'dev' })
const { port: blobsPort } = await blobs.start()
const blobsUrl = `http://localhost:${blobsPort}`
process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ edgeURL: blobsUrl, uncachedEdgeURL: blobsUrl, siteID: 'dev', token: 'dev' })).toString('base64')
const ownPassphrase = !!process.env.OVERREACH_PASSPHRASE
process.env.OVERREACH_PASSPHRASE ??= 'dev'

let banner = 'your real Garmin account'
if (!real) {
  const fake = fakeGarmin({ now: new Date(), years: 1 })
  process.env.GARMIN_PERSONAL_API_KEY ??= 'fake-key'
  const realFetch = globalThis.fetch
  // Garmin and the weather service both answer from the fake, so this works offline
  const faked = ['https://personal.connectapi.garmin.com', 'https://archive-api.open-meteo.com', 'https://api.open-meteo.com']
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
    faked.some((host) => String(input instanceof Request ? input.url : input).startsWith(host)) ? fake.fetch(input, init) : realFetch(input, init)) as typeof fetch
  banner = `a fake Garmin with ${fake.activities.length} activities`
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  const name = url.pathname.replace(/^\/api\//, '').replace(/[^a-z-]/g, '')
  try {
    const mod = (await import(`../netlify/functions/${name}.ts`)) as { default: (r: Request) => Promise<Response | undefined> }
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const body = chunks.length ? Buffer.concat(chunks) : undefined
    const out = (await mod.default(new Request(url, { method: req.method, headers, body }))) ?? new Response(null, { status: 204 })
    res.writeHead(out.status, Object.fromEntries(out.headers))
    res.end(Buffer.from(await out.arrayBuffer()))
  } catch (e) {
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
  }
}).listen(PORT, '127.0.0.1', () => {
  const days = process.env.OVERREACH_HISTORY_DAYS ? ` · history ${process.env.OVERREACH_HISTORY_DAYS} days` : ''
  console.log(`API on http://127.0.0.1:${PORT} · ${banner}${days} · passphrase ${ownPassphrase ? 'from .env.local' : '"dev"'}`)
})
