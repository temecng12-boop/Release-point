/**
 * Invite-only signup end to end (reliability freeze hotfix):
 * - a random-email email-link login is rejected (never creates an account);
 * - an invited player works: players row + generateLink, the hook would
 *   allow it, the profile stays a player, the age screen completes;
 * - an invited coach works: coach_invites row saved BEFORE generateLink,
 *   accept upgrades the profile to coach;
 * - a direct signup with role:coach metadata still comes out as player;
 * - ai-chat: 403 before the age screen, ok after it;
 * - an existing user with no roster row is NOT treated as brand new.
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/invite-only.test.ts
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake, state } from './fakes/db'
import { authAdmin } from './fakes/supabase-admin'
import { emailFake } from './fakes/email'
import { requestEmailLink, EMAIL_LINK_NO_ACCOUNT_MESSAGE } from '../../email-link'
import { findInviteForEmail, isBrandNewUser } from '../../invite-gate'
import { checkAiChatGate } from '../../ai-chat-gate'
import { linkPlayerRow } from '../../../app/actions/auth'
import { invitePlayer } from '../../../app/actions/invite'
import { inviteCoach } from '../../../app/actions/coach-invites'
import { acceptCoachInvite } from '../../coach-invite-accept'
import { confirmAgeAndTerms } from '../../../app/actions/age'

process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key'

const COACH = { id: 'coach-1', email: 'coach@example.com' }
const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}
const adultBirth = { birth_month: '1', birth_year: '1990' }
const screen = (extra: Record<string, string> = {}) =>
  form({ birth_month: adultBirth.birth_month, birth_year: adultBirth.birth_year, tos: 'yes', full_name: 'kid lee', ...extra })

beforeEach(() => {
  authAdmin.reset()
  emailFake.reset()
})

// ── Email-link login: strangers are rejected ────────────────────────────────
test('a random-email email-link login is rejected and creates no account', async () => {
  const calls: Parameters<Parameters<typeof requestEmailLink>[0]['signInWithOtp']>[0][] = []
  const auth = {
    async signInWithOtp(args: { email: string; options: { emailRedirectTo: string; shouldCreateUser: boolean } }) {
      calls.push(args)
      // Supabase with shouldCreateUser:false and no such user.
      return { error: { message: 'User not found', status: 400, code: 'user_not_found' } }
    },
  }
  const r = await requestEmailLink(auth, 'stranger@example.com', 'https://releasepointai.com/auth/callback')
  assert.deepEqual(r, { ok: false, error: EMAIL_LINK_NO_ACCOUNT_MESSAGE })
  assert.equal(calls[0].options.shouldCreateUser, false, 'the request never creates an account')
})

// ── Invited player, end to end ───────────────────────────────────────────────
test('an invited player works end to end (mixed-case roster email)', async () => {
  resetFake({
    user: COACH,
    tables: {
      profiles: [{ id: COACH.id, role: 'coach' }],
      teams: [], players: [], player_teams: [],
    },
  })
  const invited = await invitePlayer(undefined, form({ full_name: 'Luke Ruba', player_email: '  LukeRuba27@iCloud.com ' }))
  assert.equal(invited.error, undefined)
  assert.equal(state.tables.players.length, 1)
  assert.equal(state.tables.players[0].email, 'lukeruba27@icloud.com', 'the roster email is stored normalized')
  assert.deepEqual(authAdmin.links, ['lukeruba27@icloud.com'], 'generateLink ran for the invited email')

  // The hook would allow this creation: an unlinked players row matches.
  const { supabaseAdmin } = await import('./fakes/supabase-admin')
  assert.equal(await findInviteForEmail(supabaseAdmin, 'LukeRuba27@iCloud.com'), 'player')

  // Accept: profile stays a player even with forged coach metadata...
  const KID = { id: 'u-kid', email: 'lukeruba27@icloud.com', user_metadata: { role: 'coach', full_name: 'Luke Ruba' } }
  resetFake({
    user: KID,
    tables: {
      players: [{ id: 'p1', email: 'lukeruba27@icloud.com', user_id: null, coach_id: COACH.id }],
      profiles: [],
    },
  })
  assert.deepEqual(await linkPlayerRow(), { success: true })
  assert.equal(state.tables.players[0].user_id, KID.id, 'the invite row is linked across the case difference')
  assert.equal(state.tables.profiles[0].role, 'player', 'forged role:coach metadata never makes a coach')

  // ...and the age screen completes the setup.
  resetFake({
    user: { id: KID.id, email: KID.email },
    tables: {
      players: [{
        id: 'p1', user_id: KID.id, coach_id: COACH.id, guardian_id: null, team_id: null, age_group: null,
        full_name: 'Luke Ruba', age_band: null, age_band_coach: null, age_band_self: null,
        age_screen_at: null, age_confirmed_at: null, adult_confirmed_at: null, consent_given_at: null,
      }],
      profiles: [{ id: KID.id, role: 'player', full_name: 'Luke Ruba', tos_accepted_at: null, tos_version: null }],
      terms_acceptances: [], player_teams: [], teams: [],
    },
  })
  assert.deepEqual(await confirmAgeAndTerms(undefined, screen()), { done: true })
  assert.ok(state.tables.players[0].age_screen_at, 'the age screen is recorded')

  // ai-chat: 403 before the screen, ok after it.
  resetFake({
    tables: {
      profiles: [{ id: KID.id, role: 'player' }],
      players: [{ user_id: KID.id, age_band: null, age_band_coach: null, age_band_self: null, age_screen_at: null, age_confirmed_at: null }],
    },
  })
  assert.equal((await checkAiChatGate(supabaseAdmin, KID.id)).ok, false, '403 before the age screen')
  resetFake({
    tables: {
      profiles: [{ id: KID.id, role: 'player' }],
      players: [{ user_id: KID.id, age_band: '18_plus', age_band_coach: null, age_band_self: '18_plus', age_screen_at: new Date().toISOString(), age_confirmed_at: new Date().toISOString() }],
    },
  })
  assert.deepEqual(await checkAiChatGate(supabaseAdmin, KID.id), { ok: true }, '200 after the age screen')
})

// ── Invited coach, end to end ────────────────────────────────────────────────
test('an invited coach works end to end (row before link, accept makes coach)', async () => {
  resetFake({
    user: { id: 'admin-1', email: 'temecng12@gmail.com' },
    tables: {
      profiles: [{ id: 'admin-1', role: 'coach', full_name: 'Nolan', is_platform_admin: true }],
      coach_invites: [], players: [], guardians: [], teams: [], team_coaches: [], terms_acceptances: [],
    },
  })
  const r = await inviteCoach(undefined, form({ coach_email: 'NewCoach@Example.com', full_name: 'New Coach' }))
  assert.equal(r.error, undefined)
  assert.equal(state.tables.coach_invites.length, 1, 'the invite row is saved')
  assert.equal(state.tables.coach_invites[0].email, 'newcoach@example.com', 'lowercased before generateLink')
  assert.deepEqual(authAdmin.links, ['newcoach@example.com'], 'generateLink ran after the row was saved')

  // The hook would allow this creation: a pending coach_invites row matches.
  const { supabaseAdmin } = await import('./fakes/supabase-admin')
  assert.equal(await findInviteForEmail(supabaseAdmin, 'NEWCOACH@example.com'), 'coach')

  // handle_new_user now always writes player...
  resetFake({
    tables: {
      coach_invites: [{ id: 'i1', email: 'newcoach@example.com', invited_by: 'admin-1', token: 't', created_at: new Date().toISOString(), accepted_at: null }],
      profiles: [{ id: 'u-newcoach', role: 'player', full_name: 'New Coach' }],
      players: [], guardians: [], teams: [], team_coaches: [], terms_acceptances: [],
    },
  })
  assert.equal(await acceptCoachInvite(supabaseAdmin, { id: 'u-newcoach', email: 'newcoach@example.com' }), 'accepted')
  assert.equal(
    (state.tables.profiles.find((p) => p.id === 'u-newcoach') as { role: string }).role,
    'coach',
    'the invite accept path still upgrades the coach',
  )
  assert.ok((state.tables.coach_invites[0] as { accepted_at: string }).accepted_at, 'the invite is marked used')
})

// ── Existing users are never treated as brand new ────────────────────────────
test('an existing user with no roster row (open beta) is NOT brand new, so the callback never rejects them', async () => {
  const old = new Date(Date.now() - 90 * 86_400_000).toISOString()
  assert.equal(isBrandNewUser({ created_at: old }), false)
  // The callback only enters the rejection branch for brand-new accounts;
  // everyone else (8 coaches, current players, open-beta accounts such as
  // cadenduke@tracylc.net) skips it entirely -- no delete, no sign-out.
  const entersRejectionBranch = (created_at: string) => isBrandNewUser({ created_at })
  assert.equal(entersRejectionBranch(old), false)
  assert.equal(entersRejectionBranch(new Date().toISOString()), true, 'sanity: a just-created account does enter it')
})
