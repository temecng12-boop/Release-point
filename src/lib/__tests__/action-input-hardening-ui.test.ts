/**
 * Shared rules for action inputs (field allowlists, PDF and avatar files) and
 * the browser checks that run before anything is sent.
 * Run with: npx tsx --test src/lib/__tests__/action-input-hardening-ui.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pickFields, OWN_PROFILE_FIELDS, PLAYER_SELF_FIELDS, ATHLETE_PROFILE_FIELDS } from '../action-fields'
import { pdfFileProblem, PDF_MAX_BYTES, IMPORT_BODY_LIMIT_BYTES, validateManualPitch } from '../pitch-import'
import { avatarFileProblem, avatarBytesMatchType, MAX_AVATAR_BYTES, AVATAR_TOO_BIG } from '../avatar-rules'

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const between = (src: string, a: string, b: string) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)))

test('allowlists never include ids, ownership, role, avatar or consent columns', () => {
  const banned = ['id', 'role', 'avatar_url', 'user_id', 'coach_id', 'guardian_id', 'team_id', 'consent_given_at', 'adult_confirmed_at', 'adult_confirmed_by', 'email', 'accepted_at']
  for (const spec of [OWN_PROFILE_FIELDS, PLAYER_SELF_FIELDS, ATHLETE_PROFILE_FIELDS]) for (const b of banned) assert.ok(!(b in spec), b)
  const r = pickFields({ bio: 'x', role: 'coach', coaching_since: 3, extra: 1, location: undefined }, OWN_PROFILE_FIELDS)
  assert.deepEqual(r, { ok: true, fields: { bio: 'x', coaching_since: 3 } })
  assert.equal(pickFields({ coaching_since: 1.5 }, OWN_PROFILE_FIELDS).ok, false)
  assert.equal(pickFields({ certifications: [1] }, OWN_PROFILE_FIELDS).ok, false)
  assert.equal(pickFields(null, OWN_PROFILE_FIELDS).ok, false)
})

test('validateManualPitch keeps only pitch columns', () => {
  const r = validateManualPitch({ pitch_type: ' Slider ', velocity: 80, spin_rate: 2400.7, spin_axis: 270, horizontal_break: null, vertical_break: 1, extension: null, vaa: null, clip_id: 'x', created_by: 'y' })
  assert.ok(r.ok)
  assert.deepEqual(r.row, { pitch_type: 'Slider', velocity: 80, spin_rate: 2400, spin_axis: 270, horizontal_break: null, vertical_break: 1, extension: null, vaa: null })
})

test('pdfFileProblem: PDF only, up to the same 3.75 MB the import budget allows', () => {
  assert.equal(PDF_MAX_BYTES, IMPORT_BODY_LIMIT_BYTES)
  assert.equal(pdfFileProblem({ name: 'r.pdf', type: 'application/pdf', size: PDF_MAX_BYTES }), null)
  assert.match(pdfFileProblem({ name: 'r.pdf', type: 'application/pdf', size: PDF_MAX_BYTES + 1 }) ?? '', /too big/)
  assert.equal(pdfFileProblem({ name: 'R.PDF', type: '', size: 10 }), null)
  assert.match(pdfFileProblem({ name: 'r.png', type: 'image/png', size: 10 }) ?? '', /PDF file/)
  assert.match(pdfFileProblem({ name: 'r.pdf', type: 'text/html', size: 10 }) ?? '', /PDF file/)
})

test('avatar rules: 2 MB, JPEG/PNG/WebP, bytes must match', () => {
  assert.equal(avatarFileProblem({ type: 'image/jpeg', size: MAX_AVATAR_BYTES }), null)
  assert.equal(avatarFileProblem({ type: 'image/jpeg', size: MAX_AVATAR_BYTES + 1 }), AVATAR_TOO_BIG)
  assert.equal(AVATAR_TOO_BIG, 'That photo is too big. Pick one under 2 MB.')
  assert.match(avatarFileProblem({ type: 'image/svg+xml', size: 10 }) ?? '', /isn't a photo/)
  assert.ok(avatarBytesMatchType(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'image/png'))
  assert.ok(avatarBytesMatchType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '), 'image/webp'))
  assert.ok(!avatarBytesMatchType(new Uint8Array([0xff, 0xd8, 0xff]), 'image/png'))
})

test('avatar upload: checked in the browser before sending; success only with the server-confirmed URL', () => {
  const src = read('app/profile/avatar-upload.tsx')
  const fn = between(src, 'async function handleCropped', '\n  return (')
  const check = fn.indexOf('avatarFileProblem(file)'), bail = fn.indexOf('if (problem) { setError(problem)'), call = fn.indexOf('runAction(() => uploadAvatar(fd))')
  assert.ok(check > 0 && bail > check && call > bail, fn)
  assert.ok(fn.indexOf('if (!result.ok) { setError(result.error); return }') < fn.indexOf('setAvatarUrl('))
  // No success flag -> error; saved without a signed URL -> a notice, never a fake photo (#43 private avatars).
  assert.match(fn, /if \(!\('success' in result\.value\)\) \{ setError\(/)
  assert.ok(fn.indexOf('if (result.value.avatarUrl)') < fn.indexOf('setAvatarUrl(result.value.avatarUrl)'))
  assert.match(fn, /setNotice\(result\.value\.notice/)
  assert.match(src, /error && <p role="alert"/)
})

test('PDF import: checked in the browser before sending, scoped to the clip, result checked', () => {
  const src = read('app/clips/[id]/metrics-tab.tsx')
  const fn = between(src, 'function handlePdfFile', 'async function handlePdfSave')
  assert.ok(fn.indexOf('pdfFileProblem(file)') < fn.indexOf('parseTrackmanPDF(fd)'))
  assert.match(fn, /fd\.set\('clipId', clipId\)/)
  assert.match(fn, /runAction\(\(\) => parseTrackmanPDF\(fd\)\)/)
  const unused = read('components/trackman-import.tsx')
  assert.ok(unused.indexOf('pdfFileProblem(file)') < unused.indexOf('parseTrackmanPDF(fd)'))
})
