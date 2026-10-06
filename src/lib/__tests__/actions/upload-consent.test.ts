/**
 * Clip uploads and the consent rule (RP-041, migrations 023 and 037):
 * video is allowed only when the age band is 13 to 17 or 18+ and confirmed;
 * - getSignedUploadUrl checks consent BEFORE any upload URL is made, so a
 *   blocked upload never stores a file;
 * - createClip removes the already-uploaded file when the clip can't be saved
 *   (consent check, 023's trigger, or any other insert error) and returns an
 *   error, never a success;
 * - the refusal is friendly copy that says what to do, not the raw DB error;
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/upload-consent.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake, fail, state } from './fakes/db'
import { getSignedUploadUrl, createClip } from '../../../app/actions/clips'

const P = '11111111-1111-4111-8111-111111111111'
const PLAYER_USER = { id: 'player-user', email: 'p@example.com' }
const COACH = { id: 'coach', email: 'coach@example.com' }
const VIDEO = `${P}/1700000000000.mp4`
const T = '2026-10-01T00:00:00.000Z'

type Band = null | 'under_13' | '13_17' | '18_plus'
function seed(opts: { coach?: boolean; adult?: boolean; band?: Band; guardian?: boolean; consent?: boolean; user?: typeof PLAYER_USER } = {}) {
  const band: Band = opts.band !== undefined ? opts.band : opts.adult ? '18_plus' : null
  resetFake({
    user: opts.user ?? PLAYER_USER,
    tables: {
      profiles: [{ id: PLAYER_USER.id, role: 'player' }, { id: COACH.id, role: 'coach' }],
      players: [{ id: P, user_id: PLAYER_USER.id, coach_id: opts.coach ? COACH.id : null, guardian_id: opts.guardian ? 'g1' : null, team_id: null,
        adult_confirmed_at: band === '18_plus' ? T : null, adult_confirmed_by: null, consent_given_at: opts.consent ? T : null,
        age_band: band, age_band_coach: opts.coach ? band : null, age_band_self: opts.coach ? null : band, age_confirmed_at: band ? T : null,
        age_screen_at: opts.coach ? null : band ? T : null }],
      clips: [],
    },
    storage: { clips: [] },
  })
}

const quiet = async <R>(fn: () => Promise<R>) => {
  const e = console.error, w = console.warn
  console.error = () => {}; console.warn = () => {}
  try { return await fn() } finally { console.error = e; console.warn = w }
}

// ── pre-check: nothing stored for a blocked upload ──────────────────────────
test('getSignedUploadUrl: player without consent -> friendly error, no upload URL made', async () => {
  seed()
  const r = await getSignedUploadUrl(VIDEO) as { error?: string }
  assert.equal(String(r.error), "Your age isn't confirmed yet, so video can't be added yet. Ask your coach.")
  assert.deepEqual(state.storageOps, [], 'no signed upload URL, so nothing can be uploaded')
})

test('getSignedUploadUrl: coached player and coach get their own next step', async () => {
  seed({ coach: true })
  assert.match(String((await getSignedUploadUrl(VIDEO) as { error?: string }).error), /Ask your coach\./)
  seed({ coach: true, user: COACH })
  assert.match(String((await getSignedUploadUrl(VIDEO) as { error?: string }).error), /confirms their age when they join\. You can also set their age in Edit Player\./)
  assert.deepEqual(state.storageOps, [])
})

test('getSignedUploadUrl: confirmed adult -> upload URL', async () => {
  seed({ adult: true })
  const r = await getSignedUploadUrl(VIDEO) as { token?: string; error?: string }
  assert.equal(r.error, undefined)
  assert.equal(r.token, 't')
})

// ── cleanup: an uploaded file never outlives a failed createClip ────────────
const clip = () => ({ player_id: P, storage_path: VIDEO, title: 'Bullpen', session_date: null })

test('createClip: consent missing at save time -> error, uploaded file removed, no clip', async () => {
  seed()
  state.storage.clips.push(VIDEO)
  const r = await createClip(clip()) as { error?: string; success?: boolean }
  assert.match(String(r.error), /Your age isn't confirmed yet/)
  assert.equal(state.tables.clips.length, 0)
  assert.deepEqual(state.storage.clips, [])
})

test('createClip: 023 trigger refuses the insert -> friendly message (not the DB text), file removed', async () => {
  seed({ adult: true })
  state.storage.clips.push(VIDEO)
  fail({ table: 'clips', action: 'insert', error: { code: '42501', message: 'guardian consent for this player is still pending' } })
  const r = await quiet(() => createClip(clip())) as { error?: string }
  assert.match(String(r.error), /^Your age isn't confirmed yet, so video can't be added yet\./)
  assert.doesNotMatch(String(r.error), /42501|still pending'?$/)
  assert.equal(state.tables.clips.length, 0)
  assert.deepEqual(state.storage.clips, [])
})

test('createClip: any other insert error -> error, file removed', async () => {
  seed({ adult: true })
  state.storage.clips.push(VIDEO)
  fail({ table: 'clips', action: 'insert', error: { code: '23503', message: 'insert or update on table "clips" violates foreign key constraint' } })
  const r = await quiet(() => createClip(clip())) as { error?: string }
  assert.match(String(r.error), /^Could not save this clip\./)
  assert.deepEqual(state.storage.clips, [])
})

test('createClip: a file another clip already uses is never removed', async () => {
  seed({ adult: true })
  state.storage.clips.push(VIDEO)
  state.tables.clips.push({ id: 'c-existing', player_id: P, storage_path: VIDEO })
  fail({ table: 'clips', action: 'insert', error: { code: '23505', message: 'duplicate key' } })
  const r = await quiet(() => createClip(clip())) as { error?: string }
  assert.ok(r.error)
  assert.deepEqual(state.storage.clips, [VIDEO])
  assert.deepEqual(state.storageOps, [])
})

test('createClip: success keeps the file and saves the clip', async () => {
  seed({ adult: true })
  state.storage.clips.push(VIDEO)
  const r = await createClip(clip()) as { error?: string }
  assert.equal(r.error, undefined)
  assert.equal(state.tables.clips.length, 1)
  assert.deepEqual(state.storage.clips, [VIDEO])
})

// ── 037's rule: band x confirmation ─────────────────────────────────────────
test('getSignedUploadUrl: 13 to 17 and 18+ (confirmed) get an upload URL; no band and under 13 do not', async () => {
  for (const [band, ok] of [['13_17', true], ['18_plus', true], [null, false], ['under_13', false]] as const) {
    for (const coach of [false, true]) {
      seed({ band, coach })
      const r = await getSignedUploadUrl(VIDEO) as { token?: string; error?: string }
      assert.equal(!!r.token, ok, `band ${band}, coach ${coach}: ${JSON.stringify(r)}`)
      if (!ok) assert.deepEqual(state.storageOps, [])
    }
  }
})

test('getSignedUploadUrl: under 13 -> the stop message for the player, the under-13 note for the coach', async () => {
  seed({ band: 'under_13', coach: true })
  assert.match(String((await getSignedUploadUrl(VIDEO) as { error?: string }).error), /We need a parent's permission first\. Ask your coach\./)
  seed({ band: 'under_13', coach: true, user: COACH })
  assert.match(String((await getSignedUploadUrl(VIDEO) as { error?: string }).error), /This player is under 13, so video can't be added\./)
})

test('guardian consent alone (consent_given_at, no band) no longer allows video', async () => {
  seed({ band: null, consent: true, coach: true })
  const r = await getSignedUploadUrl(VIDEO) as { token?: string; error?: string }
  assert.equal(r.token, undefined)
  assert.ok(r.error)
})

test('a band without age_confirmed_at is not enough', async () => {
  seed({ band: '18_plus' })
  state.tables.players[0].age_confirmed_at = null
  const r = await getSignedUploadUrl(VIDEO) as { token?: string }
  assert.equal(r.token, undefined)
})

test('createClip: under 13 at save time -> error, uploaded file removed, no clip', async () => {
  seed({ band: 'under_13', coach: true })
  state.storage.clips.push(VIDEO)
  const r = await createClip(clip()) as { error?: string }
  assert.ok(r.error)
  assert.equal(state.tables.clips.length, 0)
  assert.deepEqual(state.storage.clips, [])
})

test('createClip: 037 trigger text ("video consent ... pending") -> friendly message, file removed', async () => {
  seed({ adult: true })
  state.storage.clips.push(VIDEO)
  fail({ table: 'clips', action: 'insert', error: { code: '42501', message: 'video consent for this player is still pending' } })
  const r = await quiet(() => createClip(clip())) as { error?: string }
  assert.match(String(r.error), /^Your age isn't confirmed yet/)
  assert.doesNotMatch(String(r.error), /video consent for this player/)
  assert.deepEqual(state.storage.clips, [])
})
