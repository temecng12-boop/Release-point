/**
 * Voice note / lesson file removal: the player's own coach only.
 * Run with: npx tsx --test src/lib/__tests__/clip-media-delete.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { removeClipMediaAsOwnCoach } from '../clip-media-delete'

const P = '11111111-1111-4111-8111-111111111111', C = '33333333-3333-4333-8333-333333333333'
function fake(clip: Record<string, string | null>) {
  const removed: string[] = [], updates: Record<string, unknown>[] = []
  const rows: Record<string, Record<string, unknown>> = { clips: { id: C, player_id: P, ...clip }, players: { id: P, coach_id: 'coach', user_id: 'player', team_id: 'T' } }
  const client = {
    from: (t: string) => ({
      select: () => ({ eq: (_c: string, v: string) => ({ maybeSingle: async () => ({ data: rows[t]?.id === v ? rows[t] : null, error: null }) }) }),
      update: (v: Record<string, unknown>) => ({ eq: async () => { updates.push(v); return { error: null } } }),
    }),
    storage: { from: (b: string) => ({ remove: async (p: string[]) => { removed.push(...p.map(x => `${b}:${x}`)); return { error: null } } }) },
  }
  return { client, removed, updates }
}

test('voice note: direct coach removes the file and clears voice_path; team coach, player, others and signed-out cannot', async () => {
  const voice = `${P}/${C}/voice.webm`
  for (const who of ['asst', 'player', 'stranger', null]) {
    const f = fake({ voice_path: voice })
    assert.ok('error' in await removeClipMediaAsOwnCoach(f.client, who, C, 'voice'), String(who))
    assert.deepEqual([f.removed, f.updates], [[], []])
  }
  const f = fake({ voice_path: voice })
  assert.deepEqual(await removeClipMediaAsOwnCoach(f.client, 'coach', C, 'voice'), { success: true })
  assert.deepEqual(f.removed, [`clips:${voice}`])
  assert.deepEqual(f.updates, [{ voice_path: null }])
})

test('lesson: direct coach only, lessons bucket; a path outside the clip folder is not removed', async () => {
  const lesson = `${P}/${C}/lesson-1-a.webm`
  const f = fake({ lesson_path: lesson })
  assert.deepEqual(await removeClipMediaAsOwnCoach(f.client, 'player', C, 'lesson'), { error: 'Not authorized' })
  assert.deepEqual(await removeClipMediaAsOwnCoach(f.client, 'coach', C, 'lesson'), { success: true })
  assert.deepEqual(f.removed, [`lessons:${lesson}`])
  const g = fake({ lesson_path: `22222222-2222-4222-8222-222222222222/${C}/lesson.webm` })
  assert.deepEqual(await removeClipMediaAsOwnCoach(g.client, 'coach', C, 'lesson'), { success: true })
  assert.deepEqual(g.removed, [])
  assert.deepEqual(await removeClipMediaAsOwnCoach(fake({}).client, 'coach', 'nope', 'voice'), { error: 'Clip not found' })
})
