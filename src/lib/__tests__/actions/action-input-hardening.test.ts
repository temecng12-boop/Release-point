/**
 * Service-role actions keep only the fields they allow and set ids/ownership
 * themselves (client data can't forge clip_id, created_by, role, coach_id or
 * consent columns); parseTrackmanPDF and uploadAvatar check sign-in, role,
 * type and size on the server with friendly errors.
 * Run with: npx tsx --tsconfig src/lib/__tests__/actions/tsconfig.json --test src/lib/__tests__/actions/action-input-hardening.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake, fail, state, type Row } from './fakes/db'
import { supabaseAdmin } from './fakes/supabase-admin'
import { addPitchMetric } from '../../../app/actions/clips'
import { updateProfile, updatePlayerSelfProfile, updatePlayerAthleteProfile, uploadAvatar } from '../../../app/actions/player'
import { parseTrackmanPDF } from '../../../app/actions/import-pdf'
import { PDF_MAX_BYTES } from '../../pitch-import'
import { MAX_AVATAR_BYTES } from '../../avatar-rules'

const P = 'player-1', C = 'clip-1'
const COACH = { id: 'coach', email: 'c@example.com' }
const PLAYER = { id: 'player-user', email: 'p@example.com' }
const TEAM_COACH = { id: 'team-coach', email: 't@example.com' }
const GUARDIAN = { id: 'guardian-user', email: 'g@example.com' }
const OTHER_CLIP = 'clip-other'

function seed(user: { id: string; email: string } | null, extra: Record<string, Row[]> = {}) {
  resetFake({
    user,
    tables: {
      clips: [{ id: C, player_id: P }, { id: OTHER_CLIP, player_id: 'player-2' }],
      players: [
        { id: P, coach_id: COACH.id, user_id: PLAYER.id, guardian_id: null, consent_given_at: null, adult_confirmed_at: null, college_offers: [] },
        { id: 'player-2', coach_id: 'other-coach', user_id: 'other-player' },
      ],
      profiles: [
        { id: COACH.id, role: 'coach', full_name: 'C', avatar_url: null },
        { id: PLAYER.id, role: 'player', full_name: 'P', avatar_url: null },
        { id: TEAM_COACH.id, role: 'coach' },
        { id: GUARDIAN.id, role: 'guardian' },
      ],
      pitch_metrics: [],
      ...extra,
    },
  })
}
const writes = () => state.ops.filter(o => o.action !== 'select')
const quiet = async <T>(f: () => Promise<T>) => { const e = console.error; console.error = () => {}; try { return await f() } finally { console.error = e } }
const PITCH = { pitch_type: 'Fastball', velocity: 90, spin_rate: 2250, spin_axis: 37.5, horizontal_break: 8, vertical_break: 18, extension: 6.4, vaa: -5 }

// ── 1. Spread client data ───────────────────────────────────────────────────
test('addPitchMetric: forged clip_id / created_by / id are ignored; unknown fields dropped', async () => {
  for (const user of [PLAYER, COACH]) {
    seed(user)
    const forged = { ...PITCH, clip_id: OTHER_CLIP, created_by: 'someone-else', id: 'chosen-id', raw_data: { x: 1 }, is_admin: true }
    const r = await addPitchMetric(C, forged as typeof PITCH) as { metric?: Row; error?: string }
    assert.ok(r.metric, JSON.stringify(r))
    const row = state.tables.pitch_metrics[0]
    assert.equal(row.clip_id, C); assert.equal(row.created_by, user.id); assert.notEqual(row.id, 'chosen-id')
    assert.deepEqual(Object.keys(row).sort(), ['clip_id', 'created_by', 'extension', 'horizontal_break', 'id', 'pitch_type', 'spin_axis', 'spin_rate', 'vaa', 'velocity', 'vertical_break'])
  }
})

test('addPitchMetric: same validation as imports (types, axis); nothing written', async () => {
  for (const [bad, re] of [[{ velocity: '90' }, /velocity isn't a number/i], [{ spin_axis: 400 }, /Axis must be a clock time/], [{ pitch_type: 5 }, /pitch type isn't valid/i]] as const) {
    seed(COACH)
    const r = await addPitchMetric(C, { ...PITCH, ...bad } as unknown as typeof PITCH) as { error?: string }
    assert.match(String(r.error), re)
    assert.deepEqual(writes(), [])
  }
})

test('updateProfile: role, avatar_url and id from the client are dropped; wrong types refused', async () => {
  seed(PLAYER)
  const r = await updateProfile({ full_name: 'New', role: 'coach', avatar_url: 'https://evil', id: COACH.id, bio: 'b', schools: ['A'] } as never)
  assert.deepEqual(r, { success: true })
  const me = state.tables.profiles.find(p => p.id === PLAYER.id)!
  assert.equal(me.role, 'player'); assert.equal(me.avatar_url, null); assert.equal(me.full_name, 'New'); assert.equal(me.college, '["A"]')
  assert.equal(state.tables.profiles.find(p => p.id === COACH.id)!.full_name, 'C')
  const upd = writes()[0].values as Row
  assert.deepEqual(Object.keys(upd).sort(), ['bio', 'college', 'full_name'])
  seed(PLAYER)
  assert.match(String((await updateProfile({ coaching_since: 'x' } as never) as { error?: string }).error), /couldn't be saved/)
  assert.deepEqual(writes(), [])
})

test('updateProfile: a DB error is friendly in production (no raw text)', async () => {
  seed(COACH)
  fail({ table: 'profiles', action: 'update', error: { code: '23514', message: 'violates check constraint "profiles_bio_len"' } })
  const env = process.env.NODE_ENV; (process.env as Record<string, string>).NODE_ENV = 'production'
  let r
  try { r = await quiet(() => updateProfile({ bio: 'b' })) } finally { (process.env as Record<string, string | undefined>).NODE_ENV = env }
  assert.match(String((r as { error?: string }).error), /^Couldn't save your profile\./)
  assert.doesNotMatch(String((r as { error?: string }).error), /profiles_bio_len|violates/)
})

test('updatePlayerSelfProfile: coach_id, user_id, guardian_id and consent/18+ columns are dropped', async () => {
  seed(PLAYER)
  const r = await updatePlayerSelfProfile({ height: '6-1', coach_id: PLAYER.id, user_id: 'x', guardian_id: 'g', consent_given_at: '2026-01-01', adult_confirmed_at: '2026-01-01', team_id: 't' } as never)
  assert.deepEqual(r, { success: true })
  const row = state.tables.players[0]
  assert.equal(row.height, '6-1'); assert.equal(row.coach_id, COACH.id); assert.equal(row.user_id, PLAYER.id)
  assert.equal(row.guardian_id, null); assert.equal(row.consent_given_at, null); assert.equal(row.adult_confirmed_at, null)
  assert.deepEqual(Object.keys(writes()[0].values as Row), ['height'])
})

test('updatePlayerSelfProfile: no player row -> an error, not a silent success', async () => {
  seed(COACH)
  assert.match(String((await updatePlayerSelfProfile({ height: '6-1' }) as { error?: string }).error), /Couldn't find your player profile/)
})

test('updatePlayerAthleteProfile: only the athlete columns are written (no coach_id / consent)', async () => {
  seed(COACH)
  const r = await updatePlayerAthleteProfile(P, { college_offers: ['State'], coach_id: 'other', consent_given_at: 'now' } as never)
  assert.deepEqual(r, { success: true })
  assert.deepEqual(Object.keys(writes()[0].values as Row), ['college_offers'])
  assert.equal(state.tables.players[0].coach_id, COACH.id); assert.equal(state.tables.players[0].consent_given_at, null)
  seed(COACH)
  assert.match(String((await updatePlayerAthleteProfile(P, { showcases: 'x' } as never) as { error?: string }).error), /couldn't be saved/)
})

// ── 2. parseTrackmanPDF ─────────────────────────────────────────────────────
const pdfForm = (opts: { clipId?: string; bytes?: Uint8Array<ArrayBuffer>; type?: string; name?: string; size?: number } = {}) => {
  const fd = new FormData()
  const bytes = opts.bytes ?? (new TextEncoder().encode('%PDF-1.4 not really a pdf') as Uint8Array<ArrayBuffer>)
  const file = opts.size ? new File([new Uint8Array(opts.size)], opts.name ?? 'r.pdf', { type: opts.type ?? 'application/pdf' }) : new File([bytes], opts.name ?? 'r.pdf', { type: opts.type ?? 'application/pdf' })
  fd.set('file', file)
  if (opts.clipId) fd.set('clipId', opts.clipId)
  return fd
}

test('parseTrackmanPDF: signed-out, team coach, stranger and guardian are refused', async () => {
  seed(null)
  assert.match(String((await parseTrackmanPDF(pdfForm({ clipId: C }))).error), /sign in/)
  for (const user of [TEAM_COACH, { id: 'stranger', email: 's@x' }]) {
    seed(user)
    assert.match(String((await parseTrackmanPDF(pdfForm({ clipId: C }))).error), /Only the player's coach or the player/, user.id)
  }
  seed(GUARDIAN)
  assert.match(String((await parseTrackmanPDF(pdfForm())).error), /Only coaches and players/)
  seed({ id: 'no-profile', email: 'n@x' })
  assert.match(String((await parseTrackmanPDF(pdfForm())).error), /Only coaches and players/)
})

test('parseTrackmanPDF: direct coach / player pass the check; type, header and size are checked', async () => {
  for (const user of [COACH, PLAYER]) {
    seed(user)
    // Passes access and the PDF checks, then fails to parse the fake PDF (friendly message).
    assert.match(String((await quiet(() => parseTrackmanPDF(pdfForm({ clipId: C })))).error), /Could not read the PDF/)
  }
  seed(COACH)
  assert.match(String((await quiet(() => parseTrackmanPDF(pdfForm()))).error), /Could not read the PDF/, 'no clipId: coach profile is enough')
  assert.match(String((await parseTrackmanPDF(pdfForm({ clipId: C, type: 'text/html', name: 'r.html' }))).error), /Please upload a PDF file/)
  assert.match(String((await parseTrackmanPDF(pdfForm({ clipId: C, bytes: new TextEncoder().encode('<html>') as Uint8Array<ArrayBuffer> }))).error), /Please upload a PDF file/)
  assert.match(String((await parseTrackmanPDF(pdfForm({ clipId: C, size: PDF_MAX_BYTES + 1 }))).error), /too big to import\. Pick one under 3\.75 MB/)
})

// ── 3. uploadAvatar ─────────────────────────────────────────────────────────
const JPEG = [0xff, 0xd8, 0xff, 0xe0]
const avatar = (bytes: number[] | Uint8Array, type = 'image/jpeg', name = 'avatar.jpg') => { const fd = new FormData(); fd.append('file', new File([new Uint8Array(bytes)], name, { type })); return fd }
const uploads = () => state.storage.clips ?? []

test('uploadAvatar: over 2 MB is refused with the friendly message; nothing uploaded', async () => {
  seed(PLAYER)
  const big = new Uint8Array(MAX_AVATAR_BYTES + 1); big.set(JPEG)
  assert.deepEqual(await uploadAvatar(avatar(big)), { error: 'That photo is too big. Pick one under 2 MB.' })
  assert.deepEqual(uploads(), [])
  const exact = new Uint8Array(MAX_AVATAR_BYTES); exact.set(JPEG)
  assert.equal((await uploadAvatar(avatar(exact)) as { success?: boolean }).success, true)
})

test('uploadAvatar: non-images and mismatched bytes are refused; the path uses the type, not the file name', async () => {
  seed(PLAYER)
  for (const fd of [avatar(JPEG, 'image/gif', 'a.gif'), avatar(JPEG, 'text/html', 'a.html'), avatar([0x3c, 0x68, 0x74, 0x6d], 'image/jpeg')]) {
    assert.match(String((await uploadAvatar(fd) as { error?: string }).error), /isn't a photo/)
  }
  assert.deepEqual(uploads(), [])
  const r = await uploadAvatar(avatar([...JPEG, 1, 2], 'image/jpeg', 'evil.html')) as { success?: boolean }
  assert.equal(r.success, true)
  assert.deepEqual(uploads(), [`avatars/${PLAYER.id}.jpg`])
})

test('uploadAvatar: a storage error is friendly (raw text only logged)', async () => {
  seed(PLAYER)
  const from = supabaseAdmin.storage.from
  supabaseAdmin.storage.from = (b: string) => ({ ...from(b), upload: async () => ({ data: null, error: { message: 'Payload too large: bucket quota' } }) })
  try {
    const r = await quiet(() => uploadAvatar(avatar(JPEG))) as { error?: string }
    assert.equal(r.error, 'Couldn\'t upload your photo. Please try again.')
  } finally { supabaseAdmin.storage.from = from }
  assert.equal(state.tables.profiles.find(p => p.id === PLAYER.id)!.avatar_url, null)
})
