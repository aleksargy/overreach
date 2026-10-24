// Air temperature and dew point for runs, from Open-Meteo (free, no key). Only a
// rough location leaves the server: where the run started, to about 10 km.

const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive'
const FORECAST = 'https://api.open-meteo.com/v1/forecast'
/** the archive trails real time by about five days; newer runs ask the forecast service */
const ARCHIVE_LAG_DAYS = 6

export interface WeatherAsk {
  id: string
  /** [lat, lon], already rounded */
  at: [number, number]
  /** ISO time to read the weather at */
  time: string
}

export type Weather = { tempC: number; dewC?: number }

interface Hourly {
  hourly?: { time?: string[]; temperature_2m?: (number | null)[]; dew_point_2m?: (number | null)[] }
}

/**
 * One request per place and service, covering every day asked for there. Runs
 * the service has no reading for are left out of the answer; a failed request
 * throws, so the caller can try again on a later sync.
 */
export async function weatherFor(asks: WeatherAsk[], opts: { fetch?: typeof fetch; now?: Date } = {}): Promise<Map<string, Weather>> {
  const f = opts.fetch ?? fetch
  const now = (opts.now ?? new Date()).getTime()
  const groups = new Map<string, WeatherAsk[]>()
  for (const a of asks) {
    const recent = now - Date.parse(a.time) < ARCHIVE_LAG_DAYS * 86_400_000
    const key = `${a.at[0].toFixed(1)}|${a.at[1].toFixed(1)}|${recent ? FORECAST : ARCHIVE}`
    groups.set(key, [...(groups.get(key) ?? []), a])
  }
  const out = new Map<string, Weather>()
  for (const [key, list] of groups) {
    const [lat, lon, base] = key.split('|')
    const days = list.map((a) => a.time.slice(0, 10)).sort()
    const q = new URLSearchParams({ latitude: lat, longitude: lon, hourly: 'temperature_2m,dew_point_2m', timezone: 'GMT', start_date: days[0], end_date: days[days.length - 1] })
    const res = await f(`${base}?${q}`, { signal: AbortSignal.timeout(8_000) })
    if (!res.ok) throw new Error(`The weather service answered ${res.status}`)
    const { hourly } = (await res.json()) as Hourly
    const index = new Map((hourly?.time ?? []).map((t, i) => [t.slice(0, 13), i]))
    for (const a of list) {
      // the hour the run was in, as "2026-08-01T07"
      const i = index.get(new Date(Math.round(Date.parse(a.time) / 3_600_000) * 3_600_000).toISOString().slice(0, 13))
      const t = i === undefined ? null : hourly?.temperature_2m?.[i]
      const d = i === undefined ? null : hourly?.dew_point_2m?.[i]
      if (typeof t === 'number') out.set(a.id, { tempC: Math.round(t * 10) / 10, ...(typeof d === 'number' ? { dewC: Math.round(d * 10) / 10 } : {}) })
    }
  }
  return out
}
