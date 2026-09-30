/**
 * Run with: npx tsx --test src/lib/__tests__/voice-path.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isVoicePathFor } from '../voice-path'

const P = '11111111-1111-4111-8111-111111111111'
const C = '33333333-3333-4333-8333-333333333333'
const OTHER = '22222222-2222-4222-8222-222222222222'

test('accepts the voice note path for this player and clip', () => {
  for (const ext of ['webm', 'mp4', 'm4a']) assert.equal(isVoicePathFor(`${P}/${C}/voice.${ext}`, P, C), true, ext)
})

test("rejects another player's or another clip's folder", () => {
  assert.equal(isVoicePathFor(`${OTHER}/${C}/voice.webm`, P, C), false)
  assert.equal(isVoicePathFor(`${P}/${OTHER}/voice.webm`, P, C), false)
})

test('rejects other files, shapes and extensions', () => {
  for (const bad of [
    `${P}/voice.webm`,                    // no clip folder
    `${P}/${C}/lesson.webm`,              // a lesson, not the voice note
    `${P}/${C}/ts_voice/x.webm`,          // timestamp voice note
    `${P}/${C}/voice.webm/x`,             // extra segment
    `${P}/${C}/voice.exe`,
    `${P}/${C}/voice.WEBM`,
    `${P}/${C}/voice.webm.exe`,
    `${P}/${C}/../${C}/voice.webm`,
    `/${P}/${C}/voice.webm`,
    `${P}/${C}/`,
    `${P}/1727650000000.mp4`,             // a clip video
  ]) assert.equal(isVoicePathFor(bad, P, C), false, bad)
})

test('rejects non-strings and missing ids', () => {
  for (const bad of [null, undefined, 42, {}, ['x']]) assert.equal(isVoicePathFor(bad, P, C), false)
  assert.equal(isVoicePathFor(`${P}/${C}/voice.webm`, '', C), false)
  assert.equal(isVoicePathFor(`${P}/${C}/voice.webm`, P, ''), false)
})

// saveVoicePath: only the player's own (direct) coach may attach the voice note.
import { isPlayersOwnCoach } from '../auth/roster-access'
const COACH = '44444444-4444-4444-8444-444444444444'
const PLAYER_USER = '55555555-5555-4555-8555-555555555555'
const TEAM_COACH = '66666666-6666-4666-8666-666666666666'

test('voice notes: the direct coach may save; the player, a team coach or a stranger may not', () => {
  const player = { coach_id: COACH }
  assert.equal(isPlayersOwnCoach(COACH, player), true)
  assert.equal(isPlayersOwnCoach(PLAYER_USER, player), false)
  assert.equal(isPlayersOwnCoach(TEAM_COACH, player), false)
  assert.equal(isPlayersOwnCoach(null, player), false)
  assert.equal(isPlayersOwnCoach(COACH, { coach_id: null }), false)
  assert.equal(isPlayersOwnCoach(COACH, null), false)
})

test('saveVoicePath uses the own-coach check and the exact voice path check', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../../app/actions/clips.ts', import.meta.url), 'utf8')
  const fn = src.slice(src.indexOf('export async function saveVoicePath'), src.indexOf('export async function deleteClip'))
  assert.match(fn, /isPlayersOwnCoach\(user\.id,/)
  assert.match(fn, /isVoicePathFor\(voicePath, clip\.player_id, clipId\)/)
  assert.doesNotMatch(fn, /user_id !== user\.id|playerIdFromStoragePath/)
})
