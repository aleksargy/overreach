import assert from 'node:assert/strict'
import { test } from 'node:test'
import { counts, describe, merge, readBackup, type Backup } from '../src/lib/backup'
import type { BodyEntry, Match, Profile, Workout } from '../src/data/types'

const profile = { name: 'Alex', hrMax: 189, hrRest: 47, team: 'Sunday Lads', format: 11, position: 'MID' } as Profile
const match = (id: string, note = '') => ({ id, date: '2026-10-19', note }) as unknown as Match
const workout = (id: string) => ({ id, name: 'Push', start: '2026-10-20T18:00:00.000Z', exercises: [], source: 'manual' }) as unknown as Workout
const weighIn = (id: string) => ({ id, date: '2026-10-21T07:00:00.000Z', weightKg: 78.4, source: 'manual' }) as BodyEntry

const phone = (over: Partial<Backup> = {}): Backup => ({
  profile,
  matches: [],
  hiddenMatchIds: [],
  skippedRatings: [],
  workouts: [],
  customExercises: [],
  exerciseEdits: {},
  routines: [],
  body: [],
  ...over,
})

test('folding in a saved copy keeps the phone’s version and never brings back a deleted match', () => {
  const mine = phone({ matches: [match('m-1', 'edited on the phone')], hiddenMatchIds: ['m-2'], body: [weighIn('b-1')] })
  const saved = {
    matches: [match('m-1', 'old'), match('m-2'), match('m-3')],
    workouts: [workout('w-1')],
    body: [weighIn('b-1'), weighIn('b-2')],
    profile: { ...profile, name: 'Old name' },
  }
  const out = merge(mine, saved)
  assert.deepEqual(
    out.matches.map((m) => m.id),
    ['m-1', 'm-3'],
  )
  assert.equal((out.matches[0] as unknown as { note: string }).note, 'edited on the phone')
  assert.deepEqual(
    out.body.map((b) => b.id),
    ['b-1', 'b-2'],
  )
  assert.equal(out.workouts.length, 1)
  // the phone already had data of its own, so its settings stay
  assert.equal(out.profile.name, 'Alex')
})

test('a phone with nothing of yours takes the saved settings too', () => {
  const out = merge(phone({ profile: { ...profile, name: 'You' } }), { matches: [match('m-1')], profile: { ...profile, name: 'Alex', hrMax: 192 } })
  assert.equal(out.profile.name, 'Alex')
  assert.equal(out.profile.hrMax, 192)
})

test('reads a backup file or the server’s copy, and refuses anything else', () => {
  const file = { app: 'Overreach', v: 1, exportedAt: '2026-10-25T10:00:00.000Z', matches: [match('m-1')], body: [weighIn('b-1')] }
  assert.deepEqual(counts(readBackup(file)!), { matches: 1, workouts: 0, body: 1 })
  assert.deepEqual(counts(readBackup({ v: 1, savedAt: 'x', data: { workouts: [workout('w-1')] } })!), { matches: 0, workouts: 1, body: 0 })
  assert.equal(readBackup({ matches: [{ no: 'id' }] }), null)
  assert.equal(readBackup({ hello: 'world' }), null)
  assert.equal(readBackup('nope'), null)
})

test('describes what came back in plain words', () => {
  assert.equal(describe({ matches: 12, workouts: 3, body: 8 }), '12 matches, 3 workouts and 8 weigh-ins')
  assert.equal(describe({ matches: 1, workouts: 0, body: 1 }), '1 match and 1 weigh-in')
  assert.equal(describe({ matches: 0, workouts: 0, body: 0 }), '')
})
