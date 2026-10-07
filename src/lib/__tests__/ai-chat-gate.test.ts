/**
 * POST /api/ai-chat gate (src/lib/ai-chat-gate.ts): coaches pass (their
 * player access is still checked by loadAiChatContext); anyone else needs a
 * completed age screen (age_screen_at set, not frozen). Otherwise 403 with a
 * clear JSON error -- the paid AI is never usable before the one screen.
 * Run with: npx tsx --test src/lib/__tests__/ai-chat-gate.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { AI_CHAT_AGE_ERROR, AI_CHAT_NO_PLAYER_ERROR, checkAiChatGate } from '../ai-chat-gate'
import { UNDER_13_STOP_MESSAGE } from '../under13-mode'

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

type Rows = Record<string, unknown>[]
function mockDb(tables: Record<string, Rows>, errorOn?: string) {
  const db = {
    from(table: string) {
      const chain = {
        select() { return chain },
        eq() { return chain },
        is() { return chain },
        in() { return chain },
        limit() { return chain },
        async maybeSingle() {
          if (errorOn === table) return { data: null, error: { code: 'PGRST204', message: 'column does not exist' } }
          const rows = tables[table] ?? []
          return { data: rows[0] ?? null, error: null }
        },
        then<T>(ok?: ((v: { data: Rows; error: null }) => T | PromiseLike<T>) | null) {
          return Promise.resolve({ data: tables[table] ?? [], error: null }).then(ok)
        },
      }
      return chain
    },
  }
  return db as unknown as Parameters<typeof checkAiChatGate>[0]
}

const T = '2026-10-02T00:00:00Z'
const DONE = { age_band: '13_17', age_band_coach: null, age_band_self: '13_17', age_screen_at: T, age_confirmed_at: T }
const PENDING = { age_band: null, age_band_coach: null, age_band_self: null, age_screen_at: null, age_confirmed_at: null }
const FROZEN = { age_band: 'under_13', age_band_coach: null, age_band_self: 'under_13', age_screen_at: T, age_confirmed_at: T }

test('a coach passes the gate (player access is checked separately)', async () => {
  const gate = await checkAiChatGate(mockDb({ profiles: [{ role: 'coach' }] }), 'u-coach')
  assert.deepEqual(gate, { ok: true })
})

test('a player past the age screen passes (403 before it, 200 after it)', async () => {
  const before = await checkAiChatGate(
    mockDb({ profiles: [{ role: 'player' }], players: [PENDING] }), 'u-kid')
  assert.deepEqual(before, { ok: false, status: 403, error: AI_CHAT_AGE_ERROR })

  const after = await checkAiChatGate(
    mockDb({ profiles: [{ role: 'player' }], players: [DONE] }), 'u-kid')
  assert.deepEqual(after, { ok: true })
})

test('a frozen under-13 account gets the stop message, not the age-screen message', async () => {
  const gate = await checkAiChatGate(
    mockDb({ profiles: [{ role: 'player' }], players: [FROZEN] }), 'u-kid')
  assert.deepEqual(gate, { ok: false, status: 403, error: UNDER_13_STOP_MESSAGE })
})

test('no player account (guardian, stranger, brand-new user): 403 with a clear error', async () => {
  for (const profiles of [[{ role: 'guardian' }], [{ role: 'player' }], []]) {
    const gate = await checkAiChatGate(mockDb({ profiles, players: [] }), 'u-x')
    assert.deepEqual(gate, { ok: false, status: 403, error: AI_CHAT_NO_PLAYER_ERROR })
  }
})

test('the route enforces the gate with a 403 JSON error', () => {
  const route = read('app/api/ai-chat/route.ts')
  assert.match(route, /checkAiChatGate\(supabaseAdmin, user\.id\)/, 'the gate runs for every signed-in caller')
  assert.match(route, /NextResponse\.json\(\{ error: gate\.error \}, \{ status: gate\.status \}\)/, '403 carries a clear JSON error')
})
