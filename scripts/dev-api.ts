// Local stand-in for the Netlify functions, for working on the app without a
// Garmin key: the real handlers, a local Blobs store and a fake Garmin with
// generated history. Vite proxies /api here in dev.
//   npm run dev:api   (passphrase: dev)
import { BlobsServer } from '@netlify/blobs/server'
import { createServer } from 'node:http'
import { fakeGarmin } from '../tests/fake-garmin'

const PORT = 8788
const fake = fakeGarmin({ now: new Date(), years: 1 })
const blobs = new BlobsServer({ directory: '.netlify/dev-blobs', token: 'dev' })
const { port: blobsPort } = await blobs.start()
const blobsUrl = `http://localhost:${blobsPort}`
process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ edgeURL: blobsUrl, uncachedEdgeURL: blobsUrl, siteID: 'dev', token: 'dev' })).toString('base64')
process.env.GARMIN_PERSONAL_API_KEY ??= 'fake-key'
process.env.OVERREACH_PASSPHRASE ??= 'dev'

const realFetch = globalThis.fetch
// Garmin and the weather service both answer from the fake, so this works offline
const faked = ['https://personal.connectapi.garmin.com', 'https://archive-api.open-meteo.com', 'https://api.open-meteo.com']
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
  faked.some((host) => String(input instanceof Request ? input.url : input).startsWith(host)) ? fake.fetch(input, init) : realFetch(input, init)) as typeof fetch

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  const name = url.pathname.replace(/^\/api\//, '').replace(/[^a-z-]/g, '')
  try {
    const mod = (await import(`../netlify/functions/${name}.ts`)) as { default: (r: Request) => Promise<Response | undefined> }
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
    const out = (await mod.default(new Request(url, { method: req.method, headers }))) ?? new Response(null, { status: 204 })
    res.writeHead(out.status, Object.fromEntries(out.headers))
    res.end(Buffer.from(await out.arrayBuffer()))
  } catch (e) {
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
  }
}).listen(PORT, () => console.log(`fake API on http://localhost:${PORT} · passphrase "${process.env.OVERREACH_PASSPHRASE}" · ${fake.activities.length} activities`))
