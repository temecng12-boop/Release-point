/**
 * Attach email later + invite + claim: same player id, no duplicate row.
 * Duplicate email writes nothing. Off-team coach is refused.
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/roster-email.test.ts
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake, state } from './fakes/db'
import { authAdmin } from './fakes/supabase-admin'
import { emailFake } from './fakes/email'
import { addRosterPlayer, attachPlayerEmail } from '../../../app/actions/roster'
import { linkPlayerRow } from '../../../app/actions/auth'
import { confirmAgeAndTerms } from '../../../app/actions/age'
import { findInviteForEmail } from '../../invite-gate'
import { supabaseAdmin } from './fakes/supabase-admin'
import { EMAIL_ALREADY_LINKED, EMAIL_SAVED_INVITE_FAILED, ATTACH_NOT_AUTHORIZED } from '../../roster-consent'

const COACH = { id: 'coach-1', email: 'coach@example.com' }
const ASST = { id: 'asst-1', email: 'dad@example.com' }
const OTHER = { id: 'coach-b', email: 'b@example.com' }
const THIS_YEAR = new Date().getFullYear()
const ADULT_YEAR = String(THIS_YEAR - 20)
const KID_YEAR = String(THIS_YEAR - 10)
const AUTH_JR = '11111111-1111-4111-8111-111111111111'

const addForm = (fields: Record<string, string>) => {
  const fd = new FormData()
  fd.append('birth_month', '6')
  fd.append('birth_year', ADULT_YEAR)
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return fd
}

const attachForm = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return fd
}

const tables = () => ({
  profiles: [
    { id: COACH.id, role: 'coach' },
    { id: ASST.id, role: 'coach' },
    { id: OTHER.id, role: 'coach' },
  ],
  teams: [
    { id: 't1', coach_id: COACH.id, age_group: 'High School' },
    { id: 't2', coach_id: OTHER.id, age_group: 'High School' },
  ],
  team_coaches: [
    { team_id: 't1', coach_id: COACH.id, role: 'organizer' },
    { team_id: 't1', coach_id: ASST.id, role: 'assistant' },
    { team_id: 't2', coach_id: OTHER.id, role: 'organizer' },
  ],
  players: [] as Record<string, unknown>[],
  player_teams: [] as Record<string, unknown>[],
  player_video_consents: [] as Record<string, unknown>[],
  clips: [] as Record<string, unknown>[],
})

beforeEach(() => {
  resetFake({ tables: tables(), user: COACH })
  authAdmin.reset()
  emailFake.reset()
})

test('add roster-only, attach email and invite, accept: same player id, one row', async () => {
  const added = await addRosterPlayer(undefined, addForm({ full_name: 'Jared Jr', team_id: 't1' }))
  assert.equal(added.error, undefined)
  const playerId = state.tables.players[0].id as string
  state.tables.clips.push({ id: 'c1', player_id: playerId, title: 'Bullpen', storage_path: `${playerId}/1.mp4` })

  const attached = await attachPlayerEmail(undefined, attachForm({
    player_id: playerId,
    player_email: 'Jr@Example.com',
    send_invite: 'on',
  }))
  assert.equal(attached.error, undefined)
  assert.equal(state.tables.players[0].email, 'jr@example.com')
  assert.equal(state.tables.players[0].user_id, null)
  assert.equal(authAdmin.links.length, 1)
  assert.equal(emailFake.invites.length, 1)
  assert.equal(emailFake.invites[0].toEmail, 'jr@example.com')

  resetFake({
    tables: state.tables,
    user: { id: 'auth-jr', email: 'jr@example.com', user_metadata: { role: 'player', full_name: 'Jared Jr' } },
  })
  const claimed = await linkPlayerRow()
  assert.deepEqual(claimed, { success: true })
  assert.equal(state.tables.players.filter(p => p.email === 'jr@example.com').length, 1)
  assert.equal(state.tables.players[0].id, playerId)
  assert.equal(state.tables.players[0].user_id, 'auth-jr')
  assert.equal(state.tables.clips[0].player_id, playerId)
})

test('duplicate email is refused, with nothing written', async () => {
  await addRosterPlayer(undefined, addForm({ full_name: 'A', team_id: 't1' }))
  const playerId = state.tables.players[0].id as string
  state.tables.players.push({ id: 'p-other', coach_id: COACH.id, email: 'used@example.com', user_id: null })
  const before = structuredClone(state.tables.players)
  const r = await attachPlayerEmail(undefined, attachForm({
    player_id: playerId,
    player_email: 'USED@example.com',
    send_invite: 'on',
  }))
  assert.equal(r.error, EMAIL_ALREADY_LINKED)
  assert.equal(state.tables.players[0].email, null)
  assert.equal(authAdmin.links.length, 0)
  assert.equal(emailFake.invites.length, 0)
  assert.equal(state.tables.players.length, before.length)
})

test('coach from another team cannot attach an email', async () => {
  await addRosterPlayer(undefined, addForm({ full_name: 'A', team_id: 't1' }))
  const playerId = state.tables.players[0].id as string
  resetFake({ tables: state.tables, user: OTHER })
  const r = await attachPlayerEmail(undefined, attachForm({
    player_id: playerId,
    player_email: 'x@example.com',
    send_invite: 'on',
  }))
  assert.equal(r.error, ATTACH_NOT_AUTHORIZED)
  assert.equal(state.tables.players[0].email, null)
  assert.equal(authAdmin.links.length, 0)
})

test('assistant on the team can attach an email', async () => {
  await addRosterPlayer(undefined, addForm({ full_name: 'A', team_id: 't1' }))
  const playerId = state.tables.players[0].id as string
  resetFake({ tables: state.tables, user: ASST })
  const r = await attachPlayerEmail(undefined, attachForm({
    player_id: playerId,
    player_email: 'son@example.com',
    send_invite: 'on',
  }))
  assert.equal(r.error, undefined)
  assert.equal(state.tables.players[0].email, 'son@example.com')
  assert.equal(authAdmin.links.length, 1)
})

test('email saved but invite send fails: honest message and copyable link', async () => {
  await addRosterPlayer(undefined, addForm({ full_name: 'A', team_id: 't1' }))
  const playerId = state.tables.players[0].id as string
  emailFake.inviteResult = { error: 'provider down' }
  const r = await attachPlayerEmail(undefined, attachForm({
    player_id: playerId,
    player_email: 'later@example.com',
    send_invite: 'on',
  }))
  assert.equal(r.error, EMAIL_SAVED_INVITE_FAILED)
  assert.equal(r.success, undefined)
  assert.equal(state.tables.players[0].email, 'later@example.com')
  assert.match(r.inviteUrl ?? '', /\/auth\/confirm\?token_hash=/)
})

test('save email without sending: no generateLink', async () => {
  await addRosterPlayer(undefined, addForm({ full_name: 'A', team_id: 't1' }))
  const playerId = state.tables.players[0].id as string
  const r = await attachPlayerEmail(undefined, attachForm({
    player_id: playerId,
    player_email: 'hold@example.com',
  }))
  assert.match(r.success ?? '', /Email saved/)
  assert.equal(authAdmin.links.length, 0)
  assert.equal(emailFake.invites.length, 0)
})

test('attached email is an invite the 042 hook would allow', async () => {
  await addRosterPlayer(undefined, addForm({ full_name: 'A', team_id: 't1' }))
  const playerId = state.tables.players[0].id as string
  await attachPlayerEmail(undefined, attachForm({
    player_id: playerId,
    player_email: '  Jr@Example.com ',
  }))
  assert.equal(state.tables.players[0].email, 'jr@example.com')
  assert.equal(await findInviteForEmail(supabaseAdmin, 'JR@example.com'), 'player')
  assert.equal(await findInviteForEmail(supabaseAdmin, 'stranger@example.com'), 'none')
})

test('email already on an auth account is refused, nothing written', async () => {
  await addRosterPlayer(undefined, addForm({ full_name: 'A', team_id: 't1' }))
  const playerId = state.tables.players[0].id as string
  authAdmin.users.push({ id: 'u-exist', email: 'has@example.com' })
  const before = structuredClone(state.tables.players)
  const r = await attachPlayerEmail(undefined, attachForm({
    player_id: playerId,
    player_email: 'HAS@example.com',
    send_invite: 'on',
  }))
  assert.equal(r.error, EMAIL_ALREADY_LINKED)
  assert.deepEqual(state.tables.players, before)
  assert.equal(authAdmin.links.length, 0)
})

test('under-13 self-answer after accept freezes the same player row', async () => {
  const added = await addRosterPlayer(undefined, addForm({ full_name: 'Jared Jr', team_id: 't1' }))
  assert.equal(added.error, undefined)
  const playerId = state.tables.players[0].id as string
  state.tables.clips.push({ id: 'c1', player_id: playerId, title: 'Bullpen', storage_path: `${playerId}/1.mp4` })
  const attached = await attachPlayerEmail(undefined, attachForm({
    player_id: playerId,
    player_email: 'jr@example.com',
    send_invite: 'on',
  }))
  assert.equal(attached.error, undefined)

  resetFake({
    tables: state.tables,
    user: { id: AUTH_JR, email: 'jr@example.com', user_metadata: { role: 'player', full_name: 'Jared Jr' } },
  })
  assert.deepEqual(await linkPlayerRow(), { success: true })
  assert.equal(state.tables.players[0].id, playerId)
  assert.equal(state.tables.players[0].user_id, AUTH_JR)

  const age = await confirmAgeAndTerms(undefined, attachForm({
    birth_month: '1',
    birth_year: KID_YEAR,
  }))
  assert.equal(age.stopped, true)
  assert.equal(state.tables.players.filter(p => p.email === 'jr@example.com' || p.id === playerId).length, 1)
  assert.equal(state.tables.players[0].id, playerId)
  assert.equal(state.tables.players[0].user_id, AUTH_JR)
  assert.equal(state.tables.players[0].age_band, 'under_13')
  assert.equal(state.tables.players[0].age_band_self, 'under_13')
  assert.equal(state.tables.clips[0].player_id, playerId)
  const profile = state.tables.profiles.find(p => p.id === AUTH_JR)
  assert.equal(profile?.full_name ?? null, null)
  assert.ok(profile?.frozen_at)
  assert.ok(profile?.deletion_requested_at)
})

test('attach-email form: optional send-invite toggle and copyable link', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../../../app/dashboard/attach-email-form.tsx', import.meta.url), 'utf8')
  assert.match(src, /attachPlayerEmail/)
  assert.match(src, /Send invite now/)
  assert.match(src, /name="send_invite"/)
  assert.match(src, /InviteLinkBox/)
})
