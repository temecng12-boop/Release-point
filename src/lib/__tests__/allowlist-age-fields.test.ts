// Client-writable allowlists (#45) must never carry age, consent or Terms columns.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickFields, OWN_PROFILE_FIELDS, ATHLETE_PROFILE_FIELDS, PLAYER_SELF_FIELDS } from '../action-fields'
import { COACH_EDITABLE_PLAYER_FIELDS, pickCoachEditableFields } from '../auth/roster-access'
import { AGE_BAND_MIGRATION_COLUMNS, CONSENT_MIGRATION_COLUMNS } from '../consent'

const PROTECTED = [
  ...AGE_BAND_MIGRATION_COLUMNS, ...CONSENT_MIGRATION_COLUMNS,
  'consent_given_at', 'guardian_id', 'coach_id', 'user_id', 'role',
]

const forged: Record<string, unknown> = Object.fromEntries(PROTECTED.map(c => [c, c.endsWith('_at') ? '2026-10-03T00:00:00Z' : '18_plus']))

for (const [name, spec] of Object.entries({ OWN_PROFILE_FIELDS, ATHLETE_PROFILE_FIELDS, PLAYER_SELF_FIELDS })) {
  test(`${name} has no age, consent or Terms column`, () => {
    for (const col of PROTECTED) assert.equal(col in spec, false, `${name} allows ${col}`)
    const picked = pickFields({ ...forged }, spec)
    assert.ok(picked.ok)
    if (picked.ok) assert.deepEqual(Object.keys(picked.fields), [])
  })
}

test('coach-editable player fields have no age band, consent or Terms column', () => {
  for (const col of PROTECTED) assert.equal((COACH_EDITABLE_PLAYER_FIELDS as readonly string[]).includes(col), false)
  assert.deepEqual(pickCoachEditableFields({ ...forged }), {})
})
