/**
 * Position chips: six optional toggles, aria-pressed, 44px, wrap; used on
 * invite, edit player, settings, and onboarding. Zero selected is valid.
 * Run with: npx tsx --test src/lib/__tests__/position-chips-ui.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import PositionChips from '../../components/position-chips'

const SRC = new URL('../../', import.meta.url)
const src = (p: string) => readFileSync(new URL(p, SRC), 'utf8')

const LABELS = ['Pitcher', 'Hitter', 'Catcher', 'Infield', 'Outfield', 'Two-way']

function render(el: ReactElement) {
  return renderToStaticMarkup(el)
}

test('chips render all six tags as toggle buttons with aria-pressed and 44px targets', () => {
  const html = render(h(PositionChips, { defaultValue: ['catcher'] }))
  for (const label of LABELS) assert.match(html, new RegExp(label))
  assert.equal((html.match(/aria-pressed="/g) ?? []).length, 6)
  assert.match(html, /aria-pressed="true"[^>]*>Catcher|aria-pressed="true"[^>]*Catcher/)
  assert.match(html, /min-h-11 min-w-11/)
  assert.match(html, /flex flex-wrap/)
  assert.match(html, /\(optional\)/)
  assert.doesNotMatch(html, /required/)
})

test('invite, team invite, edit player, settings, and onboarding use the chips (no pitcher/hitter-only select)', () => {
  for (const f of [
    'app/dashboard/invite-form.tsx',
    'app/dashboard/team/[id]/team-invite-form.tsx',
    'app/dashboard/edit-player-modal.tsx',
    'app/player-settings/player-settings-form.tsx',
    'app/onboarding/position-picker.tsx',
  ]) {
    const s = src(f)
    assert.match(s, /PositionChips/, `${f} uses PositionChips`)
    assert.doesNotMatch(s, /POSITIONS = \['pitcher', 'hitter'\]/, `${f}: no two-option list`)
    assert.doesNotMatch(s, /<option[^>]*>Hitter/, `${f}: no hitter-only select`)
  }
})

test('invite chips are optional: no required attribute and zero selected is valid', () => {
  for (const f of ['app/dashboard/invite-form.tsx', 'app/dashboard/team/[id]/team-invite-form.tsx']) {
    const s = src(f)
    assert.match(s, /name="positions"/)
    assert.doesNotMatch(s, /name="positions"[^>]*required/)
    const chip = s.slice(s.indexOf('<PositionChips'), s.indexOf('/>', s.indexOf('<PositionChips')) + 2)
    assert.doesNotMatch(chip, /required/)
  }
})

test('edit player and settings save the chip array, not a single select value', () => {
  const edit = src('app/dashboard/edit-player-modal.tsx')
  assert.match(edit, /positions,/)
  assert.match(edit, /positionsFromSource\(player\)/)
  const settings = src('app/player-settings/player-settings-form.tsx')
  assert.match(settings, /positions,/)
  assert.match(settings, /updatePlayerSelfProfile/)
})

test('onboarding continue works with zero chips; consent still required', () => {
  const s = src('app/onboarding/position-picker.tsx')
  assert.match(s, /savePlayerPosition\(selected\)/)
  assert.match(s, /disabled=\{\!consent \|\| loading\}/)
  assert.doesNotMatch(s, /disabled=\{\!selected \|\| !consent/)
})

test('signup does not add a required position step', () => {
  const s = src('app/auth/signup/signup-form.tsx')
  assert.doesNotMatch(s, /PositionChips|name="positions"/)
})
