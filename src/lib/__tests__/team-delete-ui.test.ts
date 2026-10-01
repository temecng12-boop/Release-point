/**
 * Team delete UI: a confirm step that names the team, 44px buttons that work
 * on tap (no hover-only controls), and the page only changes after the server
 * confirmed the delete. The repo has no DOM test setup, so this reads the
 * component source; the action is tested in actions/team-delete.test.ts and
 * the SQL in PGlite.
 * Run with: npx tsx --test src/lib/__tests__/team-delete-ui.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const SRC = new URL('../../', import.meta.url)
const read = (p: string) => readFileSync(new URL(p, SRC), 'utf8')
const button = read('app/dashboard/team/[id]/delete-team-button.tsx')

test('team page shows the delete button with the team name', () => {
  assert.match(read('app/dashboard/team/[id]/page.tsx'), /<DeleteTeamButton teamId=\{id\} teamName=\{team\.name\} \/>/)
})

test('confirm dialog names the team and says players are kept', () => {
  assert.match(button, /role="dialog"/)
  assert.match(button, /aria-modal="true"/)
  assert.match(button, /Delete &ldquo;\{teamName\}&rdquo;\?/)
  assert.match(button, /Players are not deleted/)
})

test('every button is at least 44px tall and nothing is hover-only', () => {
  const buttons = button.match(/<button[\s\S]*?<\/button>/g) ?? []
  assert.equal(buttons.length, 3)
  // globals.css's unlayered `button { min-height: 36px }` beats min-h-* utilities, so it's inline.
  assert.match(button, /const tap = \{ minHeight: 44 \}/)
  for (const b of buttons) assert.match(b, /style=\{(tap|\{ \.\.\.oswald, \.\.\.tap \})\}/, b)
  assert.doesNotMatch(button, /hover:|group-hover|onMouseEnter|onMouseOver/)
})

test('leaves the page only after the server confirmed; on failure the error shows and the dialog stays', () => {
  const body = button.slice(button.indexOf('async function handleDelete'), button.indexOf('function close'))
  const check = body.indexOf('if (!result.ok)')
  assert.ok(body.indexOf('runAction(() => deleteTeam(teamId))') >= 0 && check > 0)
  assert.ok(body.indexOf('setError(result.error)') > check)
  assert.ok(body.indexOf('return') > check && body.indexOf("router.replace('/dashboard')") > body.indexOf('return'))
  assert.doesNotMatch(body.slice(0, check), /setOpen\(false\)|router\./)
})
