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
  assert.deepEqual([blank.version, blank.sync.mode, blank.sync.demo], [4, 'off', undefined])
  const live = upgrade(saved({ mode: 'live', passphrase: 'x', lastSync: '2026-11-17T08:00:00Z' }))
  assert.deepEqual([live.sync.mode, live.sync.passphrase], ['live', 'x'])
  // and the Demo switch stays where it was put
  assert.equal(upgrade(saved({ mode: 'off', demo: true })).sync.demo, true)
})
