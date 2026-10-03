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
// The age band is required (RP-041, 037); '13_17' unless a test sets it.
const form = (fields: Record<string, string | string[]>) => {
  const fd = new FormData()
  const all = { ...('age_status' in fields ? {} : { age_band: '13_17' }), ...fields }
  for (const [k, v] of Object.entries(all)) for (const x of [v].flat()) fd.append(k, x)
  return fd
}
const tables = () => ({
  profiles: [{ id: COACH.id, role: 'coach' }],
  teams: [{ id: 't1', coach_id: COACH.id, age_group: 'High School' }, { id: 't12', coach_id: COACH.id, age_group: 'Youth 10-12' }],
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
  assert.equal(r.success, "Invite sent to sam@example.com. Sam New is marked 13 to 17.")
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
  assert.match(r.error ?? '', /invite link could not be created/)
  assert.doesNotMatch(r.error ?? '', /boom/, 'no raw provider text')
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
  assert.equal((await invitePlayer(undefined, form({ player_email: 'x@example.com' }))).error, 'Could not add this player. Please try again.')

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

test('18+ invite: the confirmation is saved and the message says so', async () => {
  const r = await invitePlayer(undefined, form({ full_name: 'Al Adult', player_email: 'al@example.com', age_status: 'adult' }))
  assert.equal(r.success, 'Invite sent to al@example.com. Al Adult is marked 18+.')
  assert.equal(state.tables.players[0].adult_confirmed_by, COACH.id)
  assert.ok(state.tables.players[0].adult_confirmed_at)
  assert.equal(state.tables.players[0].age_band_coach, '18_plus')
  assert.equal(state.tables.players[0].age_band, '18_plus')
  assert.equal(state.tables.players[0].age_band_source, 'coach')
})

test('13 to 17 invite: the coach\'s band is stored, no 18+ confirmation', async () => {
  await invitePlayer(undefined, form({ full_name: 'Tia Teen', player_email: 'tia@example.com', age_band: '13_17' }))
  const row = state.tables.players[0]
  assert.equal(row.age_band_coach, '13_17'); assert.equal(row.age_band, '13_17'); assert.ok(row.age_confirmed_at)
  assert.equal(row.age_band_self ?? null, null, 'the player answers at first sign-in')
  assert.equal(row.age_screen_at ?? null, null)
  assert.equal(row.adult_confirmed_at ?? null, null)
})

test('under 13 is a hard stop: refused before anything is written or sent', async () => {
  const r = await invitePlayer(undefined, form({ full_name: 'Kid', player_email: 'kid@example.com', age_band: 'under_13', team_ids: ['t1'] }))
  assert.equal(r.error, "Players under 13 can't be added yet. Parent consent for players under 13 is coming soon.")
  assert.equal(state.tables.players.length, 0)
  assert.equal(state.tables.player_teams.length, 0)
  assert.equal(emailFake.invites.length, 0)
  assert.equal(authAdmin.links.length, 0)
})

test('a team with an under-13 age group ("Youth 10-12") counts as under 13: refused', async () => {
  const r = await invitePlayer(undefined, form({ full_name: 'Kid', player_email: 'kid@example.com', age_band: '18_plus', team_ids: ['t12'] }))
  assert.match(r.error ?? '', /age group is for players under 13/)
  assert.equal(state.tables.players.length, 0)
  assert.equal(emailFake.invites.length, 0)
})

test('the invite form has no guardian fields', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../../../app/dashboard/age-band-fields.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /guardian_email|guardian_name/)
  assert.match(src, /UNDER_13_INVITE_REFUSED/)
})

test('no 18+ / under-18 choice: error before anything is written', async () => {
  const fd = new FormData(); fd.append('player_email', 'x@example.com')
  const r = await invitePlayer(undefined, fd)
  assert.match(r.error ?? '', /under 13, 13 to 17, or 18 or older/)
  assert.equal(state.tables.players.length, 0)
  assert.equal(emailFake.invites.length, 0)
})

test('existing roster player marked 18+ but the confirmation write fails: error, not a success', async () => {
  state.tables.players.push({ id: 'p1', coach_id: COACH.id, email: 'kid@example.com', user_id: null, full_name: 'Kid', adult_confirmed_at: null })
  fail({ table: 'players', action: 'insert', error: { code: '23505', message: 'duplicate key' } })
  fail({ table: 'players', action: 'update', error: { code: '57014', message: 'timeout' } })
  const r = await invitePlayer(undefined, form({ player_email: 'kid@example.com', age_status: 'adult' }))
  assert.match(r.error ?? '', /18\+ confirmation could not be saved/)
  assert.equal(r.success, undefined)
  assert.equal(emailFake.invites.length, 0)
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
