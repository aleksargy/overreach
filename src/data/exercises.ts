import type { Equipment, Exercise, ExerciseKind, Muscle, Routine } from './types'

type Def = [
  id: string,
  name: string,
  muscle: Muscle,
  equipment: Equipment,
  kind: ExerciseKind,
  range: [number, number],
  increment: number,
  restS: number,
  extra?: Partial<Exercise>,
]

const DEFS: Def[] = [
  ['bench-press', 'Bench Press', 'chest', 'barbell', 'weight', [6, 10], 2.5, 180, { secondary: ['triceps', 'shoulders'] }],
  ['incline-db-press', 'Incline DB Press', 'chest', 'dumbbell', 'weight', [8, 12], 2, 120, { secondary: ['shoulders'] }],
  ['cable-fly', 'Cable Fly', 'chest', 'cable', 'weight', [10, 15], 2.5, 90],
  ['dips', 'Dips', 'chest', 'bodyweight', 'weighted-bodyweight', [6, 12], 2.5, 150, { secondary: ['triceps'] }],
  ['push-up', 'Push-up', 'chest', 'bodyweight', 'bodyweight', [10, 25], 0, 90],
  ['overhead-press', 'Overhead Press', 'shoulders', 'barbell', 'weight', [5, 8], 2.5, 180, { secondary: ['triceps'] }],
  ['lateral-raise', 'Lateral Raise', 'shoulders', 'dumbbell', 'weight', [12, 20], 1, 60],
  ['face-pull', 'Face Pull', 'shoulders', 'cable', 'weight', [12, 20], 2.5, 60, { secondary: ['back'] }],
  ['pike-push-up', 'Pike Push-up', 'shoulders', 'bodyweight', 'bodyweight', [6, 12], 0, 90],
  ['handstand-hold', 'Handstand Hold', 'shoulders', 'bodyweight', 'duration', [20, 45], 0, 90],
  ['triceps-pushdown', 'Triceps Pushdown', 'triceps', 'cable', 'weight', [10, 15], 2.5, 75],
  ['skull-crusher', 'Skull Crusher', 'triceps', 'barbell', 'weight', [8, 12], 2.5, 90],
  ['pull-up', 'Pull-up', 'back', 'bodyweight', 'weighted-bodyweight', [5, 10], 2.5, 150, { secondary: ['biceps'] }],
  ['chin-up', 'Chin-up', 'back', 'bodyweight', 'weighted-bodyweight', [5, 10], 2.5, 150, { secondary: ['biceps'] }],
  ['muscle-up', 'Muscle-up', 'back', 'bodyweight', 'bodyweight', [3, 6], 0, 150, { secondary: ['chest', 'triceps'] }],
  ['barbell-row', 'Barbell Row', 'back', 'barbell', 'weight', [6, 10], 2.5, 150, { secondary: ['biceps'] }],
  ['lat-pulldown', 'Lat Pulldown', 'back', 'machine', 'weight', [8, 12], 5, 120, { secondary: ['biceps'] }],
  ['seated-row', 'Seated Cable Row', 'back', 'cable', 'weight', [8, 12], 5, 120],
  ['deadlift', 'Deadlift', 'back', 'barbell', 'weight', [3, 6], 5, 240, { secondary: ['hamstrings', 'glutes'] }],
  ['barbell-curl', 'Barbell Curl', 'biceps', 'barbell', 'weight', [8, 12], 2.5, 75],
  ['hammer-curl', 'Hammer Curl', 'biceps', 'dumbbell', 'weight', [10, 15], 1, 60, { secondary: ['forearms'] }],
  ['back-squat', 'Back Squat', 'quads', 'barbell', 'weight', [5, 8], 2.5, 210, { secondary: ['glutes'] }],
  ['front-squat', 'Front Squat', 'quads', 'barbell', 'weight', [5, 8], 2.5, 180, { secondary: ['core'] }],
  ['bulgarian-split-squat', 'Bulgarian Split Squat', 'quads', 'dumbbell', 'weight', [8, 12], 2, 120, { unilateral: true, secondary: ['glutes'] }],
  ['leg-press', 'Leg Press', 'quads', 'machine', 'weight', [10, 15], 10, 120],
  ['leg-extension', 'Leg Extension', 'quads', 'machine', 'weight', [10, 15], 5, 75],
  ['pistol-squat', 'Pistol Squat', 'quads', 'bodyweight', 'bodyweight', [5, 10], 0, 90, { unilateral: true }],
  ['romanian-deadlift', 'Romanian Deadlift', 'hamstrings', 'barbell', 'weight', [6, 10], 2.5, 150, { secondary: ['glutes', 'back'] }],
  ['leg-curl', 'Leg Curl', 'hamstrings', 'machine', 'weight', [10, 15], 5, 75],
  ['nordic-curl', 'Nordic Curl', 'hamstrings', 'bodyweight', 'bodyweight', [4, 8], 0, 120],
  ['hip-thrust', 'Hip Thrust', 'glutes', 'barbell', 'weight', [8, 12], 5, 120],
  ['calf-raise', 'Calf Raise', 'calves', 'machine', 'weight', [10, 20], 5, 60],
  ['hanging-leg-raise', 'Hanging Leg Raise', 'core', 'bodyweight', 'bodyweight', [8, 15], 0, 75],
  ['l-sit', 'L-sit', 'core', 'bodyweight', 'duration', [15, 30], 0, 75],
  ['plank', 'Plank', 'core', 'bodyweight', 'duration', [45, 90], 0, 60],
  ['ab-wheel', 'Ab Wheel', 'core', 'other', 'bodyweight', [8, 15], 0, 75],
  ['kettlebell-swing', 'Kettlebell Swing', 'full', 'kettlebell', 'weight', [15, 25], 4, 90, { secondary: ['hamstrings', 'glutes'] }],
]

export const BUILTIN_EXERCISES: Exercise[] = DEFS.map(([id, name, muscle, equipment, kind, repRange, increment, restS, extra]) => ({
  id,
  name,
  muscle,
  equipment,
  kind,
  repRange,
  targetRpe: 8,
  increment,
  restS,
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

export const LEG_MUSCLES: Muscle[] = ['quads', 'hamstrings', 'glutes', 'calves']

export const BUILTIN_ROUTINES: Routine[] = [
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
      { exerciseId: 'pull-up', sets: 3 },
      { exerciseId: 'dips', sets: 3 },
      { exerciseId: 'muscle-up', sets: 3 },
      { exerciseId: 'pistol-squat', sets: 3 },
      { exerciseId: 'l-sit', sets: 3 },
      { exerciseId: 'handstand-hold', sets: 3 },
    ],
  },
]
