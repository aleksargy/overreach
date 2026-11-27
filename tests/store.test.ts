import assert from 'node:assert/strict'
import { test } from 'node:test'
import { upgrade, type UserData } from '../src/data/store'

const saved = (sync: UserData['sync'] | { mode: 'sample' }): UserData =>
  ({
    version: 3,
    profile: { name: 'Sam', hrMax: 190, hrRest: 50 },
    matches: [],
    hiddenMatchIds: [],
    skippedRatings: [],
    workouts: [],
    customExercises: [],
    exerciseEdits: {},
    routines: [],
    body: [],
    active: null,
    sync,
  }) as unknown as UserData

test('a phone that never synced starts blank rather than on sample data, and a connected one stays connected', () => {
  // before 4, not having synced was mode 'sample', and it showed the sample athlete
  const blank = upgrade(saved({ mode: 'sample' }))
  assert.deepEqual([blank.version, blank.sync.mode, blank.sync.demo], [6, 'off', undefined])
  const live = upgrade(saved({ mode: 'live', passphrase: 'x', lastSync: '2026-11-17T08:00:00Z' }))
  assert.deepEqual([live.sync.mode, live.sync.passphrase], ['live', 'x'])
  // and the Demo switch stays where it was put
  assert.equal(upgrade(saved({ mode: 'off', demo: true })).sync.demo, true)
})

test('a phone saved before programmes has none, and keeps everything else', () => {
  const before = upgrade(saved({ mode: 'live' }))
  assert.deepEqual(before.programmes, [])
  const full = { id: 'p-full', name: 'Full body', routineIds: [], perWeek: 3, weeks: 10, runs: [{ start: '2026-11-16' }] }
  assert.deepEqual(upgrade({ ...saved({ mode: 'live' }), programmes: [full] }).programmes, [full])
})

test('sessions saved before they said what each exercise was done with take what the exercise is on now', () => {
  const session = (id: string, exerciseId: string, equipment?: string) => ({
    id,
    name: 'Push',
    start: '2026-11-20T18:00:00.000Z',
    end: '2026-11-20T19:00:00.000Z',
    source: 'manual',
    exercises: [{ id: `${id}-e`, exerciseId, equipment, sets: [] }],
  })
  const before = {
    ...saved({ mode: 'live' }),
    // lateral raises come as a dumbbell lift; this phone has put them on a cable
    exerciseEdits: { 'lateral-raise': { equipment: 'cable' } },
    customExercises: [
      { id: 'custom-press', name: 'Landmine press', muscle: 'shoulders', equipment: 'barbell', kind: 'weight', custom: true, repRange: [6, 10], targetRpe: 8, increment: 2.5 },
    ],
    workouts: [session('a', 'lateral-raise'), session('b', 'bench-press'), session('c', 'custom-press'), session('d', 'lateral-raise', 'dumbbell'), session('e', 'gone')],
  } as unknown as UserData
  const after = upgrade(before)
  assert.equal(after.version, 6)
  assert.deepEqual(
    after.workouts.map((w) => w.exercises[0].equipment),
    // as it's set now, as it comes, your own exercise's, one that already says, and an exercise that's gone
    ['cable', 'barbell', 'barbell', 'dumbbell', undefined],
  )
  // and nothing else about them moves
  assert.deepEqual(upgrade(after).workouts, after.workouts)
})
