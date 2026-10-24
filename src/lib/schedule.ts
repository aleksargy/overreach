import { addDays, getDay, getHours, getMinutes, parseISO, setHours, setMinutes, startOfDay } from 'date-fns'
import type { Activity, Sport } from '../data/types'

export interface Slot {
  sport: Sport
  /** 0 = Sunday, like Date.getDay */
  dow: number
  hour: number
  minute: number
  count: number
  kind?: string
}

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Find sessions you do on the same weekday at roughly the same time, at least 4 times in 8 weeks. */
export function recurringSlots(activities: Activity[], now = new Date()): Slot[] {
  const since = addDays(now, -56).getTime()
  const groups = new Map<string, { a: Activity; d: Date }[]>()
  for (const a of activities) {
    const d = parseISO(a.start)
    if (d.getTime() < since) continue
    const key = `${a.sport}|${getDay(d)}|${Math.round((getHours(d) * 60 + getMinutes(d)) / 60)}`
    const list = groups.get(key) ?? []
    list.push({ a, d })
    groups.set(key, list)
  }
  const slots: Slot[] = []
  for (const [, list] of groups) {
    if (list.length < 4) continue
    const d = list[list.length - 1].d
    const mins = list.map((x) => getHours(x.d) * 60 + getMinutes(x.d)).sort((a, b) => a - b)
    const med = mins[Math.floor(mins.length / 2)]
    slots.push({
      sport: list[0].a.sport,
      dow: getDay(d),
      hour: Math.floor(med / 60),
      minute: Math.round((med % 60) / 15) * 15 % 60,
      count: list.length,
      kind: list[0].a.kind,
    })
  }
  return slots.sort((a, b) => b.count - a.count)
}

export function nextOccurrence(slot: Slot, now = new Date()): Date {
  for (let i = 0; i < 8; i++) {
    const day = addDays(startOfDay(now), i)
    if (getDay(day) !== slot.dow) continue
    const at = setMinutes(setHours(day, slot.hour), slot.minute)
    if (at.getTime() > now.getTime() - 30 * 60_000) return at
  }
  return addDays(now, 7)
}

export const dowName = (dow: number) => DOW[dow]
