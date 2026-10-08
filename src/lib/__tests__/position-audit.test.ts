/**
 * Audit: every UI / action / AI branch on position, pitcher, hitter, isPitcher,
 * two-way. No position tag may hide hitting or pitching tools; the AI prompt
 * uses the clip toggle. Confirmed-unchanged sites are asserted here too.
 * Run with: npx tsx --test src/lib/__tests__/position-audit.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const SRC = new URL('../../', import.meta.url)
const src = (p: string) => readFileSync(new URL(p, SRC), 'utf8')

test('CHANGED: clip tabs pick tools from clip_kind, not player.position', () => {
  const s = src('app/clips/[id]/clip-tabs.tsx')
  assert.match(s, /clipKind === 'pitching'/)
  assert.match(s, /clipKind=\{clipKind\}/)
  assert.doesNotMatch(s, /isPitcherPosition/)
})

test('CHANGED: clip page resolves clip_kind from the toggle / positions default', () => {
  const s = src('app/clips/[id]/page.tsx')
  assert.match(s, /resolveClipKind\(storedClipKind, resolvePlayerPositions\(playerRow\)\)/)
  assert.match(s, /canEditClipKind=\{access\.via !== 'guardian'\}/)
})

test('CHANGED: AI clip context loads clip_kind + positions (missing column is a fallback)', () => {
  const s = src('lib/ai-coach/clip-context.ts')
  assert.match(s, /select\('clip_kind'\)/)
  assert.match(s, /select\('positions'\)/)
  assert.match(s, /resolveClipKind\(storedClipKind, positions\)/)
  assert.match(s, /formatPositionLabels\(positions\)/)
})

test('CHANGED: AI route frames Randy/Barry from the clip toggle; Switch Agent still honored', () => {
  const s = src('app/api/ai-chat/route.ts')
  assert.match(s, /requestedAgent \?\? \(clipKind === 'hitting' \? 'barry' : 'randy'\)/)
  assert.match(s, /This clip:/)
  assert.match(s, /clipKind = c\.clipKind/)
})

test('CHANGED: AI chat defaults the agent from clipKind; both agents stay available', () => {
  const s = src('app/clips/[id]/ai-chat.tsx')
  assert.match(s, /clipKind === 'hitting' \? 'barry' : 'randy'/)
  assert.match(s, /Switch Agent/)
  assert.match(s, /name: 'Randy'/)
  assert.match(s, /name: 'Barry'/)
  assert.doesNotMatch(s, /playerPosition === |isPitcherPosition/)
})

test('CHANGED: profile-level AI uses formatted multi-select labels + defaultClipKind', () => {
  const s = src('lib/ai-chat-context.ts')
  assert.match(s, /formatPositionLabels\(resolvePlayerPositions\(player\)\)/)
  assert.match(s, /defaultClipKind: defaultClipKind\(resolvePlayerPositions\(player\)\)/)
  const profile = src('app/profile/[id]/page.tsx')
  assert.match(profile, /formatPositionLabels\(resolvePlayerPositions\(player\)\)/)
  assert.match(profile, /PositionTags/)
})

test('CONFIRMED: phase checklist and metrics swap from the clip toggle (not a locked position tag)', () => {
  const tabs = src('app/clips/[id]/clip-tabs.tsx')
  assert.match(tabs, /isPitcher \? \(\s*<MetricsTab/)
  assert.match(tabs, /<HittingMetricsTab/)
  assert.match(tabs, /isPitcher=\{isPitcher\}/)
  const checklist = src('app/clips/[id]/phase-checklist.tsx')
  assert.match(checklist, /isPitcher \? PITCHING_PHASES : HITTING_PHASES/)
  const metrics = src('app/clips/[id]/metrics-tab.tsx')
  assert.doesNotMatch(metrics, /if \(playerPosition|isPitcherPosition/)
})

test('CONFIRMED: signup has no position field; invite/onboarding chips are optional', () => {
  assert.doesNotMatch(src('app/auth/signup/signup-form.tsx'), /PositionChips|name="positions"/)
  assert.match(src('app/dashboard/invite-form.tsx'), /PositionChips/)
  assert.match(src('app/onboarding/position-picker.tsx'), /savePlayerPosition\(selected\)/)
  assert.doesNotMatch(src('app/onboarding/position-picker.tsx'), /disabled=\{\!selected/)
})

test('CONFIRMED: dashboard does not force onboarding when position is empty; onboarding skip is display-only', () => {
  assert.doesNotMatch(src('app/dashboard/page.tsx'), /redirect\('\/onboarding'\)/)
  const onboarding = src('app/onboarding/page.tsx')
  assert.match(onboarding, /playerRow\.position/)
  assert.doesNotMatch(onboarding, /isPitcher|hide.*hitting|hide.*pitching/)
})

test('CONFIRMED: no remaining isPitcherPosition helper; skeleton overlay was not added', () => {
  for (const f of [
    'app/clips/[id]/clip-tabs.tsx',
    'app/clips/[id]/page.tsx',
    'app/clips/[id]/ai-chat.tsx',
    'app/api/ai-chat/route.ts',
    'lib/ai-coach/clip-context.ts',
    'app/actions/clips.ts',
    'app/actions/player.ts',
  ]) {
    assert.doesNotMatch(src(f), /isPitcherPosition|function isPitcher\(/, f)
  }
  const skeleton = src('app/clips/[id]/clip-skeleton.tsx')
  assert.doesNotMatch(skeleton, /clip_kind|clipKind|isPitcherPosition/)
})
