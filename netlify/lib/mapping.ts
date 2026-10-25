// Garmin JSON → the app's types. Garmin's services wrap lists differently and
// rename fields between versions, so every read is tolerant: several candidate
// keys, numbers that might arrive as strings, and nothing assumed present.

import type { BodyEntry, Daily, GarminActivity, GarminView, Sport, ZoneSeconds } from '../../src/data/types'

export type Obj = Record<string, unknown>

export const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x)

export function num(o: unknown, ...keys: string[]): number | undefined {
  if (!isObj(o)) return undefined
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  }
  return undefined
}

/** o.a.b, or undefined as soon as a step isn't an object */
export const at = (o: unknown, ...path: string[]): unknown => path.reduce<unknown>((x, k) => (isObj(x) ? x[k] : undefined), o)

export function str(o: unknown, ...keys: string[]): string | undefined {
  if (!isObj(o)) return undefined
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'string' && v.trim() !== '') return v
  }
  return undefined
}

/** A list from a bare array, a named property, or failing that the first array of objects. */
export function list(res: unknown, ...keys: string[]): Obj[] {
  if (Array.isArray(res)) return res.filter(isObj)
  if (!isObj(res)) return []
  for (const k of keys) if (Array.isArray(res[k])) return (res[k] as unknown[]).filter(isObj)
  for (const v of Object.values(res)) if (Array.isArray(v) && v.some(isObj)) return v.filter(isObj)
  return []
}

/** "2024-03-02 09:15:23" (GMT) → ISO */
export function gmtToIso(s: string): string | undefined {
  const iso = s.trim().replace(' ', 'T')
  const t = Date.parse(/(Z|[+-]\d\d:?\d\d)$/i.test(iso) ? iso : `${iso}Z`)
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined
}

const FOOTBALL_NAME = /football|soccer|futsal|footy|\b\d+\s?-?\s?a\s?-?\s?side\b|\bfive\s?-?\s?a\s?-?\s?side\b/i

export function sportOf(typeKey: string, name = ''): Sport {
  const k = typeKey.toLowerCase()
  if (/american_football|rugby/.test(k)) return 'other'
  if (/soccer|futsal|football/.test(k)) return 'football'
  if (/swim/.test(k)) return 'swim'
  if (/cycl|bik|ride|gravel|mountain|velo/.test(k)) return 'ride'
  if (/run/.test(k)) return 'run'
  if (/strength|hiit|weight|crossfit/.test(k)) return 'strength'
  // plenty of people log 5-a-side as "Other" and rename it
  if (FOOTBALL_NAME.test(name)) return 'football'
  return 'other'
}

const DEFAULT_NAME: Record<Sport, string> = { run: 'Run', ride: 'Ride', swim: 'Swim', football: 'Football', strength: 'Strength', other: 'Activity' }

function runKind(g: Obj, distanceM = 0): string {
  if (str(isObj(g.eventType) ? g.eventType : undefined, 'typeKey') === 'race') return 'race'
  const label = (str(g, 'trainingEffectLabel') ?? '').toUpperCase()
  const name = str(g, 'activityName') ?? ''
  if (/VO2|ANAEROBIC|SPRINT/.test(label) || /interval|reps|\d+\s?x\s?\d+|fartlek|track/i.test(name)) return 'intervals'
  if (/THRESHOLD|TEMPO/.test(label) || /tempo|threshold/i.test(name)) return 'tempo'
  if (distanceM >= 16_000) return 'long'
  return 'easy'
}

export function mapActivity(g: Obj): GarminActivity | null {
  const garminId = num(g, 'activityId')
  if (!garminId) return null
  const typeKey = str(isObj(g.activityType) ? g.activityType : undefined, 'typeKey') ?? str(g, 'activityType') ?? ''
  const name = str(g, 'activityName') ?? ''
  const sport = sportOf(typeKey, name)
  const startGmt = str(g, 'startTimeGMT')
  const beginTs = num(g, 'beginTimestamp')
  const start = startGmt ? gmtToIso(startGmt) : beginTs ? new Date(beginTs).toISOString() : undefined
  if (!start) return null

  const distanceM = num(g, 'distance')
  const zs = [1, 2, 3, 4, 5].map((i) => num(g, `hrTimeInZone_${i}`))
  const zoneS = zs.some((x) => x !== undefined) ? (zs.map((x) => Math.round(x ?? 0)) as ZoneSeconds) : undefined

  let kind: string | undefined
  let swim: GarminActivity['swim']
  if (sport === 'run') kind = runKind(g, distanceM)
  if (sport === 'ride') kind = /commute/i.test(name) || (num(g, 'duration') ?? 0) < 45 * 60 ? 'commute' : 'endurance'
  if (sport === 'swim') {
    kind = /open_water/.test(typeKey) ? 'open' : 'pool'
    const raw = num(g, 'poolLength')
    const factor = num(isObj(g.unitOfPoolLength) ? g.unitOfPoolLength : undefined, 'factor')
    const poolM = raw ? (factor ? raw / factor : raw > 100 ? raw / 100 : raw) : 25
    swim = {
      poolM: Math.round(poolM * 10) / 10,
      lengths: num(g, 'activeLengths', 'numberOfActiveLengths') ?? (distanceM ? Math.round(distanceM / poolM) : 0),
      // 0 means the watch had no SWOLF for this swim
      swolf: Math.round(num(g, 'averageSwolf', 'avgSwolf') ?? 0) || undefined,
      // the summary doesn't say which stroke; mixed sessions are the norm
      stroke: '',
    }
  }

  const round = (x: number | undefined, dp = 0) => (x === undefined ? undefined : Math.round(x * 10 ** dp) / 10 ** dp)
  const garmin = view({
    load: round(num(g, 'activityTrainingLoad')),
    aerobicTE: round(num(g, 'aerobicTrainingEffect', 'trainingEffect'), 1),
    anaerobicTE: round(num(g, 'anaerobicTrainingEffect'), 1),
    bodyBattery: num(g, 'differenceBodyBattery'),
  })
  return {
    id: `g-${garminId}`,
    source: 'garmin',
    garminId,
    sport,
    kind,
    name: name || DEFAULT_NAME[sport],
    start,
    durationS: Math.round(num(g, 'duration', 'movingDuration', 'elapsedDuration') ?? 0),
    distanceM: round(distanceM),
    elevGainM: round(num(g, 'elevationGain')),
    avgHr: round(num(g, 'averageHR', 'avgHr')),
    maxHr: round(num(g, 'maxHR', 'maxHr')),
    avgSpeed: round(num(g, 'averageSpeed'), 3),
    maxSpeed: round(num(g, 'maxSpeed'), 3),
    avgPower: round(num(g, 'avgPower', 'averagePower')),
    avgCadence: round(num(g, 'averageRunningCadenceInStepsPerMinute', 'averageBikingCadenceInRevPerMinute', 'averageSwimCadenceInStrokesPerMinute')),
    calories: round(num(g, 'calories')),
    zoneS,
    hasStream: g.manualActivity !== true,
    swim,
    garmin,
  }
}

/** Only the numbers Garmin sent, so merging with what's stored never blanks one out; undefined when there are none. */
function view(v: GarminView): GarminView | undefined {
  const kept = Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === 'number' && Number.isFinite(x)))
  return Object.keys(kept).length ? kept : undefined
}

/** The watch RPE (Garmin keeps it ×10) and feel (0–100) from an activity's detail; missing when you didn't enter them. */
export function detailOf(res: unknown): Pick<GarminView, 'rpe' | 'feel'> {
  const s = at(res, 'summaryDTO')
  const rpe = num(s, 'directWorkoutRpe')
  const feel = num(s, 'directWorkoutFeel')
  return view({ rpe: rpe ? Math.round(rpe / 10) : undefined, feel }) ?? {}
}

/** Fold one source's fields into a day; undefined and placeholder values (zero, negative, empty) never overwrite real ones. */
export function mergeDay(days: Record<string, Daily>, date: string | undefined, patch: Partial<Daily>) {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return
  const d = date.slice(0, 10)
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => (typeof v === 'number' && Number.isFinite(v) && v > 0) || (typeof v === 'string' && v.trim() !== '')))
  if (!Object.keys(clean).length) return
  days[d] = { ...(days[d] ?? { date: d }), ...clean, date: d }
}

const dayOf = (o: Obj) => str(o, 'calendarDate', 'summaryDate', 'date')

export function foldSummaries(days: Record<string, Daily>, res: unknown) {
  // v2 answers { data: [...] } with each reading nested (heartRate.restingValue) and no sleep; older answers were flat
  for (const o of list(res, 'data', 'dailySummaries', 'summaries', 'userDailySummaries', 'dailySummaryDTOs')) {
    mergeDay(days, dayOf(o), {
      rhr: num(at(o, 'heartRate'), 'restingValue') ?? num(o, 'restingHeartRate', 'restingHeartRateValue', 'restingHR'),
      steps: num(at(o, 'movement', 'steps'), 'value') ?? num(o, 'totalSteps', 'steps'),
      // negative stress means "not enough data"
      stress: num(at(o, 'stress'), 'avgLevel') ?? num(o, 'averageStressLevel', 'avgStressLevel', 'stressLevel'),
      bbHigh: num(at(o, 'bodyBattery'), 'maxValue') ?? num(o, 'bodyBatteryHighestValue', 'bodyBatteryHigh', 'maxBodyBattery'),
      bbLow: num(at(o, 'bodyBattery'), 'minValue') ?? num(o, 'bodyBatteryLowestValue', 'bodyBatteryLow', 'minBodyBattery'),
      bbCharged: num(at(o, 'bodyBattery'), 'chargedValue') ?? num(o, 'bodyBatteryChargedValue'),
      sleepS: num(o, 'sleepingSeconds', 'sleepTimeSeconds'),
    })
  }
}

export function foldHrv(days: Record<string, Daily>, res: unknown) {
  for (const o of list(res, 'hrvSummaries', 'summaries', 'hrvSummaryList')) {
    mergeDay(days, dayOf(o), {
      hrv: num(o, 'lastNightAvg', 'lastNightAverage', 'nightlyAvg', 'avgHrv'),
      // Garmin's own baseline, so HRV is judged the way the watch judges it
      hrvLow: num(at(o, 'baseline'), 'balancedLow'),
      hrvHigh: num(at(o, 'baseline'), 'balancedUpper'),
      hrvStatus: str(o, 'status')?.toUpperCase(),
    })
  }
}

export function foldSleep(days: Record<string, Daily>, res: unknown) {
  for (const raw of list(res, 'dailySleepSummaries', 'sleepSummaries', 'summaries', 'dailySleepDTOs')) {
    const o = isObj(raw.dailySleepDTO) ? raw.dailySleepDTO : raw
    const scores = isObj(o.sleepScores) ? o.sleepScores : undefined
    mergeDay(days, dayOf(o) ?? dayOf(raw), {
      sleepS: num(o, 'sleepTimeSeconds', 'totalSleepSeconds', 'sleepTime'),
      deepS: num(o, 'deepSleepSeconds'),
      lightS: num(o, 'lightSleepSeconds'),
      remS: num(o, 'remSleepSeconds'),
      awakeS: num(o, 'awakeSleepSeconds'),
      sleepScore: num(isObj(scores?.overall) ? scores.overall : undefined, 'value') ?? num(o, 'sleepScore', 'overallSleepScore', 'score'),
      // Garmin sends sleep need in minutes
      sleepNeedS: (num(at(o, 'sleepNeed'), 'actual') ?? 0) * 60 || undefined,
    })
  }
}

export function foldWeight(body: Record<string, BodyEntry>, res: unknown) {
  const summaries = list(res, 'dailyWeightSummaries')
  const metrics = summaries.length
    ? summaries.flatMap((s) => {
        const all = list(s.allWeightMetrics)
        return all.length ? all : isObj(s.latestWeight) ? [s.latestWeight] : []
      })
    : list(res, 'dateWeightList', 'weights')
  for (const m of metrics) {
    const raw = num(m, 'weight')
    if (!raw) continue
    const ts = num(m, 'timestampGMT', 'date')
    const day = str(m, 'calendarDate')
    const date = ts ? new Date(ts).toISOString() : day ? `${day.slice(0, 10)}T07:00:00.000Z` : undefined
    if (!date) continue
    const id = `gw-${num(m, 'samplePk') ?? date}`
    const fat = num(m, 'bodyFat')
    body[id] = {
      id,
      date,
      // Garmin stores grams
      weightKg: Math.round((raw > 1000 ? raw / 1000 : raw) * 100) / 100,
      bodyFat: fat && fat > 0 ? Math.round(fat * 10) / 10 : undefined,
      source: 'garmin',
    }
  }
}

/** Max and resting HR, and the zone floors, from Garmin's zone settings, preferring the default set. */
export function hrProfile(res: unknown): { hrMax?: number; hrRest?: number; zones?: number[] } {
  const sets = list(res, 'heartRateZones', 'zones')
  const pick = sets.find((s) => /default|generic/i.test(str(s, 'sport') ?? '')) ?? sets[0]
  const floors = [1, 2, 3, 4, 5].map((i) => num(pick, `zone${i}Floor`))
  const rising = floors.every((f, i) => f !== undefined && f > 40 && (i === 0 || f > floors[i - 1]!))
  return {
    hrMax: num(pick, 'maxHeartRateUsed', 'maxHeartRate'),
    hrRest: num(pick, 'restingHeartRateUsed', 'restingHeartRate'),
    ...(rising ? { zones: floors.map((f) => Math.round(f!)) } : {}),
  }
}

/**
 * The shape of a response with every value replaced by its type, kept so a
 * mapping that misses a renamed field can be fixed without seeing any data.
 */
export function shape(x: unknown, depth = 3): unknown {
  if (Array.isArray(x)) return x.length ? [shape(x[0], depth)] : []
  if (isObj(x)) {
    if (depth <= 0) return 'object'
    return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, shape(v, depth - 1)]))
  }
  return x === null ? 'null' : typeof x
}
