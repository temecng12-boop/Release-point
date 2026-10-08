/**
 * Per-clip pitching/hitting toggle: Pitching/Hitting chips, aria-pressed,
 * 44px, never locked for coach/player, failed save shows an error.
 * Run with: npx tsx --test src/lib/__tests__/clip-kind-ui.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const SRC = new URL('../../', import.meta.url)
const src = (p: string) => readFileSync(new URL(p, SRC), 'utf8')

test('clip kind toggle: pitching/hitting buttons, aria-pressed, 44px, wrap', () => {
  const s = src('app/clips/[id]/clip-kind-toggle.tsx')
  assert.match(s, /Pitching/)
  assert.match(s, /Hitting/)
  assert.match(s, /aria-pressed=\{pressed\}/)
  assert.match(s, /min-h-11 min-w-11/)
  assert.match(s, /flex flex-wrap/)
  assert.match(s, /role="alert"/)
})

test('clip kind toggle: save waits for the server; failure shows an error and does not flip', () => {
  const s = src('app/clips/[id]/clip-kind-toggle.tsx')
  const start = s.indexOf('async function choose')
  assert.ok(start >= 0)
  const body = s.slice(start, s.indexOf('return (', start))
  assert.match(body, /runAction\(\(\) => saveClipKind\(clipId, next\)\)/)
  assert.ok(body.indexOf('if (!result.ok)') < body.indexOf('setKind(next)'))
  assert.match(body, /setError\(result\.error\)/)
  assert.match(body, /return/)
  assert.ok(body.indexOf('setKind(next)') > body.indexOf('runAction'), 'kind flips only after the save')
})

test('clip tabs pick the tool set from the clip toggle, not the player position', () => {
  const s = src('app/clips/[id]/clip-tabs.tsx')
  assert.match(s, /ClipKindToggle/)
  assert.match(s, /initialClipKind/)
  assert.match(s, /clipKind === 'pitching'/)
  assert.doesNotMatch(s, /function isPitcherPosition/)
  assert.doesNotMatch(s, /isPitcherPosition\(playerPosition\)/)
})

test('clip page loads clip_kind (missing column = default from positions) and never locks the toggle for coach/player', () => {
  const s = src('app/clips/[id]/page.tsx')
  assert.match(s, /select\('clip_kind'\)/)
  assert.match(s, /resolveClipKind\(storedClipKind, resolvePlayerPositions\(playerRow\)\)/)
  assert.match(s, /canEditClipKind=\{access\.via !== 'guardian'\}/)
  assert.match(s, /full_name, age_group, position, positions/)
})
