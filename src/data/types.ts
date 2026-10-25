export type Sport = 'run' | 'ride' | 'swim' | 'football' | 'strength' | 'other'
export type Source = 'garmin' | 'sample' | 'manual'

/** Seconds spent in HR zones 1–5. */
export type ZoneSeconds = [number, number, number, number, number]

export interface Lap {
  index: number
  startS: number
  durationS: number
  distanceM: number
  avgHr?: number
  avgSpeed?: number
}

export interface Activity {
  id: string
  source: Source
  garminId?: number
  sport: Sport
  /** run: easy | tempo | intervals | long | race; ride: commute | endurance; swim: pool | open */
  kind?: string
  name: string
  start: string
  durationS: number
  distanceM?: number
  elevGainM?: number
  avgHr?: number
  maxHr?: number
  /** m/s */
  avgSpeed?: number
  maxSpeed?: number
  avgPower?: number
  avgCadence?: number
  calories?: number
  tempC?: number
  zoneS: ZoneSeconds
  /** Edwards TRIMP (zone-minutes weighted 1–5), comparable across sports. */
  load: number
  hasStream: boolean
  laps?: Lap[]
  swim?: { poolM: number; lengths: number; swolf?: number; stroke: string }
  /** strength activities point at the workout they came from */
  workoutId?: string
  /** football summary computed at sync time so season stats don't need every stream */
  football?: FootballSummary
  /** strength summary, so lists don't need to look up the workout */
  lift?: LiftSummary
  /** run summary computed at sync time, so the running analysis doesn't need every stream */
  run?: RunSummary
}

/** What one run tells the running analysis, worked out from its samples once. */
export interface RunSummary {
  /** one entry per minute of moving time: average speed (m/s), heart rate (0 where it dropped out) and grade (%) */
  spd: number[]
  hr: number[]
  grade: number[]
  /** best average speed (m/s) held for each duration in BEST_S (lib/running); 0 where the run was shorter */
  best: number[]
  /** where it started, rounded to about 10 km: enough to look up the weather */
  at?: [number, number]
  /** air temperature and dew point (°C) halfway through, from the weather service */
  tempC?: number
  dewC?: number
}

export interface LiftSummary {
  exercises: number
  sets: number
  volumeKg: number
}

export interface FootballSummary {
  minutes: number
  distanceM: number
  mPerMin: number
  topSpeedKmh: number
  sprints: number
  hiDistM: number
  fadeMinute?: number
}

/** What the sync functions send. Zones (when Garmin didn't split them) and load are filled in on the phone from your profile. */
export type GarminActivity = Omit<Activity, 'zoneS' | 'load'> & { zoneS?: ZoneSeconds }

/** Columnar time series, sampled evenly (dt seconds). */
export interface Stream {
  activityId: string
  dt: number
  /** Garmin laps arrive with the stream; sample activities carry them on the activity */
  laps?: Lap[]
  hr?: number[]
  /** speed m/s */
  v?: number[]
  /** cumulative distance m */
  d?: number[]
  alt?: number[]
  lat?: number[]
  lon?: number[]
  pwr?: number[]
  cad?: number[]
}

export interface Daily {
  date: string // yyyy-MM-dd
  hrv?: number // overnight avg rMSSD, ms
  rhr?: number
  sleepS?: number
  sleepScore?: number
  deepS?: number
  remS?: number
  lightS?: number
  awakeS?: number
  bbHigh?: number
  bbLow?: number
  stress?: number
  steps?: number
}

export type Position = 'GK' | 'DEF' | 'MID' | 'FWD' | 'ANY'
export type Format = 5 | 6 | 7 | 8 | 11

export type MomentKey = 'worldie' | 'nutmeg' | 'lastDitch' | 'bigSave' | 'sitter' | 'error' | 'ownGoal' | 'lostHead'

export interface RatingFactor {
  key: string
  label: string
  value: number
}

export interface Match {
  id: string
  activityId?: string
  date: string
  format: Format
  team: string
  opponent: string
  scoreFor: number
  scoreAgainst: number
  goals: number
  assists: number
  moments: MomentKey[]
  position: Position
  /** how it felt, 1–10 */
  feel: number
  notes?: string
  /** attacking direction flip for the heatmap */
  flip?: boolean
  rating: number
  breakdown: RatingFactor[]
  headline: string
  createdAt: string
}

export type Muscle = 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'core' | 'forearms' | 'full'

export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'kettlebell' | 'band' | 'other'
export type ExerciseKind = 'weight' | 'bodyweight' | 'weighted-bodyweight' | 'duration'

export interface Exercise {
  id: string
  name: string
  muscle: Muscle
  secondary?: Muscle[]
  equipment: Equipment
  kind: ExerciseKind
  custom?: boolean
  unilateral?: boolean
  repRange: [number, number]
  targetRpe: number
  /** kg added when progressing */
  increment: number
  restS: number
  notes?: string
}

export type SetKind = 'warmup' | 'working' | 'drop' | 'failure'

export interface SetEntry {
  id: string
  kind: SetKind
  kg?: number
  reps?: number
  rpe?: number
  secs?: number
  done: boolean
}

export interface WorkoutExercise {
  id: string
  exerciseId: string
  sets: SetEntry[]
  note?: string
}

export interface Workout {
  id: string
  name: string
  routineId?: string
  start: string
  end?: string
  exercises: WorkoutExercise[]
  /** session RPE 1–10 asked at the end */
  srpe?: number
  notes?: string
  source: Source
}

export interface RoutineItem {
  exerciseId: string
  sets: number
}

export interface Routine {
  id: string
  name: string
  focus: string
  items: RoutineItem[]
}

export interface BodyEntry {
  id: string
  date: string
  weightKg?: number
  bodyFat?: number
  waistCm?: number
  chestCm?: number
  armCm?: number
  thighCm?: number
  source: Source
}

export interface Profile {
  name: string
  hrMax: number
  hrRest: number
  team: string
  format: Format
  position: Position
}

export interface SyncState {
  mode: 'sample' | 'live'
  passphrase?: string
  lastSync?: string
  /** the server's data as of this time is what's stored on the phone */
  dataAt?: string
  status?: 'idle' | 'syncing' | 'error'
  message?: string
}
