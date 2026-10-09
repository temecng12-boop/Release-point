/**
 * Cross-tenant access: coach A cannot read or write coach B's player, clip,
 * team, or admin surfaces. Covers the MERGE BLOCKER restore of storage /
 * createClip checks and every new action/route from 6922eee..cd44370.
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/cross-tenant-access.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake, state } from './fakes/db'
import { authAdmin } from './fakes/supabase-admin'
import { emailFake } from './fakes/email'
import { getSignedUploadUrl, getClipsSignedUrl, createClip, setPinnedComparison } from '../../../app/actions/clips'
import { getActivityFeed } from '../../../app/actions/activity'
import { loadActivityClips } from '../../activity-feed'
import { approveWaitlistAsCoach } from '../../../app/actions/admin'
import { loadAdminWaitlistPage } from '../../admin-waitlist'
import { invitePlayer, resendPlayerInvite } from '../../../app/actions/invite'
import { addPitchMetric } from '../../../app/actions/clips'
import { deletePlayer } from '../../../app/actions/player'
import { inviteAssistantCoach } from '../../../app/actions/invite-coach'
import { addCoachToTeam, removeCoachFromTeam } from '../../../app/actions/team-coaches'
import { parseTrackmanPDF } from '../../../app/actions/import-pdf'
import { forbidden } from '../../http-forbidden'

const PA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PA2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab'
const PB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const CB = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const TEAM_A = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const TEAM_B = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const COACH_A = { id: 'coach-a', email: 'a@example.com' }
const COACH_B = { id: 'coach-b', email: 'b@example.com' }
const ASST = { id: 'coach-asst', email: 'asst@example.com' }
const PATH_A = `${PA}/1700000000000.mp4`
const PATH_B = `${PB}/1700000000000.mp4`
const T = '2026-01-01T00:00:00Z'
const TEEN_YEAR = String(new Date().getFullYear() - 15)

function form(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

function seed(user: { id: string; email: string } | null) {
  resetFake({
    user,
    tables: {
      profiles: [
        { id: COACH_A.id, role: 'coach', full_name: 'Coach A', is_platform_admin: false },
        { id: COACH_B.id, role: 'coach', full_name: 'Coach B', is_platform_admin: false },
        { id: ASST.id, role: 'coach', full_name: 'Asst A', is_platform_admin: false },
      ],
      players: [
        {
          id: PA, coach_id: COACH_A.id, user_id: 'player-a', guardian_id: null, team_id: TEAM_A,
          email: 'pa@example.com', full_name: 'Player A', accepted_at: null,
          adult_confirmed_at: T, consent_given_at: null, age_band: '18_plus',
          age_confirmed_at: T, age_screen_at: T,
        },
        {
          id: PA2, coach_id: COACH_A.id, user_id: null, guardian_id: null, team_id: null,
          email: null, full_name: 'Off Team', accepted_at: null,
          adult_confirmed_at: T, consent_given_at: null, age_band: '18_plus', age_band_coach: '18_plus',
          age_confirmed_at: T, age_screen_at: T,
        },
        {
          id: PB, coach_id: COACH_B.id, user_id: 'player-b', guardian_id: null, team_id: TEAM_B,
          email: 'pb@example.com', full_name: 'Player B', accepted_at: null,
          adult_confirmed_at: T, consent_given_at: null, age_band: '18_plus',
          age_confirmed_at: T, age_screen_at: T,
        },
      ],
      clips: [
        { id: CA, player_id: PA, title: 'A bullpen', storage_path: PATH_A, notes: 'a' },
        { id: CB, player_id: PB, title: 'B bullpen', storage_path: PATH_B, notes: 'b' },
      ],
      teams: [
        { id: TEAM_A, coach_id: COACH_A.id, name: 'Team A', age_group: 'High School' },
        { id: TEAM_B, coach_id: COACH_B.id, name: 'Team B', age_group: 'High School' },
      ],
      team_coaches: [
        { team_id: TEAM_A, coach_id: COACH_A.id, role: 'organizer' },
        { team_id: TEAM_A, coach_id: ASST.id, role: 'assistant' },
        { team_id: TEAM_B, coach_id: COACH_B.id, role: 'organizer' },
      ],
      player_teams: [
        { player_id: PA, team_id: TEAM_A },
        { player_id: PB, team_id: TEAM_B },
      ],
      waitlist: [{ id: 'w1', email: 'wait@example.com', name: 'Wait', approved_at: null }],
      coach_invites: [],
      rate_limit_log: [],
    },
    storage: { clips: [PATH_A, PATH_B] },
  })
  authAdmin.reset()
  emailFake.reset()
}

const quiet = async <T>(fn: () => Promise<T>) => {
  const e = console.error, w = console.warn
  console.error = () => {}; console.warn = () => {}
  try { return await fn() } finally { console.error = e; console.warn = w }
}

const signedOps = () => state.storageOps.filter((o) => o.paths.some((p) => p.startsWith('sign:')))
const waitlistWrites = () => state.ops.filter((o) => o.table === 'waitlist' && o.action !== 'select')

test('coach A cannot sign coach B\'s player path for write', async () => {
  seed(COACH_A)
  const r = await quiet(() => getSignedUploadUrl(PATH_B))
  assert.match(String((r as { error?: string }).error), /don.t have access to this file/)
  assert.deepEqual(signedOps(), [])
  assert.equal(state.signed.length, 0)
})

test('coach A cannot sign coach B\'s player path for read', async () => {
  seed(COACH_A)
  const r = await quiet(() => getClipsSignedUrl(PATH_B))
  assert.match(String((r as { error?: string }).error), /don.t have access to this file/)
  assert.equal(state.signed.length, 0)
})

test('coach A cannot createClip for coach B\'s player', async () => {
  seed(COACH_A)
  const r = await createClip({ player_id: PB, storage_path: PATH_B, title: 'Stolen', session_date: null })
  assert.equal((r as { error?: string }).error, 'Not authorized')
  assert.equal(state.tables.clips.length, 2)
  assert.ok(!state.ops.some((o) => o.table === 'clips' && o.action === 'insert'))
})

test('activity feed: coach A gets an empty list for coach B\'s player (filter and unfiltered stay on-roster)', async () => {
  seed(COACH_A)
  const filtered = await getActivityFeed(PB)
  assert.deepEqual(filtered.clips, [])
  assert.equal(filtered.error, undefined)
  assert.deepEqual(await loadActivityClips(COACH_A.id, PB), [])

  const own = await getActivityFeed()
  assert.equal(own.clips.length, 1)
  assert.equal(own.clips[0].id, CA)
  assert.ok(own.clips.every((c) => c.player_id === PA))
})

test('non-admin gets 403 from /admin/waitlist loader and cannot approve', async () => {
  seed(COACH_A)
  delete process.env.PLATFORM_ADMIN_EMAILS
  const page = await loadAdminWaitlistPage()
  assert.equal(page.ok, false)
  if (!page.ok) {
    assert.equal(page.status, 403)
    assert.equal(page.error, 'Forbidden')
  }
  assert.ok(!state.ops.some((o) => o.table === 'waitlist' && o.action === 'select'), 'waitlist is never read')

  const approve = await approveWaitlistAsCoach('w1', 'new@example.com', 'New')
  assert.equal(approve.error, 'Forbidden')
  assert.equal(state.tables.coach_invites.length, 0)
  assert.deepEqual(waitlistWrites(), [])
  assert.equal(emailFake.coachInvites.length, 0)

  try {
    forbidden()
    assert.fail('forbidden() must throw')
  } catch (err) {
    assert.equal((err as { digest?: string }).digest, 'NEXT_HTTP_ERROR_FALLBACK;403')
  }
})

test('add-player: coach A cannot attach a player to coach B\'s team_id', async () => {
  seed(COACH_A)
  const r = await invitePlayer(undefined, form({
    full_name: 'Kid',
    player_email: 'kid@example.com',
    team_id: TEAM_B,
    birth_month: '6',
    birth_year: TEEN_YEAR,
  }))
  assert.equal(r.error, 'Invalid team')
  assert.equal(state.tables.players.length, 2)
  assert.equal(state.tables.player_teams.length, 2)
})

test('assistant-coach invite: coach A cannot invite onto coach B\'s team', async () => {
  seed(COACH_A)
  const r = await inviteAssistantCoach(undefined, form({
    team_id: TEAM_B,
    coach_email: 'asst@example.com',
    coach_name: 'Asst',
  }))
  assert.equal(r.error, 'Only the team organizer can invite coaches')
  assert.equal(state.tables.coach_invites.length, 0)
  assert.equal(authAdmin.links.length, 0)
})

test('assistant-coach add/revoke: coach A cannot change staff on coach B\'s team', async () => {
  seed(COACH_A)
  authAdmin.users.push({ id: 'coach-x', email: 'x@example.com' })
  state.tables.profiles.push({ id: 'coach-x', role: 'coach', full_name: 'X' })
  const added = await addCoachToTeam(undefined, form({ team_id: TEAM_B, coach_email: 'x@example.com' }))
  assert.equal(added.error, 'Only the team organizer can add coaches')
  assert.equal(state.tables.team_coaches.length, 2)

  const removed = await removeCoachFromTeam(TEAM_B, COACH_B.id)
  assert.equal(removed.error, 'Only the team organizer can remove coaches')
  assert.equal(state.tables.team_coaches.length, 2)
})

test('TrackMan import: coach A is refused for coach B\'s clip', async () => {
  seed(COACH_A)
  const fd = new FormData()
  fd.set('clipId', CB)
  fd.set('file', new File([Buffer.from('%PDF-1.4 test')], 'report.pdf', { type: 'application/pdf' }))
  const r = await parseTrackmanPDF(fd)
  assert.match(String(r.error), /Only the player's coach or the player/)
  assert.deepEqual(r.pitches, [])
})

test('resendPlayerInvite: coach A cannot resend for coach B\'s player', async () => {
  seed(COACH_A)
  const r = await resendPlayerInvite(PB)
  assert.equal(r.error, 'Not authorized')
  assert.equal(authAdmin.links.length, 0)
  assert.equal(emailFake.invites.length, 0)
})

test('setPinnedComparison: coach A cannot pin on coach B\'s clip', async () => {
  seed(COACH_A)
  const r = await setPinnedComparison(CB, 'abc123', 'note')
  assert.equal((r as { error?: string }).error, 'Not authorized')
  assert.equal(state.tables.clips.find((c) => c.id === CB)?.featured_youtube_id, undefined)
})

const pitch = {
  pitch_type: 'Fastball',
  velocity: 90,
  spin_rate: 2200,
  spin_axis: 180,
  horizontal_break: 10,
  vertical_break: 15,
  extension: 6,
  vaa: -5,
}

test('assistant on team A can upload, createClip, pin, and add metrics for a team player', async () => {
  seed(ASST)
  const signed = await getSignedUploadUrl(PATH_A)
  assert.equal((signed as { error?: string }).error, undefined)
  assert.ok((signed as { signedUrl?: string }).signedUrl)

  const created = await createClip({ player_id: PA, storage_path: `${PA}/asst.mp4`, title: 'Asst clip', session_date: null })
  assert.equal((created as { error?: string }).error, undefined)
  assert.ok(state.tables.clips.some((c) => c.title === 'Asst clip' && c.player_id === PA))

  const pin = await setPinnedComparison(CA, 'abc123', 'side by side')
  assert.equal((pin as { error?: string }).error, undefined)
  assert.equal(state.tables.clips.find((c) => c.id === CA)?.featured_youtube_id, 'abc123')

  const metric = await addPitchMetric(CA, pitch)
  assert.equal((metric as { error?: string }).error, undefined)
  assert.equal(state.tables.pitch_metrics?.length, 1)
})

test('assistant on team A cannot write for another team\'s player', async () => {
  seed(ASST)
  const signed = await quiet(() => getSignedUploadUrl(PATH_B))
  assert.match(String((signed as { error?: string }).error), /don.t have access to this file/)
  const created = await createClip({ player_id: PB, storage_path: PATH_B, title: 'Stolen', session_date: null })
  assert.equal((created as { error?: string }).error, 'Not authorized')
  const pin = await setPinnedComparison(CB, 'abc123', 'note')
  assert.equal((pin as { error?: string }).error, 'Not authorized')
  const metric = await addPitchMetric(CB, pitch)
  assert.equal((metric as { error?: string }).error, 'Not authorized')
})

test('assistant cannot write for the head coach\'s off-team roster player', async () => {
  seed(ASST)
  const created = await createClip({ player_id: PA2, storage_path: `${PA2}/1.mp4`, title: 'Off team', session_date: null })
  assert.equal((created as { error?: string }).error, 'Not authorized')
  assert.ok(!state.ops.some((o) => o.table === 'clips' && o.action === 'insert'))
})

test('assistant cannot delete a team player (head-coach-only)', async () => {
  seed(ASST)
  const r = await deletePlayer(PA)
  assert.equal((r as { error?: string }).error, 'Player not found')
  assert.ok(state.tables.players.some((p) => p.id === PA))
})
