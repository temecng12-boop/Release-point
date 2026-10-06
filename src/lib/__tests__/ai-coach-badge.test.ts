/**
 * AI Coach audience badges (promo v8): labels only — Full for coach, Lite for player.
 * Run with: npx tsx --test src/lib/__tests__/ai-coach-badge.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { aiCoachAudienceBadge, aiCoachAudienceEyebrow } from '../ai-coach-badge'

test('coach → AI Coach · Full; player → Player AI · Lite', () => {
  assert.equal(aiCoachAudienceBadge('coach'), 'AI Coach · Full')
  assert.equal(aiCoachAudienceBadge('player'), 'Player AI · Lite')
  assert.equal(aiCoachAudienceEyebrow('coach'), 'Deep read of notes + metrics')
  assert.equal(aiCoachAudienceEyebrow('player'), 'Your bot')
})

test('ai-chat.tsx shows the badge from role; does not invent Lite capabilities in copy', () => {
  const src = readFileSync(new URL('../../app/clips/[id]/ai-chat.tsx', import.meta.url), 'utf8')
  assert.match(src, /aiCoachAudienceBadge\(role\)/)
  assert.match(src, /data-ai-badge=\{role\}/)
  // role must be taken from props (was typed but unused before).
  assert.match(src, /export default function AIChat\(\{\n  clipId,\n  available = true,\n  role,/)
  assert.match(src, /from '@\/lib\/ai-coach-badge'/)
  // No claim that Lite is a weaker model / limited tools.
  assert.doesNotMatch(src, /weaker|limited model|fewer tools|lite model|lighter model/i)
  // Touch targets on Switch Agent + Send.
  assert.match(src, /Switch Agent[\s\S]*?min-h-11/)
  assert.match(src, /min-h-11 px-4 py-2 rounded-md text-sm text-white/)
})

test('clip-tabs still passes role into AIChat (coach vs player)', () => {
  const tabs = readFileSync(new URL('../../app/clips/[id]/clip-tabs.tsx', import.meta.url), 'utf8')
  const block = tabs.slice(tabs.indexOf("active === 'AI Coach'"), tabs.indexOf('</motion.div>', tabs.indexOf("active === 'AI Coach'")))
  assert.match(block, /role=\{role\}/)
  assert.match(block, /available=\{aiCoachAvailable\}/)
})

test('prompts and API route unchanged by this PR (labels only)', () => {
  // Guard: badge module must not import the chat route or prompt builders.
  const badge = readFileSync(new URL('../ai-coach-badge.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(badge, /ai-chat|anthropic|systemPrompt|buildBarry|Randy/)
})
