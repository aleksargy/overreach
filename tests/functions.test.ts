// The deployed functions end to end: real request handling and a local Netlify
// Blobs server, with Garmin's host answered by the fake.

import { BlobsServer } from '@netlify/blobs/server'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { fakeGarmin } from './fake-garmin'

const fake = fakeGarmin({ years: 0.4 })
const server = new BlobsServer({ directory: mkdtempSync(join(tmpdir(), 'blobs-')), token: 'local' })
const realFetch = globalThis.fetch
const PASS = 'correct horse battery staple'

before(async () => {
  const { port } = await server.start()
  const url = `http://localhost:${port}`
  process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ edgeURL: url, uncachedEdgeURL: url, siteID: 'site', token: 'local' })).toString('base64')
  process.env.GARMIN_PERSONAL_API_KEY = 'personal-api-key'
  process.env.OVERREACH_PASSPHRASE = PASS
  const faked = ['https://personal.connectapi.garmin.com', 'https://archive-api.open-meteo.com', 'https://api.open-meteo.com']
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
    faked.some((host) => String(input instanceof Request ? input.url : input).startsWith(host)) ? fake.fetch(input, init) : realFetch(input, init)) as typeof fetch
})

after(async () => {
  globalThis.fetch = realFetch
  await server.stop()
})

async function call(fn: string, opts: { query?: string; method?: string; pass?: string } = {}) {
  const mod = (await import(`../netlify/functions/${fn}.ts`)) as { default: (req: Request) => Promise<Response> }
  const res = await mod.default(
    new Request(`https://overreach.test/api/${fn}${opts.query ?? ''}`, { method: opts.method ?? 'GET', headers: { 'x-overreach-key': opts.pass ?? PASS } }),
  )
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

test('refuses a wrong or missing passphrase', async () => {
  const r = await call('status', { pass: 'guess' })
  assert.equal(r.status, 401)
  assert.match(String(r.body.error), /passphrase/)
  delete process.env.OVERREACH_PASSPHRASE
  const r2 = await call('status')
  assert.equal(r2.status, 503)
  process.env.OVERREACH_PASSPHRASE = PASS
})

test('sync only takes POST', async () => {
  assert.equal((await call('sync')).status, 405)
})

test('syncs to the end, then serves the data, streams and status', async () => {
  let steps = 0
  for (; steps < 30; steps++) {
    const r = await call('sync', { method: 'POST', query: steps === 0 ? '?fresh=1' : '' })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    if (r.body.done) break
  }
  assert.ok(steps < 30)

  const data = await call('data')
  const acts = data.body.activities as { id: string; start: string; sport: string; football?: { sprints: number }; run?: { spd: number[]; tempC?: number } }[]
  const days = data.body.dailies as { date: string }[]
  assert.equal(acts.length, fake.activities.length)
  assert.ok(acts[0].start > acts[acts.length - 1].start, 'newest first')
  assert.ok(days[0].date < days[days.length - 1].date, 'oldest day first')
  assert.deepEqual(data.body.profile && { hrMax: (data.body.profile as { hrMax: number }).hrMax }, { hrMax: 189 })
  assert.ok(acts.filter((a) => a.sport === 'football').every((a) => a.football?.sprints === 6))
  // runs arrive ready for the running analysis
  assert.ok(acts.filter((a) => a.sport === 'run').every((a) => a.run?.spd.length && typeof a.run.tempC === 'number'))

  // a ride's stream is read from its FIT file once, then served from the store
  const ride = acts.find((a) => a.sport === 'ride')!
  const downloads = () => fake.calls['/download-service/files/activity/:x'] ?? 0
  const before = downloads()
  const s1 = await call('stream', { query: `?id=${ride.id}` })
  assert.equal(s1.status, 200)
  assert.ok((s1.body.hr as number[]).length > 100)
  assert.equal(downloads(), before + 1)
  await call('stream', { query: `?id=${ride.id}` })
  assert.equal(downloads(), before + 1)
  // runs were read during the sync, so opening one costs Garmin nothing
  const run = acts.find((a) => a.sport === 'run')!
  assert.equal((await call('stream', { query: `?id=${run.id}` })).status, 200)
  assert.equal(downloads(), before + 1)
  assert.equal((await call('stream', { query: '?id=nope' })).status, 400)

  // opening the app again straight away doesn't go to Garmin; Sync now does
  const total = () => Object.values(fake.calls).reduce((a, b) => a + b, 0)
  const quiet = total()
  assert.equal((await call('sync', { method: 'POST' })).status, 200)
  assert.equal(total(), quiet)
  await call('sync', { method: 'POST', query: '?fresh=1' })
  assert.ok(total() > quiet)

  const status = await call('status', { query: '?shapes' })
  assert.equal(status.body.backfillDone, true)
  assert.equal(status.body.activities, fake.activities.length)
  // shapes describe fields without carrying any values
  const shapes = JSON.stringify(status.body.shapes)
  assert.match(shapes, /"lastNightAvg":"number"/)
  assert.doesNotMatch(shapes, /78400|Easy run/)
})
