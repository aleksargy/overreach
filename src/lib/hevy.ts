import type { Equipment, Exercise, SetEntry, SetKind, Workout, WorkoutExercise } from '../data/types'
import { hashString } from './rng'

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      if (row.some((x) => x !== '')) rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  row.push(field)
  if (row.some((x) => x !== '')) rows.push(row)
  return rows
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }

/** Hevy writes "17 Jan 2024, 18:41"; fall back to anything Date can read. */
export function parseHevyDate(s: string): Date | null {
  const m = s.trim().match(/^(\d{1,2}) (\w{3})\w* (\d{4}),? (\d{1,2}):(\d{2})/)
  if (m && MONTHS[m[2].toLowerCase()] !== undefined) return new Date(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]), Number(m[4]), Number(m[5]))
  const t = Date.parse(s)
  return Number.isFinite(t) ? new Date(t) : null
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]/g, '')

/** Hevy names that don't match ours letter for letter. */
const ALIASES: Record<string, string> = {
  benchpress: 'bench-press',
  inclinebenchpress: 'incline-db-press',
  inclinedumbbellpress: 'incline-db-press',
  overheadpress: 'overhead-press',
  shoulderpress: 'overhead-press',
  lateralraise: 'lateral-raise',
  facepull: 'face-pull',
  tricepspushdown: 'triceps-pushdown',
  tricepspressdown: 'triceps-pushdown',
  skullcrusher: 'skull-crusher',
  pullup: 'pull-up',
  chinup: 'chin-up',
  muscleup: 'muscle-up',
  bentoverrow: 'barbell-row',
  latpulldown: 'lat-pulldown',
  seatedcablerowvgrip: 'seated-row',
  seatedcablerow: 'seated-row',
  deadlift: 'deadlift',
  bicepcurl: 'barbell-curl',
  bicepscurl: 'barbell-curl',
  hammercurl: 'hammer-curl',
  squat: 'back-squat',
  frontsquat: 'front-squat',
  bulgariansplitsquat: 'bulgarian-split-squat',
  legpress: 'leg-press',
  legextension: 'leg-extension',
  romaniandeadlift: 'romanian-deadlift',
  lyinglegcurl: 'leg-curl',
  seatedlegcurl: 'leg-curl',
  hipthrust: 'hip-thrust',
  standingcalfraise: 'calf-raise',
  seatedcalfraise: 'calf-raise',
  hanginglegraise: 'hanging-leg-raise',
  plank: 'plank',
  chestdip: 'dips',
  tricepsdip: 'dips',
  dip: 'dips',
  pushup: 'push-up',
  kettlebellswing: 'kettlebell-swing',
  cableflycrossovers: 'cable-fly',
  lsithold: 'l-sit',
  handstandhold: 'handstand-hold',
  abwheel: 'ab-wheel',
  pistolsquat: 'pistol-squat',
  nordichamstringscurls: 'nordic-curl',
}

const EQUIP: [RegExp, Equipment][] = [
  [/barbell/i, 'barbell'],
  [/dumbbell/i, 'dumbbell'],
  [/machine|smith/i, 'machine'],
  [/cable/i, 'cable'],
  [/kettlebell/i, 'kettlebell'],
  [/band/i, 'band'],
]

const SET_KIND: Record<string, SetKind> = { normal: 'working', warmup: 'warmup', dropset: 'drop', failure: 'failure' }

export interface HevyImport {
  workouts: Workout[]
  exercises: Exercise[]
  matched: number
  rows: number
}

/** Turn a Hevy "Export workouts" CSV into workouts, adding custom exercises for names we don't know. */
export function importHevy(csv: string, library: Exercise[]): HevyImport {
  const [head, ...body] = parseCsv(csv)
  if (!head) throw new Error('That file is empty.')
  const col = (name: string) => head.findIndex((h) => h.trim().toLowerCase() === name)
  const c = {
    title: col('title'),
    start: col('start_time'),
    end: col('end_time'),
    desc: col('description'),
    exercise: col('exercise_title'),
    notes: col('exercise_notes'),
    type: col('set_type'),
    kg: col('weight_kg'),
    reps: col('reps'),
    secs: col('duration_seconds'),
    rpe: col('rpe'),
  }
  if (c.title < 0 || c.start < 0 || c.exercise < 0) throw new Error('This doesn’t look like a Hevy export. Use Settings → Export data → Export workouts in Hevy.')

  const byNorm = new Map(library.map((e) => [norm(e.name), e.id]))
  const created = new Map<string, Exercise>()
  const resolved = new Map<string, string>()
  let matched = 0
  const resolve = (title: string, rows: string[][]): string => {
    if (resolved.has(title)) return resolved.get(title)!
    const n = norm(title)
    let id = byNorm.get(n) ?? ALIASES[n]
    if (id) matched++
    else {
      const hasKg = rows.some((r) => Number(r[c.kg]) > 0)
      const hasSecs = rows.some((r) => Number(r[c.secs]) > 0) && !rows.some((r) => Number(r[c.reps]) > 0)
      id = `hevy-${n.slice(0, 32)}`
      created.set(id, {
        id,
        name: title,
        muscle: 'full',
        equipment: EQUIP.find(([re]) => re.test(title))?.[1] ?? (hasKg ? 'other' : 'bodyweight'),
        kind: hasSecs ? 'duration' : hasKg ? 'weight' : 'bodyweight',
        custom: true,
        repRange: hasSecs ? [30, 60] : [8, 12],
        targetRpe: 8,
        increment: hasKg ? 2.5 : 0,
        restS: 120,
        notes: 'Imported from Hevy. Set the muscle so weekly sets count it.',
      })
    }
    resolved.set(title, id)
    return id
  }

  const groups = new Map<string, string[][]>()
  for (const r of body) {
    const key = `${r[c.title]}|${r[c.start]}`
    groups.set(key, [...(groups.get(key) ?? []), r])
  }

  const workouts: Workout[] = []
  for (const [key, rows] of groups) {
    const start = parseHevyDate(rows[0][c.start])
    if (!start) continue
    const end = c.end >= 0 ? parseHevyDate(rows[0][c.end]) : null
    const exercises: WorkoutExercise[] = []
    const byTitle = new Map<string, string[][]>()
    for (const r of rows) byTitle.set(r[c.exercise], [...(byTitle.get(r[c.exercise]) ?? []), r])
    for (const [title, sets] of byTitle) {
      const exerciseId = resolve(title, sets)
      exercises.push({
        id: `${exerciseId}-${hashString(key + title).toString(36)}`,
        exerciseId,
        note: c.notes >= 0 ? sets[0][c.notes] || undefined : undefined,
        sets: sets.map((r, i): SetEntry => {
          const num = (k: number) => (k >= 0 && r[k] !== '' && Number.isFinite(Number(r[k])) ? Number(r[k]) : undefined)
          return {
            id: `${hashString(key + title).toString(36)}-${i}`,
            kind: SET_KIND[(r[c.type] ?? '').trim().toLowerCase()] ?? 'working',
            kg: num(c.kg),
            reps: num(c.reps),
            secs: num(c.secs),
            rpe: num(c.rpe),
            done: true,
          }
        }),
      })
    }
    workouts.push({
      id: `hevy-${hashString(key).toString(36)}`,
      name: rows[0][c.title] || 'Workout',
      start: start.toISOString(),
      end: (end ?? new Date(start.getTime() + 60 * 60_000)).toISOString(),
      exercises,
      notes: c.desc >= 0 ? rows[0][c.desc] || undefined : undefined,
      source: 'manual',
    })
  }
  return { workouts, exercises: [...created.values()], matched, rows: body.length }
}
