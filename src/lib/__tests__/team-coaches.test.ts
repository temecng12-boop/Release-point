/**
 * Team coaching staff list. No Supabase.
 * Run with: npx tsx --test src/lib/__tests__/team-coaches.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeTeamCoaches } from '../team-coaches-merge'

test('joins names and emails, organizer first then by name', () => {
  const out = mergeTeamCoaches(
    [{ coach_id: 'c3', role: 'assistant' }, { coach_id: 'c1', role: 'organizer' }, { coach_id: 'c2', role: 'assistant' }],
    [{ id: 'c1', full_name: 'Olivia Owner' }, { id: 'c2', full_name: 'Zed Assistant' }, { id: 'c3', full_name: 'Amy Assistant' }],
    { c1: 'o@x.com', c2: 'z@x.com', c3: null },
  )
  assert.deepEqual(out.map(c => c.coach_id), ['c1', 'c3', 'c2'])
  assert.deepEqual(out[0], { coach_id: 'c1', role: 'organizer', profiles: { full_name: 'Olivia Owner', email: 'o@x.com' } })
  assert.equal(out[1].profiles.email, null)
})

test('coaches without a profile row still appear, named by email', () => {
  const out = mergeTeamCoaches([{ coach_id: 'c9', role: 'assistant' }, { coach_id: 'c8', role: 'assistant' }], [], { c9: 'b@x.com', c8: 'a@x.com' })
  assert.deepEqual(out.map(c => c.profiles), [{ full_name: null, email: 'a@x.com' }, { full_name: null, email: 'b@x.com' }])
})

test('empty staff', () => {
  assert.deepEqual(mergeTeamCoaches([], [], {}), [])
})
