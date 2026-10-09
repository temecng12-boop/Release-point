/**
 * Voice note / lesson file removal: the player's direct coach or a coach on a
 * team that includes the player (same rule as saving them).
 * Run with: npx tsx --test src/lib/__tests__/clip-media-delete.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { removeClipMediaAsOwnCoach } from '../clip-media-delete'

const P = '11111111-1111-4111-8111-111111111111', C = '33333333-3333-4333-8333-333333333333'
function fake(clip: Record<string, string | null>) {
  const removed: string[] = [], updates: Record<string, unknown>[] = []
  const tables: Record<string, Record<string, unknown>[]> = {
    clips: [{ id: C, player_id: P, ...clip }],
    players: [{ id: P, coach_id: 'coach', user_id: 'player', team_id: 'T' }],
    player_teams: [{ player_id: P, team_id: 'T' }],
    team_coaches: [
      { team_id: 'T', coach_id: 'coach', role: 'organizer' },
      { team_id: 'T', coach_id: 'asst', role: 'assistant' },
    ],
  }
  const client = {
    from: (t: string) => ({
      select: () => ({
        eq: (c: string, v: string) => {
          const filtered = (tables[t] ?? []).filter(r => r[c] === v)
          return {
            maybeSingle: async () => ({ data: filtered[0] ?? null, error: null }),
            in: async (c2: string, vals: string[]) => ({ data: filtered.filter(r => vals.includes(r[c2] as string)), error: null }),
            then: (res: (v: { data: unknown; error: null }) => unknown, rej?: (e: unknown) => unknown) =>
              Promise.resolve({ data: filtered, error: null }).then(res, rej),
          }
        },
      }),
      update: (v: Record<string, unknown>) => ({ eq: async () => { updates.push(v); return { error: null } } }),
    }),
    storage: { from: (b: string) => ({ remove: async (p: string[]) => { removed.push(...p.map(x => `${b}:${x}`)); return { error: null } } }) },
  }
  return { client, removed, updates }
}

test('voice note: direct coach and team assistant remove the file; player, off-team, others and signed-out cannot', async () => {
  const voice = `${P}/${C}/voice.webm`
  for (const who of ['player', 'stranger', 'off', null]) {
    const f = fake({ voice_path: voice })
    assert.ok('error' in await removeClipMediaAsOwnCoach(f.client, who, C, 'voice'), String(who))
    assert.deepEqual([f.removed, f.updates], [[], []])
  }
  for (const who of ['coach', 'asst']) {
    const f = fake({ voice_path: voice })
    assert.deepEqual(await removeClipMediaAsOwnCoach(f.client, who, C, 'voice'), { success: true }, who)
    assert.deepEqual(f.removed, [`clips:${voice}`])
    assert.deepEqual(f.updates, [{ voice_path: null }])
  }
})

test('lesson: direct coach and team assistant, lessons bucket; a path outside the clip folder is not removed', async () => {
  const lesson = `${P}/${C}/lesson-1-a.webm`
  const f = fake({ lesson_path: lesson })
  assert.deepEqual(await removeClipMediaAsOwnCoach(f.client, 'player', C, 'lesson'), { error: 'Not authorized' })
  assert.deepEqual(await removeClipMediaAsOwnCoach(f.client, 'coach', C, 'lesson'), { success: true })
  assert.deepEqual(f.removed, [`lessons:${lesson}`])
  const a = fake({ lesson_path: lesson })
  assert.deepEqual(await removeClipMediaAsOwnCoach(a.client, 'asst', C, 'lesson'), { success: true })
  assert.deepEqual(a.removed, [`lessons:${lesson}`])
  const g = fake({ lesson_path: `22222222-2222-4222-8222-222222222222/${C}/lesson.webm` })
  assert.deepEqual(await removeClipMediaAsOwnCoach(g.client, 'coach', C, 'lesson'), { success: true })
  assert.deepEqual(g.removed, [])
  assert.deepEqual(await removeClipMediaAsOwnCoach(fake({}).client, 'coach', 'nope', 'voice'), { error: 'Clip not found' })
})

test('storage remove fails: column is NOT cleared and an error is returned (voice and lesson)', async () => {
  for (const [kind, col, path] of [['voice', 'voice_path', `${P}/${C}/voice.webm`], ['lesson', 'lesson_path', `${P}/${C}/lesson-1-a.webm`]] as const) {
    const f = fake({ [col]: path })
    ;(f.client.storage as { from: unknown }).from = () => ({ remove: async () => ({ error: { message: 'boom' } }) })
    const r = await removeClipMediaAsOwnCoach(f.client, 'coach', C, kind)
    assert.ok('error' in r && /Could not delete/.test(r.error!), kind)
    assert.deepEqual(f.updates, [], kind)
  }
})
