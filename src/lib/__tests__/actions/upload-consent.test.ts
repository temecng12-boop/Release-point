/**
 * Clip uploads and the consent rule (RP-041, migration 023):
 * - getSignedUploadUrl checks consent BEFORE any upload URL is made, so a
 *   blocked upload never stores a file;
 * - createClip removes the already-uploaded file when the clip can't be saved
 *   (consent check, 023's trigger, or any other insert error) and returns an
 *   error, never a success;
 * - the refusal is friendly copy that says what to do, not the raw DB error;
 * - a player without a coach can confirm 18+ themself, once.
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/upload-consent.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake, fail, state } from './fakes/db'
import { getSignedUploadUrl, createClip } from '../../../app/actions/clips'
import { confirmMyAdultStatus } from '../../../app/actions/player'

const P = '11111111-1111-4111-8111-111111111111'
const PLAYER_USER = { id: 'player-user', email: 'p@example.com' }
const COACH = { id: 'coach', email: 'coach@example.com' }
const VIDEO = `${P}/1700000000000.mp4`
const T = '2026-10-01T00:00:00.000Z'

function seed(opts: { coach?: boolean; adult?: boolean; user?: typeof PLAYER_USER } = {}) {
  resetFake({
    user: opts.user ?? PLAYER_USER,
    tables: {
      profiles: [{ id: PLAYER_USER.id, role: 'player' }, { id: COACH.id, role: 'coach' }],
      players: [{ id: P, user_id: PLAYER_USER.id, coach_id: opts.coach ? COACH.id : null, guardian_id: null, team_id: null,
        adult_confirmed_at: opts.adult ? T : null, adult_confirmed_by: null, consent_given_at: null }],
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
  assert.match(String(r.error), /^Guardian consent for your account is still pending, so video can't be added yet\./)
  assert.match(String(r.error), /If you are 18 or older, confirm it on your dashboard\. If you are under 18, a parent or guardian has to give consent first\./)
  assert.deepEqual(state.storageOps, [], 'no signed upload URL, so nothing can be uploaded')
})

test('getSignedUploadUrl: coached player and coach get their own next step', async () => {
  seed({ coach: true })
  assert.match(String((await getSignedUploadUrl(VIDEO) as { error?: string }).error), /ask your coach to mark you as 18\+/)
  seed({ coach: true, user: COACH })
  assert.match(String((await getSignedUploadUrl(VIDEO) as { error?: string }).error), /mark them as 18\+ on their profile or in Edit Player/)
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
  assert.match(String(r.error), /Guardian consent for your account is still pending/)
  assert.equal(state.tables.clips.length, 0)
  assert.deepEqual(state.storage.clips, [])
})

test('createClip: 023 trigger refuses the insert -> friendly message (not the DB text), file removed', async () => {
  seed({ adult: true })
  state.storage.clips.push(VIDEO)
  fail({ table: 'clips', action: 'insert', error: { code: '42501', message: 'guardian consent for this player is still pending' } })
  const r = await quiet(() => createClip(clip())) as { error?: string }
  assert.match(String(r.error), /^Guardian consent for your account is still pending, so video can't be added yet\. If you are 18 or older/)
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

// ── (a) one-time 18+ confirmation by a player without a coach ───────────────
test('confirmMyAdultStatus: player without a coach confirms 18+ once, then can upload', async () => {
  seed()
  assert.deepEqual(await confirmMyAdultStatus(), { success: true })
  const row = state.tables.players[0]
  assert.ok(row.adult_confirmed_at)
  assert.equal(row.adult_confirmed_by, PLAYER_USER.id)
  assert.equal(row.consent_given_at, null, 'no guardian consent is written')
  const r = await getSignedUploadUrl(VIDEO) as { token?: string }
  assert.equal(r.token, 't')
  // Already confirmed: success, nothing changes.
  const at = row.adult_confirmed_at
  assert.deepEqual(await confirmMyAdultStatus(), { success: true })
  assert.equal(state.tables.players[0].adult_confirmed_at, at)
})

test('confirmMyAdultStatus: a player with a coach is refused (the coach records age)', async () => {
  seed({ coach: true })
  const r = await confirmMyAdultStatus() as { error?: string }
  assert.match(String(r.error), /Ask them to mark you as 18\+/)
  assert.equal(state.tables.players[0].adult_confirmed_at, null)
})

test('confirmMyAdultStatus: update fails -> error, not a success', async () => {
  seed()
  fail({ table: 'players', action: 'update', error: { code: '57014', message: 'timeout' } })
  const r = await quiet(() => confirmMyAdultStatus()) as { error?: string }
  assert.match(String(r.error), /couldn't save your confirmation/)
  assert.equal(state.tables.players[0].adult_confirmed_at, null)
})

test('confirmMyAdultStatus: signed out, or no player row -> error', async () => {
  seed()
  state.user = null
  assert.ok('error' in await confirmMyAdultStatus())
  seed({ user: COACH })
  assert.ok('error' in await confirmMyAdultStatus())
  assert.equal(state.tables.players[0].adult_confirmed_at, null)
})
