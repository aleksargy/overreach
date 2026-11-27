import type { Equipment, Exercise, ExerciseKind, Muscle, Programme, Routine } from './types'

type Def = [id: string, name: string, muscle: Muscle, equipment: Equipment, kind: ExerciseKind, range: [number, number], increment: number, extra?: Partial<Exercise>]

const DEFS: Def[] = [
  ['bench-press', 'Bench Press', 'chest', 'barbell', 'weight', [6, 10], 2.5, { secondary: ['triceps', 'shoulders'] }],
  ['incline-db-press', 'Incline DB Press', 'chest', 'dumbbell', 'weight', [8, 12], 2, { secondary: ['shoulders'] }],
  ['cable-fly', 'Cable Fly', 'chest', 'cable', 'weight', [10, 15], 2.5],
  ['dips', 'Dips', 'chest', 'bodyweight', 'weighted-bodyweight', [6, 12], 2.5, { secondary: ['triceps'] }],
  ['push-up', 'Push-up', 'chest', 'bodyweight', 'bodyweight', [10, 25], 0],
  ['overhead-press', 'Overhead Press', 'shoulders', 'barbell', 'weight', [5, 8], 2.5, { secondary: ['triceps'] }],
  ['lateral-raise', 'Lateral Raise', 'shoulders', 'dumbbell', 'weight', [12, 20], 1],
  ['face-pull', 'Face Pull', 'shoulders', 'cable', 'weight', [12, 20], 2.5, { secondary: ['back'] }],
  ['pike-push-up', 'Pike Push-up', 'shoulders', 'bodyweight', 'bodyweight', [6, 12], 0],
  ['handstand-hold', 'Handstand Hold', 'shoulders', 'bodyweight', 'duration', [20, 45], 0],
  ['triceps-pushdown', 'Triceps Pushdown', 'triceps', 'cable', 'weight', [10, 15], 2.5],
  ['skull-crusher', 'Skull Crusher', 'triceps', 'barbell', 'weight', [8, 12], 2.5],
  ['pull-up', 'Pull-up', 'back', 'bodyweight', 'weighted-bodyweight', [5, 10], 2.5, { secondary: ['biceps'] }],
  ['chin-up', 'Chin-up', 'back', 'bodyweight', 'weighted-bodyweight', [5, 10], 2.5, { secondary: ['biceps'] }],
  ['muscle-up', 'Muscle-up', 'back', 'bodyweight', 'bodyweight', [3, 6], 0, { secondary: ['chest', 'triceps'] }],
  ['barbell-row', 'Barbell Row', 'back', 'barbell', 'weight', [6, 10], 2.5, { secondary: ['biceps'] }],
  ['lat-pulldown', 'Lat Pulldown', 'back', 'machine', 'weight', [8, 12], 5, { secondary: ['biceps'] }],
  ['seated-row', 'Seated Cable Row', 'back', 'cable', 'weight', [8, 12], 5],
  ['deadlift', 'Deadlift', 'back', 'barbell', 'weight', [3, 6], 5, { secondary: ['hamstrings', 'glutes'] }],
  ['barbell-curl', 'Barbell Curl', 'biceps', 'barbell', 'weight', [8, 12], 2.5],
  ['hammer-curl', 'Hammer Curl', 'biceps', 'dumbbell', 'weight', [10, 15], 1, { secondary: ['forearms'] }],
  ['back-squat', 'Back Squat', 'quads', 'barbell', 'weight', [5, 8], 2.5, { secondary: ['glutes'] }],
  ['front-squat', 'Front Squat', 'quads', 'barbell', 'weight', [5, 8], 2.5, { secondary: ['core'] }],
  ['bulgarian-split-squat', 'Bulgarian Split Squat', 'quads', 'dumbbell', 'weight', [8, 12], 2, { unilateral: true, secondary: ['glutes'] }],
  ['leg-press', 'Leg Press', 'quads', 'machine', 'weight', [10, 15], 10],
  ['leg-extension', 'Leg Extension', 'quads', 'machine', 'weight', [10, 15], 5],
  ['pistol-squat', 'Pistol Squat', 'quads', 'bodyweight', 'bodyweight', [5, 10], 0, { unilateral: true }],
  ['romanian-deadlift', 'Romanian Deadlift', 'hamstrings', 'barbell', 'weight', [6, 10], 2.5, { secondary: ['glutes', 'back'] }],
  ['leg-curl', 'Leg Curl', 'hamstrings', 'machine', 'weight', [10, 15], 5],
  ['nordic-curl', 'Nordic Curl', 'hamstrings', 'bodyweight', 'bodyweight', [4, 8], 0],
  ['hip-thrust', 'Hip Thrust', 'glutes', 'barbell', 'weight', [8, 12], 5],
  ['calf-raise', 'Calf Raise', 'calves', 'machine', 'weight', [10, 20], 5],
  ['hanging-leg-raise', 'Hanging Leg Raise', 'core', 'bodyweight', 'bodyweight', [8, 15], 0],
  ['l-sit', 'L-sit', 'core', 'bodyweight', 'duration', [15, 30], 0],
  ['plank', 'Plank', 'core', 'bodyweight', 'duration', [45, 90], 0],
  ['ab-wheel', 'Ab Wheel', 'core', 'other', 'bodyweight', [8, 15], 0],
  ['kettlebell-swing', 'Kettlebell Swing', 'full', 'kettlebell', 'weight', [15, 25], 4, { secondary: ['hamstrings', 'glutes'] }],
]

export const BUILTIN_EXERCISES: Exercise[] = DEFS.map(([id, name, muscle, equipment, kind, repRange, increment, extra]) => ({
  id,
  name,
  muscle,
  equipment,
  kind,
  repRange,
  targetRpe: 8,
  increment,
  ...extra,
}))

export const MUSCLES: { key: Muscle; label: string }[] = [
  { key: 'chest', label: 'Chest' },
  { key: 'back', label: 'Back' },
  { key: 'shoulders', label: 'Shoulders' },
  { key: 'biceps', label: 'Biceps' },
  { key: 'triceps', label: 'Triceps' },
  { key: 'quads', label: 'Quads' },
  { key: 'hamstrings', label: 'Hamstrings' },
  { key: 'glutes', label: 'Glutes' },
  { key: 'calves', label: 'Calves' },
  { key: 'core', label: 'Core' },
  { key: 'forearms', label: 'Forearms' },
  { key: 'full', label: 'Full body' },
]

export const EQUIPMENT: { key: Equipment; label: string }[] = [
  { key: 'barbell', label: 'Barbell' },
  { key: 'dumbbell', label: 'Dumbbell' },
  { key: 'machine', label: 'Machine' },
  { key: 'cable', label: 'Cable' },
  { key: 'bodyweight', label: 'Bodyweight' },
  { key: 'kettlebell', label: 'Kettlebell' },
  { key: 'band', label: 'Band' },
  { key: 'other', label: 'Other' },
]

export const KINDS: { key: ExerciseKind; label: string }[] = [
  { key: 'weight', label: 'Weight × reps' },
  { key: 'weighted-bodyweight', label: 'Bodyweight + added kg' },
  { key: 'bodyweight', label: 'Reps only' },
  { key: 'duration', label: 'Time hold' },
]

/** Every exercise as it stands: the built-in ones with what you've changed on them, then your own. */
export const exercisesOf = (custom: Exercise[], edits: Record<string, Partial<Exercise>>): Exercise[] => [...BUILTIN_EXERCISES.map((e) => ({ ...e, ...edits[e.id] })), ...custom]

/**
 * The sample lifter's workouts: what the Lift tab shows on sample data. Your own
 * list starts empty. Until 10 Nov 2026 every phone began with these four, so a
 * saved copy from before then may still carry them (`withoutStarters`).
 */
export const SAMPLE_ROUTINES: Routine[] = [
  {
    id: 'push-a',
    name: 'Push A',
    focus: 'Chest, shoulders, triceps',
    items: [
      { exerciseId: 'bench-press', sets: 4 },
      { exerciseId: 'overhead-press', sets: 3 },
      { exerciseId: 'incline-db-press', sets: 3 },
      { exerciseId: 'lateral-raise', sets: 3 },
      { exerciseId: 'triceps-pushdown', sets: 3 },
    ],
  },
  {
    id: 'pull-a',
    name: 'Pull A',
    focus: 'Back, biceps, rear delts',
    items: [
      { exerciseId: 'pull-up', sets: 4 },
      { exerciseId: 'barbell-row', sets: 3 },
      { exerciseId: 'lat-pulldown', sets: 3 },
      { exerciseId: 'face-pull', sets: 3 },
      { exerciseId: 'barbell-curl', sets: 3 },
    ],
  },
  {
    id: 'legs-a',
    name: 'Legs A',
    focus: 'Quads, hamstrings, core',
    items: [
      { exerciseId: 'back-squat', sets: 4 },
      { exerciseId: 'romanian-deadlift', sets: 3 },
      { exerciseId: 'bulgarian-split-squat', sets: 3 },
      { exerciseId: 'leg-curl', sets: 3 },
      { exerciseId: 'calf-raise', sets: 3 },
      { exerciseId: 'hanging-leg-raise', sets: 3 },
    ],
  },
  {
    id: 'calisthenics',
    name: 'Calisthenics',
    focus: 'Bar, rings and floor',
    items: [
      // in turns, on one belt
      { exerciseId: 'pull-up', sets: 3, superset: 'bar' },
      { exerciseId: 'dips', sets: 3, superset: 'bar' },
      { exerciseId: 'muscle-up', sets: 3 },
      { exerciseId: 'pistol-squat', sets: 3 },
      { exerciseId: 'l-sit', sets: 3 },
      { exerciseId: 'handstand-hold', sets: 3 },
    ],
  },
]

/**
 * The sample lifter's programme: their four workouts, three times a week for ten weeks, started four weeks before
 * today (the world gives it its run). On sample data only.
 */
export const SAMPLE_PROGRAMME: Omit<Programme, 'runs'> = {
  id: 'p-sample',
  name: 'Push pull legs',
  routineIds: SAMPLE_ROUTINES.map((r) => r.id),
  perWeek: 3,
  weeks: 10,
}
