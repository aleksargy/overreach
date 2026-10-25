// A stand-in for the Garmin Personal API: two and a half years of generated
// activities and health data behind the same paths, range limits and
// response shapes the real service uses, served through a fetch function.

import { Encoder, Profile, type Encodable, type Mesg } from '@garmin/fitsdk'
import { zipSync } from 'fflate'
import { rng } from '../src/lib/rng'

const DAY = 86_400_000

/** the SDK types writeMesg loosely as Mesg, so typed message fields need a cast */
const put = (enc: Encoder, m: { mesgNum: number } & Record<string, unknown>) => enc.writeMesg(m as Encodable<Mesg>)
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)

export interface FakeActivity {
  activityId: number
  activityName: string
  activityType: { typeKey: string }
  startTimeGMT: string
  duration: number
  distance: number
  averageHR: number
  maxHR: number
  averageSpeed: number
  hrTimeInZone_1?: number
  hrTimeInZone_2?: number
  hrTimeInZone_3?: number
  hrTimeInZone_4?: number
  hrTimeInZone_5?: number
}

export interface Fake {
  fetch: typeof fetch
  activities: FakeActivity[]
  calls: Record<string, number>
  /** answer the next n data requests with this status */
  failNext(status: number, n?: number): void
  /** answer every request under this path with 404, like an endpoint the key isn't allowed */
  breakPath(prefix: string): void
  /** answer requests under this path only after ms (0 to stop), giving up when the caller's signal does */
  slowPath(prefix: string, ms: number): void
  addActivity(a: Partial<FakeActivity> & { activityName: string; typeKey: string; daysAgo: number }): void
  now: Date
}

const gmt = (t: number) => new Date(t).toISOString().slice(0, 19).replace('T', ' ')

function jwt(exp: number) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'none' })}.${b64({ exp })}.sig`
}

/** A FIT file for a 5-a-side game: jogging with three clear sprints and a half-time pause. */
export function footballFit(start: Date, sprintsPerHalf = 3): Uint8Array {
  const r = rng(start.getTime())
  const enc = new Encoder()
  put(enc, { mesgNum: Profile.MesgNum.FILE_ID, type: 'activity', manufacturer: 'garmin', product: 1, timeCreated: start, serialNumber: 1 })
  let dist = 0
  const base = { lat: 51.5, lon: -0.12 }
  const half = 25 * 60
  const t0 = start.getTime()
  // records every second, except a five-minute half-time gap with none
  for (let s = 0; s < half * 2 + 300; s++) {
    if (s >= half && s < half + 300) continue
    const inHalf = s < half ? s : s - half - 300
    const sprint = Array.from({ length: sprintsPerHalf }, (_, i) => 240 + i * 420).some((k) => inHalf >= k && inHalf < k + 4)
    const v = sprint ? 6.4 : 1.6 + r() * 1.2
    dist += v
    put(enc, {
      mesgNum: Profile.MesgNum.RECORD,
      timestamp: new Date(t0 + s * 1000),
      heartRate: Math.round(sprint ? 182 : 150 + r() * 12),
      distance: dist,
      enhancedSpeed: v,
      positionLat: Math.round(((base.lat + Math.sin(s / 60) * 0.0002) * 2 ** 31) / 180),
      positionLong: Math.round(((base.lon + Math.cos(s / 45) * 0.0003) * 2 ** 31) / 180),
      enhancedAltitude: 20,
    })
  }
  put(enc, {
    mesgNum: Profile.MesgNum.LAP,
    timestamp: new Date(t0 + (half * 2 + 300) * 1000),
    startTime: start,
    totalElapsedTime: half * 2 + 300,
    totalTimerTime: half * 2,
    totalDistance: dist,
    avgHeartRate: 155,
  })
  put(enc, {
    mesgNum: Profile.MesgNum.SESSION,
    timestamp: new Date(t0 + (half * 2 + 300) * 1000),
    startTime: start,
    sport: 'soccer',
    totalTimerTime: half * 2,
    totalDistance: dist,
  })
  return enc.close()
}

/** A FIT file for a steady run or ride with laps every kilometre (run) or 5 km (ride). */
export function enduranceFit(start: Date, sport: 'run' | 'ride', durationS: number): Uint8Array {
  const r = rng(start.getTime() + 1)
  const enc = new Encoder()
  put(enc, { mesgNum: Profile.MesgNum.FILE_ID, type: 'activity', manufacturer: 'garmin', product: 1, timeCreated: start, serialNumber: 1 })
  const t0 = start.getTime()
  const lapM = sport === 'run' ? 1000 : 5000
  const base = sport === 'run' ? 3.1 : 7.5
  let dist = 0
  let lapStart = 0
  let lapDist = 0
  let hrSum = 0
  let hrN = 0
  let hrNow = 95
  for (let s = 0; s < durationS; s++) {
    const v = base + Math.sin(s / 240) * 0.25 + (r() - 0.5) * 0.3
    // a run's heart rate follows its pace, the climbs and time on feet; a ride's just wanders
    const grade = ((12 / 400) * Math.cos(s / 400)) / v
    const target = sport === 'run' ? 62 + 26 * v * (1 + 3.5 * Math.max(grade, 0)) + 0.05 * (s / 60) : 120 + Math.min(30, s / 30) + Math.sin(s / 300) * 6
    hrNow += (target - hrNow) / 25
    const hr = Math.round(hrNow + (r() - 0.5) * 2)
    dist += v
    lapDist += v
    hrSum += hr
    hrN++
    // "smart recording": a sample every few seconds, as most watches store them
    if (s % 3 === 0)
      put(enc, {
        mesgNum: Profile.MesgNum.RECORD,
        timestamp: new Date(t0 + s * 1000),
        heartRate: hr,
        distance: dist,
        enhancedSpeed: v,
        enhancedAltitude: 30 + Math.sin(s / 400) * 12,
        positionLat: Math.round(((51.5 + Math.sin(s / 900) * 0.01) * 2 ** 31) / 180),
        positionLong: Math.round(((-0.12 + Math.cos(s / 900) * 0.016) * 2 ** 31) / 180),
        ...(sport === 'ride' ? { power: Math.round(170 + Math.sin(s / 200) * 40 + (r() - 0.5) * 30), cadence: 85 } : { cadence: 84 }),
      })
    if (lapDist >= lapM || s === durationS - 1) {
      put(enc, {
        mesgNum: Profile.MesgNum.LAP,
        timestamp: new Date(t0 + s * 1000),
        startTime: new Date(t0 + lapStart * 1000),
        totalElapsedTime: s - lapStart + 1,
        totalTimerTime: s - lapStart + 1,
        totalDistance: lapDist,
        avgHeartRate: Math.round(hrSum / hrN),
        enhancedAvgSpeed: lapDist / (s - lapStart + 1),
      })
      lapStart = s + 1
      lapDist = 0
      hrSum = 0
      hrN = 0
    }
  }
  return enc.close()
}

/** FIT files are slow to encode and every test builds the same history, so they're shared */
const fits = new Map<string, Uint8Array>()

export function fakeGarmin(opts: { now?: Date; years?: number } = {}): Fake {
  const now = opts.now ?? new Date('2026-10-24T09:00:00Z')
  const days = Math.round((opts.years ?? 2.5) * 365)
  const r = rng('fake-garmin')
  const activities: FakeActivity[] = []
  let id = 9_000_000_000
  const plan = [
    { dow: 1, typeKey: 'running', name: 'Easy run', mins: 45 },
    { dow: 2, typeKey: 'soccer', name: '5-a-side', mins: 55 },
    { dow: 3, typeKey: 'strength_training', name: 'Strength', mins: 60 },
    { dow: 4, typeKey: 'road_biking', name: 'Commute', mins: 30 },
    { dow: 6, typeKey: 'lap_swimming', name: 'Pool swim', mins: 40 },
    { dow: 0, typeKey: 'running', name: 'Long run', mins: 95 },
  ]
  for (let d = days; d >= 1; d--) {
    const t = now.getTime() - d * DAY
    const p = plan.find((x) => x.dow === new Date(t).getUTCDay())
    if (!p || r() < 0.15) continue
    const start = new Date(Math.floor(t / DAY) * DAY + 18 * 3600_000)
    const duration = p.mins * 60
    const speed = p.typeKey === 'running' ? 3 : p.typeKey === 'road_biking' ? 7 : p.typeKey === 'lap_swimming' ? 0.8 : p.typeKey === 'soccer' ? 1.9 : 0
    activities.push({
      activityId: ++id,
      activityName: p.name,
      activityType: { typeKey: p.typeKey },
      startTimeGMT: gmt(start.getTime()),
      duration,
      distance: Math.round(speed * duration),
      averageHR: 140,
      maxHR: 178,
      averageSpeed: speed,
      ...(p.typeKey === 'running' ? { hrTimeInZone_1: 60, hrTimeInZone_2: duration - 600, hrTimeInZone_3: 400, hrTimeInZone_4: 140, hrTimeInZone_5: 0 } : {}),
    })
  }
  activities.reverse() // newest first, like the real search

  const calls: Record<string, number> = {}
  let failing: { status: number; left: number } | null = null
  const broken: string[] = []
  const slow = new Map<string, number>()
  const wait = (ms: number, signal?: AbortSignal | null) =>
    new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, ms)
      signal?.addEventListener('abort', () => (clearTimeout(t), reject(signal.reason)), { once: true })
    })
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  const bad = (status: number, why = '') => new Response(why, { status })
  const span = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY) + 1
  const datesIn = (a: string, b: string) => Array.from({ length: span(a, b) }, (_, i) => iso(Date.parse(a) + i * DAY))

  const handler = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const path = url.pathname
    const q = url.searchParams
    const key = path.replace(/\/\d[\d-]*/g, '/:x')
    calls[key] = (calls[key] ?? 0) + 1

    if (path === '/personalapitoken-service/personal-api/personal-api-key/token') {
      if (init?.method !== 'POST' || !String(new Headers(init?.headers).get('authorization')).startsWith('ApiKey ')) return bad(401)
      // tokens live in real time: the client checks them against the clock, not the simulated date
      return new Response(jwt(Math.floor(Date.now() / 1000) + 86_400))
    }
    // Open-Meteo, for run weather: a mild seasonal climate, hour by hour
    if (path === '/v1/archive' || path === '/v1/forecast') {
      const days = datesIn(q.get('start_date')!, q.get('end_date')!)
      const time = days.flatMap((d) => Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, '0')}:00`))
      const temperature_2m = time.map((t) => {
        const ms = Date.parse(`${t}Z`)
        const season = 11 + 7 * Math.sin((2 * Math.PI * (ms / DAY - 105)) / 365.25)
        return Math.round((season + 3.5 * Math.sin((2 * Math.PI * (new Date(ms).getUTCHours() - 9)) / 24)) * 10) / 10
      })
      return ok({
        latitude: Number(q.get('latitude')),
        longitude: Number(q.get('longitude')),
        hourly: { time, temperature_2m, dew_point_2m: temperature_2m.map((x) => Math.round((x - 4) * 10) / 10) },
      })
    }
    if (!String(new Headers(init?.headers).get('authorization')).startsWith('Bearer ')) return bad(401)
    if (broken.some((b) => path.startsWith(b))) return bad(404)
    for (const [prefix, ms] of slow) if (ms && path.startsWith(prefix)) await wait(ms, init?.signal)
    if (failing && failing.left > 0) {
      failing.left--
      return bad(failing.status, 'nope')
    }

    if (path === '/activitylist-service/activities/search/activities') {
      const start = Number(q.get('start') ?? 0)
      const limit = Number(q.get('limit') ?? 20)
      if (limit > 60) return bad(500)
      return ok(activities.slice(start, start + limit))
    }
    if (path === '/usersummary-service/v2/dailysummaries') {
      const a = q.get('startDate')!
      const b = q.get('endDate')!
      if (span(a, b) > 180) return bad(400)
      return ok(
        datesIn(a, b).map((d) => ({
          calendarDate: d,
          restingHeartRate: 46 + ((Date.parse(d) / DAY) % 5),
          totalSteps: 9000,
          averageStressLevel: d.endsWith('5') ? -1 : 28,
          bodyBatteryHighestValue: 80,
          bodyBatteryLowestValue: 20,
          sleepingSeconds: 26_000,
        })),
      )
    }
    let m = path.match(/^\/hrv-service\/hrv\/daily\/(\d{4}-\d\d-\d\d)\/(\d{4}-\d\d-\d\d)$/)
    if (m) {
      if (span(m[1], m[2]) > 180) return bad(400)
      return ok({ hrvSummaries: datesIn(m[1], m[2]).map((d) => ({ calendarDate: d, lastNightAvg: 60 + ((Date.parse(d) / DAY) % 9), weeklyAvg: 63 })) })
    }
    if (path === '/sleep-service/sleep/dailySleepSummariesByDate') {
      const a = q.get('startDate')!
      const b = q.get('endDate')!
      if (span(a, b) > 28) return bad(400)
      return ok(
        datesIn(a, b).map((d) => ({
          dailySleepDTO: {
            calendarDate: d,
            sleepTimeSeconds: 27_000,
            deepSleepSeconds: 5400,
            lightSleepSeconds: 14_400,
            remSleepSeconds: 6300,
            awakeSleepSeconds: 900,
            sleepScores: { overall: { value: 82 } },
          },
        })),
      )
    }
    m = path.match(/^\/weight-service\/weight\/range\/(\d{4}-\d\d-\d\d)\/(\d{4}-\d\d-\d\d)$/)
    if (m) {
      if (span(m[1], m[2]) > 365) return bad(400)
      const weighIns = datesIn(m[1], m[2]).filter((d) => new Date(d).getUTCDay() === 1)
      return ok({
        dailyWeightSummaries: weighIns.map((d) => ({
          summaryDate: d,
          allWeightMetrics: [{ samplePk: Date.parse(d), date: Date.parse(d) + 7 * 3600_000, calendarDate: d, weight: 78_400, bodyFat: 14.2 }],
        })),
      })
    }
    if (path === '/biometric-service/heartRateZones/v2') return ok([{ sport: 'DEFAULT', maxHeartRateUsed: 189, restingHeartRateUsed: 47 }])
    m = path.match(/^\/download-service\/files\/activity\/(\d+)$/)
    if (m) {
      const a = activities.find((x) => x.activityId === Number(m![1]))
      if (!a) return bad(404)
      const k = a.activityType.typeKey
      const key = `${a.activityId}|${k}|${a.startTimeGMT}|${a.duration}`
      if (!fits.has(key)) {
        const start = new Date(`${a.startTimeGMT.replace(' ', 'T')}Z`)
        const fit = k === 'running' ? enduranceFit(start, 'run', a.duration) : k === 'road_biking' ? enduranceFit(start, 'ride', a.duration) : footballFit(start)
        fits.set(key, zipSync({ [`${a.activityId}_ACTIVITY.fit`]: fit }))
      }
      return new Response(fits.get(key)!.slice())
    }
    return bad(404)
  }

  return {
    fetch: handler as typeof fetch,
    activities,
    calls,
    now,
    failNext(status, n = 1) {
      failing = { status, left: n }
    },
    breakPath(prefix) {
      broken.push(prefix)
    },
    slowPath(prefix, ms) {
      slow.set(prefix, ms)
    },
    addActivity(a) {
      const start = now.getTime() - a.daysAgo * DAY
      activities.unshift({
        activityId: 9_100_000_000 + activities.length,
        activityName: a.activityName,
        activityType: { typeKey: a.typeKey },
        startTimeGMT: gmt(start),
        duration: a.duration ?? 3300,
        distance: a.distance ?? 6000,
        averageHR: 150,
        maxHR: 184,
        averageSpeed: 1.8,
      })
    },
  }
}
