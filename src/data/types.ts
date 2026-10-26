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
  /** Garmin's training load when the watch worked one out, otherwise Edwards TRIMP (zone-minutes weighted 1–5). */
  load: number
  /** what Garmin made of the session, when it has a view */
  garmin?: GarminView
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

/** Garmin's own numbers for a session, as the watch worked them out. */
export interface GarminView {
  /** training load (EPOC-based): the number behind Garmin's acute load */
  load?: number
  /** training effect, 0–5: 2 maintains, 3 improves, 4 highly improves, 5 overreaches */
  aerobicTE?: number
  anaerobicTE?: number
  /** Body Battery used during the session */
  bodyBattery?: number
  /** what you entered on the watch afterwards: effort 1–10, and feel from 0 (very weak) to 100 (very strong) */
  rpe?: number
  feel?: number
}

/** What one run tells the running analysis, worked out from its samples once. */
export interface RunSummary {
  /** how it was worked out: older summaries gain what's new from the stored stream (RUN_SUMMARY in lib/running) */
  v?: number
  /** one entry per minute of moving time: average speed (m/s), heart rate (0 where it dropped out) and grade (%) */
  spd: number[]
  hr: number[]
  grade: number[]
  /** best average speed (m/s) held for each duration in BEST_S (lib/running); 0 where the run was shorter */
  best: number[]
  /** where it started, rounded to about 10 km: enough to look up the weather */
  at?: [number, number]
  /** where it went, a point every ROUTE_STEP (lib/ghost) metres and one at the finish, as whole metres east and north of `at`: x0, y0, x1, y1, … */
  route?: number[]
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
  /** how it was worked out: older summaries are made again from the stored stream (FOOTBALL_SUMMARY in lib/football) */
  v?: number
  minutes: number
  distanceM: number
  mPerMin: number
  topSpeedKmh: number
  sprints: number
  hiDistM: number
  fadeMinute?: number
  /** where you were, kept small enough to lay a season of games over each other */
  trace?: PitchTrace
}

/** A point every 15 s of play, as whole metres east and north of `at`. */
export interface PitchTrace {
  /** latitude and longitude the points are measured from */
  at: [number, number]
  /** x0, y0, x1, y1, … */
  xy: number[]
  /** the point the second half starts at */
  half: number
  /** there was a half-time break, so the ends most likely changed */
  break: boolean
}

/** What the sync functions send. Zones (when Garmin didn't split them) and load are filled in on the phone from your profile. */
export type GarminActivity = Omit<Activity, 'zoneS' | 'load'> & {
  zoneS?: ZoneSeconds
  /** the activity's detail (watch RPE and feel) has been read, whether or not you entered any */
  detailRead?: boolean
}

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
  /** Body Battery gained over the day, most of it overnight */
  bbCharged?: number
  stress?: number
  steps?: number
  /** Garmin's HRV baseline: the balanced range (ms), and its status for the week (BALANCED, UNBALANCED, LOW, POOR) */
  hrvLow?: number
  hrvHigh?: number
  hrvStatus?: string
  /** the sleep Garmin says you needed (s), adjusted for your HRV and training */
  sleepNeedS?: number
}

export type Position = 'GK' | 'DEF' | 'MID' | 'FWD' | 'ANY'
export type Format = 5 | 6 | 7 | 8 | 11

/** the fixed moments games were rated with before notes; they live on as suggestions */
export type MomentKey = 'worldie' | 'nutmeg' | 'lastDitch' | 'bigSave' | 'sitter' | 'error' | 'ownGoal' | 'lostHead'

/** Something that went well or badly, in your words. A big one counts double. */
export interface MatchPoint {
  text: string
  good: boolean
  big?: boolean
  /** set when it came from one of the old moments, so the headline still knows an own goal when it sees one */
  key?: MomentKey
}

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
  /** what went well and what didn't */
  points: MatchPoint[]
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

export interface Race {
  /** yyyy-MM-dd */
  date: string
  distanceM: number
  /** the finish time you're aiming for (s) */
  goalS?: number
}

export interface Profile {
  name: string
  hrMax: number
  hrRest: number
  /** lower bounds (bpm) of HR zones 1–5 from your Garmin settings, once synced */
  zones?: number[]
  /** the race you're training for */
  race?: Race
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
  /** when the server last took a copy of what you've typed */
  copyAt?: string
  /** a change hasn't reached the server's copy yet */
  copyPending?: boolean
}
