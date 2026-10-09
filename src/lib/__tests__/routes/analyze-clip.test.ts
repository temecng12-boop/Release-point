/**
 * /api/analyze-clip: signed-in caller + can-view this clip (not just logged
 * in). Coach A gets 403 for coach B's clip; unsigned-in gets 401.
 * Run with: npx tsx --tsconfig src/lib/__tests__/routes/tsconfig.json --test src/lib/__tests__/routes/analyze-clip.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake } from '../actions/fakes/db'
import { POST } from '../../../app/api/analyze-clip/route'

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key'

const PA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const CB = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const TEAM_A = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const TEAM_B = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const COACH_A = { id: 'coach-a', email: 'a@example.com' }
const T = '2026-01-01T00:00:00Z'
const FRAME = 'a'.repeat(32)

function seed(user: { id: string; email: string } | null) {
  resetFake({
    user,
    tables: {
      profiles: [
        { id: 'coach-a', role: 'coach', is_platform_admin: false },
        { id: 'coach-b', role: 'coach', is_platform_admin: false },
      ],
      players: [
        {
          id: PA, coach_id: 'coach-a', user_id: 'player-a', guardian_id: null, team_id: TEAM_A,
          adult_confirmed_at: T, consent_given_at: null, age_band: '18_plus',
          age_confirmed_at: T, age_screen_at: T,
        },
        {
          id: PB, coach_id: 'coach-b', user_id: 'player-b', guardian_id: null, team_id: TEAM_B,
          adult_confirmed_at: T, consent_given_at: null, age_band: '18_plus',
          age_confirmed_at: T, age_screen_at: T,
        },
      ],
      clips: [
        { id: CA, player_id: PA, title: 'A', storage_path: `${PA}/a.mp4` },
        { id: CB, player_id: PB, title: 'B', storage_path: `${PB}/b.mp4` },
      ],
      teams: [
        { id: TEAM_A, coach_id: 'coach-a' },
        { id: TEAM_B, coach_id: 'coach-b' },
      ],
      team_coaches: [
        { team_id: TEAM_A, coach_id: 'coach-a', role: 'organizer' },
        { team_id: TEAM_B, coach_id: 'coach-b', role: 'organizer' },
      ],
      player_teams: [
        { player_id: PA, team_id: TEAM_A },
        { player_id: PB, team_id: TEAM_B },
      ],
      rate_limit_log: [],
    },
  })
}

const req = (body: unknown) => ({ json: async () => body }) as never

test('unsigned-in caller gets 401', async () => {
  seed(null)
  const r = await POST(req({ clipId: CA, frames: [FRAME] }))
  assert.equal(r.status, 401)
})

test('coach A gets 403 for coach B\'s clip (no frames sent to the model)', async () => {
  seed(COACH_A)
  const r = await POST(req({ clipId: CB, frames: [FRAME] }))
  assert.equal(r.status, 403)
  const body = typeof (r as Response).json === 'function'
    ? await (r as Response).json()
    : (r as { body?: { error?: string } }).body
  assert.match(String((body as { error?: string })?.error ?? body), /don.t have access to this clip/)
})

test('coach A is not refused for their own player\'s clip at the access gate', async () => {
  seed(COACH_A)
  const r = await POST(req({ clipId: CA, frames: [FRAME] }))
  // Access passed (403 would mean the tenant check fired on the caller's own clip).
  assert.notEqual(r.status, 403)
  assert.notEqual(r.status, 401)
})
