import { differenceInCalendarDays, format, parseISO } from 'date-fns'

const pad = (n: number) => String(n).padStart(2, '0')

/** 58:12 or 1:02:33 */
export function clock(totalS: number): string {
  const s = Math.max(0, Math.round(totalS))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

/** 1h 02m or 58m */
export function dur(totalS: number): string {
  const m = Math.round(totalS / 60)
  const h = Math.floor(m / 60)
  return h ? `${h}h ${pad(m % 60)}m` : `${m}m`
}

/** sec per km from m/s → 4:52 */
export function pace(mps?: number): string {
  if (!mps || mps <= 0) return '–'
  const spk = 1000 / mps
  return `${Math.floor(spk / 60)}:${pad(Math.round(spk % 60) % 60)}`
}

/** sec per 100 m from m/s → 1:52 */
export function swimPace(mps?: number): string {
  if (!mps || mps <= 0) return '–'
  const s = 100 / mps
  return `${Math.floor(s / 60)}:${pad(Math.round(s % 60) % 60)}`
}

export const kmh = (mps?: number) => (mps ? mps * 3.6 : 0)

export function km(m?: number, dp = 2): string {
  if (m === undefined) return '–'
  const v = m / 1000
  return v >= 100 ? v.toFixed(0) : v.toFixed(v >= 10 ? 1 : dp)
}

export function kg(x?: number): string {
  if (x === undefined || Number.isNaN(x)) return '–'
  return Number.isInteger(x) ? String(x) : x.toFixed(x * 10 === Math.round(x * 10) ? 1 : 2)
}

export function signed(x: number, dp = 1): string {
  const v = x.toFixed(dp)
  return x > 0 ? `+${v}` : x < 0 ? `−${v.slice(1)}` : v
}

export const thousands = (n: number) => Math.round(n).toLocaleString('en-GB')

export function dayLabel(iso: string, now = new Date()): string {
  const d = parseISO(iso)
  const diff = differenceInCalendarDays(now, d)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff > 1 && diff < 7) return format(d, 'EEEE')
  return format(d, 'EEE d MMM')
}

export function ago(iso: string, now = new Date()): string {
  const diff = differenceInCalendarDays(now, parseISO(iso))
  if (diff <= 0) return 'today'
  if (diff === 1) return 'yesterday'
  if (diff < 7) return `${diff}d ago`
  if (diff < 60) return `${Math.round(diff / 7)}w ago`
  return `${Math.round(diff / 30)}mo ago`
}

export const fmt = (iso: string, f: string) => format(parseISO(iso), f)
export const isoDay = (d: Date) => format(d, 'yyyy-MM-dd')
