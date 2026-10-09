/**
 * Roster-only add: no account, no generateLink, optional email, coach band
 * stored, under-13 refused before any write. 13–17 needs one consent kind.
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/roster.test.ts
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake, fail, state } from './fakes/db'
import { authAdmin } from './fakes/supabase-admin'
import { emailFake } from './fakes/email'
import { addRosterPlayer } from '../../../app/actions/roster'
import { UNDER_13_INVITE_REFUSED } from '../../under13-mode'
import { BIRTH_INVALID } from '../../age-band'
import { EMAIL_ALREADY_LINKED, MINOR_CONSENT_REQUIRED, ROSTER_PLAYER_ADDED } from '../../roster-consent'

const COACH = { id: 'coach-1', email: 'coach@example.com' }
const ASST = { id: 'asst-1', email: 'dad@example.com' }
const THIS_YEAR = new Date().getFullYear()
const TEEN_YEAR = String(THIS_YEAR - 15)
const ADULT_YEAR = String(THIS_YEAR - 20)
const KID_YEAR = String(THIS_YEAR - 10)

const form = (fields: Record<string, string | string[]>) => {
  const fd = new FormData()
  if (!('birth_month' in fields)) fd.append('birth_month', '6')
  if (!('birth_year' in fields)) fd.append('birth_year', TEEN_YEAR)
  if (!('minor_consent' in fields) && !('birth_year' in fields)) fd.append('minor_consent', 'coach_is_guardian')
  if (!('minor_consent' in fields) && fields.birth_year === TEEN_YEAR) fd.append('minor_consent', 'coach_is_guardian')
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) fd.append(k, x)
  return fd
}

const tables = () => ({
  profiles: [
    { id: COACH.id, role: 'coach' },
    { id: ASST.id, role: 'coach' },
  ],
  teams: [{ id: 't1', coach_id: COACH.id, age_group: 'High School' }],
  team_coaches: [
    { team_id: 't1', coach_id: COACH.id, role: 'organizer' },
    { team_id: 't1', coach_id: ASST.id, role: 'assistant' },
  ],
  players: [] as Record<string, unknown>[],
  player_teams: [] as Record<string, unknown>[],
  player_video_consents: [] as Record<string, unknown>[],
})

beforeEach(() => {
  resetFake({ tables: tables(), user: COACH })
  authAdmin.reset()
  emailFake.reset()
})

test('add without email: roster row, no generateLink, hook never hit', async () => {
  const r = await addRosterPlayer(undefined, form({ full_name: 'Sam Roster', team_id: 't1' }))
  assert.equal(r.error, undefined)
  assert.equal(r.success, ROSTER_PLAYER_ADDED)
  assert.equal(state.tables.players.length, 1)
  const row = state.tables.players[0]
  assert.equal(row.user_id, null)
  assert.equal(row.email, null)
  assert.equal(row.age_band_coach, '13_17')
  assert.equal(row.full_name, 'Sam Roster')
  assert.equal(state.tables.player_teams.length, 1)
  assert.equal(state.tables.player_video_consents.length, 1)
  assert.equal(state.tables.player_video_consents[0].kind, 'coach_is_guardian')
  assert.equal(authAdmin.links.length, 0)
  assert.equal(emailFake.invites.length, 0)
})

test('add with email: stores normalized email, still no generateLink', async () => {
  const r = await addRosterPlayer(undefined, form({
    full_name: 'Sam Mail',
    player_email: 'Sam@Example.com',
    team_id: 't1',
    birth_year: ADULT_YEAR,
  }))
  assert.equal(r.error, undefined)
  assert.equal(state.tables.players[0].email, 'sam@example.com')
  assert.equal(state.tables.players[0].user_id, null)
  assert.equal(state.tables.players[0].age_band_coach, '18_plus')
  assert.equal(state.tables.player_video_consents.length, 0, '18+ needs no consent row')
  assert.equal(authAdmin.links.length, 0)
  assert.equal(emailFake.invites.length, 0)
})

test('under-13 refused on the server before any write', async () => {
  const r = await addRosterPlayer(undefined, form({
    full_name: 'Too Young',
    birth_month: '1',
    birth_year: KID_YEAR,
    team_id: 't1',
  }))
  assert.equal(r.error, UNDER_13_INVITE_REFUSED)
  assert.equal(r.success, undefined)
  assert.equal(state.tables.players.length, 0)
  assert.equal(state.tables.player_teams.length, 0)
  assert.equal(state.tables.player_video_consents.length, 0)
  assert.equal(authAdmin.links.length, 0)
})

test('missing birth month/year refused, nothing written', async () => {
  const fd = new FormData()
  fd.append('full_name', 'No Birth')
  fd.append('team_id', 't1')
  const r = await addRosterPlayer(undefined, fd)
  assert.equal(r.error, BIRTH_INVALID)
  assert.equal(state.tables.players.length, 0)
})

test('13–17 without a consent choice is refused, nothing written', async () => {
  const fd = new FormData()
  fd.append('full_name', 'Teen')
  fd.append('birth_month', '6')
  fd.append('birth_year', TEEN_YEAR)
  fd.append('team_id', 't1')
  const r = await addRosterPlayer(undefined, fd)
  assert.equal(r.error, MINOR_CONSENT_REQUIRED)
  assert.equal(state.tables.players.length, 0)
})

test('assistant on the team can add a roster-only player', async () => {
  resetFake({ tables: tables(), user: ASST })
  const r = await addRosterPlayer(undefined, form({ full_name: 'Son Graham', team_id: 't1', birth_year: ADULT_YEAR }))
  assert.equal(r.error, undefined)
  assert.equal(state.tables.players[0].coach_id, ASST.id)
  assert.equal(state.tables.player_teams[0].team_id, 't1')
})

test('coach from another team cannot add to this team', async () => {
  state.tables.profiles.push({ id: 'other', role: 'coach' })
  resetFake({ tables: state.tables, user: { id: 'other', email: 'o@x.com' } })
  const r = await addRosterPlayer(undefined, form({ full_name: 'Steal', team_id: 't1', birth_year: ADULT_YEAR }))
  assert.equal(r.error, 'Invalid team')
  assert.equal(state.tables.players.length, 0)
})

test('duplicate email refused, nothing written', async () => {
  state.tables.players.push({ id: 'p-old', coach_id: COACH.id, email: 'taken@example.com', user_id: null })
  const r = await addRosterPlayer(undefined, form({
    full_name: 'Dup',
    player_email: 'Taken@example.com',
    team_id: 't1',
    birth_year: ADULT_YEAR,
  }))
  assert.equal(r.error, EMAIL_ALREADY_LINKED)
  assert.equal(state.tables.players.length, 1)
})

test('email already on an auth account is refused, nothing written', async () => {
  authAdmin.users.push({ id: 'u-exist', email: 'has@example.com' })
  const r = await addRosterPlayer(undefined, form({
    full_name: 'Has Acct',
    player_email: 'has@example.com',
    team_id: 't1',
    birth_year: ADULT_YEAR,
  }))
  assert.equal(r.error, EMAIL_ALREADY_LINKED)
  assert.equal(state.tables.players.length, 0)
})

test('consent insert failure rolls the player back — never looks like success', async () => {
  fail({ table: 'player_video_consents', action: 'insert', error: { message: 'boom' } })
  const r = await addRosterPlayer(undefined, form({ full_name: 'Teen', team_id: 't1' }))
  assert.match(r.error ?? '', /Could not record consent/)
  assert.equal(r.success, undefined)
  assert.equal(state.tables.players.length, 0)
})

test('add-player form: email optional, consent only for 13–17, no generateLink copy', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../../../app/dashboard/add-player-modal.tsx', import.meta.url), 'utf8')
  assert.match(src, /addRosterPlayer/)
  assert.match(src, /Player Email \(optional\)/)
  assert.match(src, /data-testid="minor-consent"/)
  assert.match(src, /showConsent/)
  assert.doesNotMatch(src, /generateLink|Send Player Invite/)
  assert.match(src, /MINOR_CONSENT_LABELS/)
  assert.match(src, /name="minor_consent"/)
})
