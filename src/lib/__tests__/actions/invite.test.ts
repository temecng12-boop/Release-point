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
// Birth month/year is required on every invite: default to a 15-year-old
// (firmly 13_17 whatever the month) unless the test passes its own.
const TEEN_YEAR = String(new Date().getFullYear() - 15)
const form = (fields: Record<string, string | string[]>) => {
  const fd = new FormData()
  if (!('birth_month' in fields)) fd.append('birth_month', '6')
  if (!('birth_year' in fields)) fd.append('birth_year', TEEN_YEAR)
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) fd.append(k, x)
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
  assert.equal(r.success, "Invite sent to sam@example.com. They'll confirm their age when they set up their account.")
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

test('birth month/year is required: missing fields -> neutral error, nothing written or sent', async () => {
  const fd = new FormData()
  fd.append('full_name', 'No Birth')
  fd.append('player_email', 'nobirth@example.com')
  const r = await invitePlayer(undefined, fd)
  assert.equal(r.error, 'Enter your birth month and year.')
  assert.equal(r.success, undefined)
  assert.equal(r.inviteUrl, undefined)
  assert.equal(state.tables.players.length, 0)
  assert.equal(emailFake.invites.length, 0)
  assert.equal(authAdmin.links.length, 0)
})

test('invite positions are optional: chips write the array; zero chips is valid; unknown tag is refused', async () => {
  const r = await invitePlayer(undefined, form({ full_name: 'Sam New', player_email: 'sam@example.com', positions: ['catcher', 'infield'] }))
  assert.equal(r.error, undefined)
  assert.deepEqual(state.tables.players[0].positions, ['catcher', 'infield'])
  assert.equal(state.tables.players[0].position, null)

  resetFake({ tables: tables(), user: COACH }); emailFake.reset(); authAdmin.reset()
  const empty = await invitePlayer(undefined, form({ full_name: 'No Pos', player_email: 'nopos@example.com' }))
  assert.equal(empty.error, undefined)
  assert.deepEqual(state.tables.players[0].positions, [])
  assert.equal(state.tables.players[0].position, null)

  resetFake({ tables: tables(), user: COACH }); emailFake.reset(); authAdmin.reset()
  const bad = await invitePlayer(undefined, form({ full_name: 'Bad', player_email: 'bad@example.com', positions: ['shortstop'] }))
  assert.match(bad.error ?? '', /valid position/)
  assert.equal(state.tables.players.length, 0)
})

test('the birth month/year is never stored: the row is created with no band, and any age-band fields sent are ignored', async () => {
  const r = await invitePlayer(undefined, form({ full_name: 'Tia Teen', player_email: 'tia@example.com', age_band: '18_plus', age_status: 'adult' }))
  assert.match(r.success ?? '', /confirm their age when they set up their account/)
  const row = state.tables.players[0]
  for (const c of ['age_band', 'age_band_coach', 'age_band_self', 'age_screen_at', 'age_confirmed_at', 'adult_confirmed_at']) assert.equal(row[c] ?? null, null, c)
  assert.equal(emailFake.invites.length, 1)
})

test('a team with an under-13 age group ("Youth 10-12") is refused before anything is written or sent', async () => {
  const r = await invitePlayer(undefined, form({ full_name: 'Kid', player_email: 'kid@example.com', team_ids: ['t12'] }))
  assert.match(r.error ?? '', /age group is for players under 13/)
  assert.equal(state.tables.players.length, 0)
  assert.equal(emailFake.invites.length, 0)
  assert.equal(authAdmin.links.length, 0)
})

test('a grade-range team ("9-12") is not an under-13 group: invite goes out', async () => {
  state.tables.teams.push({ id: 't9', coach_id: COACH.id, age_group: '9-12' })
  const r = await invitePlayer(undefined, form({ full_name: 'Hi Schooler', player_email: 'hs@example.com', team_ids: ['t9'] }))
  assert.equal(r.error, undefined)
  assert.equal(state.tables.player_teams.length, 1)
})

test('the invite forms collect birth month/year (required) but no band and no guardian fields', async () => {
  const { readFileSync, existsSync } = await import('node:fs')
  for (const f of ['../../../app/dashboard/invite-form.tsx', '../../../app/dashboard/team/[id]/team-invite-form.tsx']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8')
    assert.doesNotMatch(src, /age_band|AgeBandFields|guardian_email|guardian_name/, f)
    assert.match(src, /name="birth_month"[^>]*required/, `${f}: birth month is required`)
    assert.match(src, /name="birth_year"[^>]*required/, `${f}: birth year is required`)
    assert.match(src, /under 13/i, `${f}: honest under-13 copy, no promise`)
    assert.doesNotMatch(src, /coming soon|soon\.|will be able/i, `${f}: no promise to under-13s`)
  }
  assert.equal(existsSync(new URL('../../../app/dashboard/age-band-fields.tsx', import.meta.url)), false, 'the band picker component is gone')
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

test('success returns the invite link so the coach can copy it', async () => {
  const r = await invitePlayer(undefined, form({ full_name: 'Sam New', player_email: 'sam@example.com' }))
  assert.equal(r.error, undefined)
  assert.match(r.inviteUrl ?? '', /\/auth\/confirm\?token_hash=.+&type=invite&next=%2Fonboarding/)
})

test('email failure still returns the invite link so the coach can text it', async () => {
  emailFake.inviteResult = { error: 'domain not verified' }
  const r = await invitePlayer(undefined, form({ full_name: 'Sam New', player_email: 'sam@example.com' }))
  assert.match(r.error ?? '', /invite email could not be sent \(domain not verified\)/)
  assert.equal(r.success, undefined)
  assert.match(r.inviteUrl ?? '', /\/auth\/confirm\?token_hash=.+&type=invite&next=%2Fonboarding/)
})

test('already-on-roster email failure also returns the invite link', async () => {
  state.tables.players.push({ id: 'p1', coach_id: COACH.id, email: 'kid@example.com', user_id: null })
  fail({ table: 'players', action: 'insert', error: { code: '23505', message: 'duplicate key' } })
  emailFake.inviteResult = { error: 'domain not verified' }
  const r = await invitePlayer(undefined, form({ player_email: 'kid@example.com' }))
  assert.match(r.error ?? '', /already on your roster/)
  assert.match(r.inviteUrl ?? '', /\/auth\/confirm\?token_hash=.+&type=invite&next=%2Fonboarding/)
})

test('all app mail sends from the verified releasepointai.com address', async () => {
  const { readFileSync } = await import('node:fs')
  for (const f of ['../../../lib/email.ts', '../../../../scripts/invite-coach.mjs']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8')
    assert.match(src, /Release Point AI <notifications@releasepointai\.com>/, f)
    assert.doesNotMatch(src, /releasepoint\.app/, `${f}: no unverified domain`)
  }
})

test('invite emails use Release Point AI in from-name, subject, and body', async () => {
  const { readFileSync } = await import('node:fs')
  const inviteFns = ['sendPlayerInviteEmail', 'sendCoachInviteEmail']
  const email = readFileSync(new URL('../../../lib/email.ts', import.meta.url), 'utf8')
  const script = readFileSync(new URL('../../../../scripts/invite-coach.mjs', import.meta.url), 'utf8')
  for (const name of inviteFns) {
    const start = email.indexOf(`export async function ${name}`)
    assert.ok(start >= 0, name)
    const next = email.indexOf('export async function', start + 1)
    const fn = email.slice(start, next < 0 ? email.length : next)
    const leftover = fn.replace(/Release Point AI/g, '')
    assert.ok(!leftover.includes('Release Point'), `${name}: bare brand`)
    assert.match(fn, /invited you to (join |coach on )?Release Point AI/)
  }
  const leftoverScript = script.replace(/Release Point AI/g, '')
  assert.ok(!leftoverScript.includes('Release Point'), 'invite-coach.mjs: bare brand')
  assert.match(script, /invited to coach on Release Point AI/)
  const invites = readFileSync(new URL('../../../app/actions/coach-invites.ts', import.meta.url), 'utf8')
  assert.match(invites, /\|\| 'Release Point AI'/)
  assert.doesNotMatch(invites, /\|\| 'Release Point'/)
})

test('clip-uploaded, waitlist, and player-joined emails use Release Point AI', async () => {
  const { readFileSync } = await import('node:fs')
  const email = readFileSync(new URL('../../../lib/email.ts', import.meta.url), 'utf8')
  for (const name of ['sendClipUploadedEmail', 'sendWaitlistNotification', 'sendPlayerJoinedEmail']) {
    const start = email.indexOf(`export async function ${name}`)
    assert.ok(start >= 0, name)
    const next = email.indexOf('export async function', start + 1)
    const fn = email.slice(start, next < 0 ? email.length : next)
    const leftover = fn.replace(/Release Point AI/g, '')
    assert.ok(!leftover.includes('Release Point'), `${name}: bare brand`)
  }
  assert.match(email, /coach on Release Point AI/)
  assert.match(email, /Release Point AI Waitlist/)
})

test('invite forms surface a copyable invite link on success and on email failure', async () => {
  const { readFileSync } = await import('node:fs')
  for (const f of ['../../../app/dashboard/invite-form.tsx', '../../../app/dashboard/team/[id]/team-invite-form.tsx']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8')
    assert.match(src, /InviteLinkBox/, f)
    assert.match(src, /state\?\.inviteUrl/, `${f}: link shows in both success and error states`)
  }
  const box = readFileSync(new URL('../../../app/dashboard/invite-link-box.tsx', import.meta.url), 'utf8')
  assert.match(box, /Copy/, 'copy button')
  assert.match(box, /navigator\.clipboard\.writeText\(inviteUrl\)/, 'copies the link')
  assert.match(box, /aria-label="Invite link"/, 'link is selectable')
})
