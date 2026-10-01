/**
 * QA-016: invitePlayer's message matches what happened. An email that already
 * has an account gets no setup email, so the reply says so; a new email gets
 * the setup-email message only if the email was sent; failures are errors.
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/invite.test.ts
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake, fail, state } from './fakes/db'
import { authAdmin } from './fakes/supabase-admin'
import { emailFake } from './fakes/email'
import { invitePlayer } from '../../../app/actions/invite'

const COACH = { id: 'coach-1', email: 'coach@example.com' }
const form = (fields: Record<string, string | string[]>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) fd.append(k, x)
  return fd
}
const tables = () => ({
  profiles: [{ id: COACH.id, role: 'coach' }],
  teams: [{ id: 't1', coach_id: COACH.id }],
  players: [] as Record<string, unknown>[],
  player_teams: [] as Record<string, unknown>[],
})

beforeEach(() => {
  resetFake({ tables: tables(), user: COACH })
  authAdmin.reset()
  emailFake.reset()
})

test('new email: setup email is sent and the message says so', async () => {
  const r = await invitePlayer(undefined, form({ full_name: 'Sam New', player_email: 'Sam@Example.com' }))
  assert.deepEqual(emailFake.invites, [{ toEmail: 'sam@example.com' }])
  assert.match(r.success ?? '', /Sam New will receive an email to set up their account/)
  assert.equal(r.error, undefined)
  assert.equal(state.tables.players.length, 1)
})

test('email that already has an account: added, no email sent, message does not promise one', async () => {
  authAdmin.existingEmails.add('has@example.com')
  const r = await invitePlayer(undefined, form({ full_name: 'Has Account', player_email: 'has@example.com', team_ids: ['t1'] }))
  assert.equal(emailFake.invites.length, 0)
  assert.equal(r.success, 'has@example.com already has an account and has been added to your roster and to the selected team. No email was sent; they\'ll see it next time they sign in.')
  assert.doesNotMatch(r.success!, /set up|will receive/)
  assert.equal(state.tables.player_teams.length, 1)
})

test('already on this coach\'s roster with an account (the QA-016 case): says so, no email', async () => {
  state.tables.players.push({ id: 'p1', coach_id: COACH.id, email: 'kid@example.com', user_id: 'u-kid', full_name: 'Nolan George' })
  fail({ table: 'players', action: 'insert', error: { code: '23505', message: 'duplicate key' } })
  authAdmin.existingEmails.add('kid@example.com')
  const r = await invitePlayer(undefined, form({ full_name: 'nolan george', player_email: 'kid@example.com' }))
  assert.equal(r.success, 'kid@example.com already has an account and is already on your roster. No email was sent.')
  assert.equal(emailFake.invites.length, 0)
})

test('failed invite link: error, never a success', async () => {
  authAdmin.linkError = { code: 'unexpected_failure', message: 'boom' }
  const r = await invitePlayer(undefined, form({ player_email: 'x@example.com' }))
  assert.match(r.error ?? '', /invite link failed: boom/)
  assert.equal(r.success, undefined)
})

test('invite email not sent (provider error or not set up): error, never a success', async () => {
  emailFake.inviteResult = { error: 'Email sending is not set up' }
  const r = await invitePlayer(undefined, form({ player_email: 'x@example.com' }))
  assert.match(r.error ?? '', /invite email could not be sent \(Email sending is not set up\)/)
  assert.equal(r.success, undefined)

  resetFake({ tables: tables(), user: COACH }); emailFake.reset()
  emailFake.inviteResult = 'throw'
  const r2 = await invitePlayer(undefined, form({ player_email: 'y@example.com' }))
  assert.match(r2.error ?? '', /could not be sent \(network down\)/)
  assert.equal(r2.success, undefined)
})

test('team assignment fails: error, no email, no success', async () => {
  fail({ table: 'player_teams', action: 'upsert', error: { message: 'boom' } })
  const r = await invitePlayer(undefined, form({ player_email: 'x@example.com', team_id: 't1' }))
  assert.match(r.error ?? '', /could not be added to the team/)
  assert.equal(emailFake.invites.length, 0)
})

test('player insert or duplicate lookup fails: error', async () => {
  fail({ table: 'players', action: 'insert', error: { message: 'boom' } })
  assert.equal((await invitePlayer(undefined, form({ player_email: 'x@example.com' }))).error, 'boom')

  resetFake({ tables: tables(), user: COACH })
  fail({ table: 'players', action: 'insert', error: { code: '23505', message: 'duplicate key' } })
  fail({ table: 'players', action: 'select', error: { message: 'boom' } })
  const r = await invitePlayer(undefined, form({ player_email: 'x@example.com' }))
  assert.match(r.error ?? '', /Could not check this player/)
  assert.equal(emailFake.invites.length, 0)
})

test('another coach\'s player and self-signed-up player are still refused', async () => {
  state.tables.players.push({ id: 'p9', coach_id: 'other', email: 'o@example.com' })
  fail({ table: 'players', action: 'insert', error: { code: '23505', message: 'duplicate key' } })
  assert.match((await invitePlayer(undefined, form({ player_email: 'o@example.com' }))).error ?? '', /another coach/)
  assert.equal(emailFake.invites.length, 0)
})

test('team invite form note no longer promises an email to existing accounts', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../../../app/dashboard/team/[id]/team-invite-form.tsx', import.meta.url), 'utf8')
  assert.match(src, /already have an account are added without an email/)
})

test('already on the roster: partial failures say so instead of "Player added"', async () => {
  state.tables.players.push({ id: 'p1', coach_id: COACH.id, email: 'kid@example.com', user_id: null })
  fail({ table: 'players', action: 'insert', error: { code: '23505', message: 'duplicate key' } })
  fail({ table: 'player_teams', action: 'upsert', error: { message: 'boom' } })
  const r = await invitePlayer(undefined, form({ player_email: 'kid@example.com', team_id: 't1' }))
  assert.equal(r.error, 'kid@example.com is already on your roster, but they could not be added to the team. Please try again.')

  resetFake({ tables: tables(), user: COACH }); emailFake.reset()
  state.tables.players.push({ id: 'p1', coach_id: COACH.id, email: 'kid@example.com', user_id: null })
  fail({ table: 'players', action: 'insert', error: { code: '23505', message: 'duplicate key' } })
  emailFake.inviteResult = { error: 'provider down' }
  const r2 = await invitePlayer(undefined, form({ player_email: 'kid@example.com' }))
  assert.equal(r2.error, 'kid@example.com is already on your roster, but the invite email could not be sent (provider down). Please try again.')
  assert.doesNotMatch(r2.error!, /Player added/)

  // A new player keeps "Player added, but".
  resetFake({ tables: tables(), user: COACH }); emailFake.reset()
  emailFake.inviteResult = { error: 'provider down' }
  assert.match((await invitePlayer(undefined, form({ player_email: 'new@example.com' }))).error ?? '', /^Player added, but the invite email could not be sent/)
})

test('already on the roster with an account, new team: will see it next time they sign in', async () => {
  state.tables.players.push({ id: 'p1', coach_id: COACH.id, email: 'kid@example.com', user_id: 'u-kid' })
  fail({ table: 'players', action: 'insert', error: { code: '23505', message: 'duplicate key' } })
  authAdmin.existingEmails.add('kid@example.com')
  const r = await invitePlayer(undefined, form({ player_email: 'kid@example.com', team_id: 't1' }))
  assert.equal(r.success, "kid@example.com already has an account and is already on your roster. They've been added to the selected team and will see it next time they sign in. No email was sent.")
})
