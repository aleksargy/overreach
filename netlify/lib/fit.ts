// FIT file → the app's evenly sampled Stream (and laps). Garmin's download
// endpoint answers with a ZIP holding `<id>_ACTIVITY.fit`.

import { Decoder, Stream as FitStream, type RecordMesg } from '@garmin/fitsdk'
import { unzipSync } from 'fflate'
import type { Lap, Sport, Stream } from '../../src/data/types'

export function fitFromDownload(bytes: Uint8Array): Uint8Array {
  // "PK": a ZIP; anything else is assumed to be the FIT file itself
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const files = unzipSync(bytes)
    const name = Object.keys(files).find((n) => n.toLowerCase().endsWith('.fit')) ?? Object.keys(files)[0]
    if (!name) throw new Error('Garmin’s download was an empty ZIP.')
    return files[name]
  }
  return bytes
}

const SEMI = 180 / 2 ** 31
const ms = (d: unknown) => (d instanceof Date ? d.getTime() : typeof d === 'number' ? d : NaN)
/** a gap longer than this is the watch paused (half time, a café stop): speed reads as zero */
const GAP_S = 10

export function streamFromFit(fit: Uint8Array, activityId: string, sport: Sport): Stream {
  const { messages, errors } = new Decoder(FitStream.fromByteArray(fit)).read({ convertDateTimesToDates: true, mergeHeartRates: true })
  const records = (messages.recordMesgs ?? []).filter((r) => Number.isFinite(ms(r.timestamp)))
  if (!records.length) throw new Error(errors[0]?.message ?? 'That FIT file has no samples.')

  const t0 = ms(records[0].timestamp)
  const totalS = (ms(records[records.length - 1].timestamp) - t0) / 1000
  // football keeps 1 s so short sprints survive; everything else stays under ~2000 points
  const dt = sport === 'football' ? 1 : Math.max(1, Math.ceil(totalS / 2000))
  const n = Math.floor(totalS / dt) + 1

  const speedOf = (r: RecordMesg) => r.enhancedSpeed ?? r.speed
  const altOf = (r: RecordMesg) => r.enhancedAltitude ?? r.altitude
  const has = {
    hr: records.some((r) => r.heartRate),
    v: records.some((r) => speedOf(r) !== undefined) || records.some((r) => r.distance !== undefined),
    d: records.some((r) => r.distance !== undefined),
    alt: records.some((r) => altOf(r) !== undefined),
    pos: records.some((r) => r.positionLat !== undefined && r.positionLong !== undefined),
    pwr: records.some((r) => r.power !== undefined),
    cad: records.some((r) => r.cadence !== undefined),
  }
  const out: Stream = { activityId, dt }
  const hr: number[] = []
  const v: number[] = []
  const d: number[] = []
  const alt: number[] = []
  const lat: number[] = []
  const lon: number[] = []
  const pwr: number[] = []
  const cad: number[] = []

  // hold the latest sample at or before each tick; derive speed from distance if the device didn't log it
  let j = 0
  let last = { d: 0, alt: NaN, lat: NaN, lon: NaN }
  for (let i = 0; i < n; i++) {
    const t = t0 + i * dt * 1000
    while (j + 1 < records.length && ms(records[j + 1].timestamp) <= t) j++
    const r = records[j]
    const age = (t - ms(r.timestamp)) / 1000
    const stale = age > GAP_S
    if (r.distance !== undefined) last.d = r.distance
    const a = altOf(r)
    if (a !== undefined) last.alt = a
    if (r.positionLat !== undefined && r.positionLong !== undefined) last = { ...last, lat: r.positionLat * SEMI, lon: r.positionLong * SEMI }

    if (has.hr) hr.push(stale ? 0 : (r.heartRate ?? 0))
    if (has.v) {
      let sp = speedOf(r)
      if (sp === undefined && i > 0 && has.d) sp = Math.max(0, (last.d - d[d.length - 1]) / dt)
      v.push(stale ? 0 : Math.round((sp ?? 0) * 100) / 100)
    }
    if (has.d) d.push(Math.round(last.d * 10) / 10)
    if (has.alt) alt.push(Number.isFinite(last.alt) ? Math.round(last.alt * 10) / 10 : 0)
    if (has.pos) {
      lat.push(Number.isFinite(last.lat) ? Math.round(last.lat * 1e6) / 1e6 : NaN)
      lon.push(Number.isFinite(last.lon) ? Math.round(last.lon * 1e6) / 1e6 : NaN)
    }
    if (has.pwr) pwr.push(stale ? 0 : (r.power ?? 0))
    if (has.cad) cad.push(stale ? 0 : (r.cadence ?? 0))
  }
  if (has.hr) out.hr = hr
  if (has.v) out.v = v
  if (has.d) out.d = d
  if (has.alt) out.alt = alt
  if (has.pos) {
    // fill the gap before the first GPS fix with that fix, so charts and the heatmap don't see NaN
    const first = lat.findIndex(Number.isFinite)
    for (let i = 0; i < first; i++) {
      lat[i] = lat[first]
      lon[i] = lon[first]
    }
    if (first >= 0) {
      out.lat = lat
      out.lon = lon
    }
  }
  if (has.pwr) out.pwr = pwr
  if (has.cad) out.cad = cad

  const since = (d: unknown) => Math.max(0, Math.round((ms(d) - t0) / 1000)) || 0
  // pool swims: one entry per length (laps there are sets of lengths); everything else: laps
  const lengths = (messages.lengthMesgs ?? []).filter((l) => l.lengthType === 'active')
  const pool = sport === 'swim' ? (messages.sessionMesgs?.[0]?.poolLength ?? 0) : 0
  const laps: Lap[] =
    sport === 'swim' && lengths.length
      ? lengths.map((l, index) => {
          const durationS = Math.round(l.totalTimerTime ?? l.totalElapsedTime ?? 0)
          return { index, startS: since(l.startTime), durationS, distanceM: pool, avgSpeed: pool && durationS ? pool / durationS : undefined }
        })
      : (messages.lapMesgs ?? []).map((l, index) => ({
          index,
          startS: since(l.startTime),
          durationS: Math.round(l.totalTimerTime ?? l.totalElapsedTime ?? 0),
          distanceM: Math.round(l.totalDistance ?? 0),
          avgHr: l.avgHeartRate,
          avgSpeed: l.enhancedAvgSpeed ?? l.avgSpeed,
        }))
  if (laps.length) out.laps = laps
  return out
}

export { footballSummary } from '../../src/lib/football'
