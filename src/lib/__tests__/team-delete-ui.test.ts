/**
 * Team delete UI: a confirm step that names the team and shows the server's
 * counts, delete disabled while players would be left with no coach, 44px
 * buttons that work on tap (no hover-only controls), and the page only
 * changes after the server confirmed the delete. The repo has no DOM test setup, so this reads the
 * component source; the action is tested in actions/team-delete.test.ts and
 * the SQL in PGlite.
 * Run with: npx tsx --test src/lib/__tests__/team-delete-ui.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { blockedLine, losingAccessLine } from '../team-delete-copy'

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

test('dialog loads the counts from the server when it opens', () => {
  const body = button.slice(button.indexOf('async function openDialog'), button.indexOf('async function handleDelete'))
  assert.match(body, /runAction\(\(\) => getTeamDeletePreview\(teamId\)\)/)
  assert.match(body, /if \(!result\.ok\) \{ setError\(result\.error\); return \}/)
  assert.match(button, /\{losingAccessLine\(preview\.playersLosingAccess\)\}/)
})

test('delete is disabled until counts load, and while players would have no coach, with the reason shown', () => {
  assert.match(button, /const blocked = preview !== null && preview\.playersWithoutCoach > 0/)
  assert.match(button, /const canDelete = preview !== null && !blocked && !loading && !deleting/)
  assert.match(button, /onClick=\{handleDelete\}\s+disabled=\{!canDelete\}/)
  assert.match(button, /\{blocked && \(\s*<p[^>]*>\{blockedLine\(preview\.playersWithoutCoach\)\}<\/p>/)
})

test('a refused delete never navigates away', () => {
  const body = button.slice(button.indexOf('async function handleDelete'), button.indexOf('function close'))
  const guard = body.indexOf('if (result.value.blocked !== undefined || !result.value.success)')
  assert.ok(guard > 0 && guard < body.indexOf("router.replace('/dashboard')"))
})

test('wording', () => {
  assert.equal(losingAccessLine(3), '3 players will no longer appear for coaches who only see them through this team.')
  assert.equal(losingAccessLine(1), '1 player will no longer appear for coaches who only see them through this team.')
  assert.equal(losingAccessLine(0), 'Every player on this team stays visible to their coaches.')
  assert.match(blockedLine(1), /^1 player on this team has no coach of their own and no other team\./)
  assert.match(blockedLine(2), /^2 players on this team have no coach/)
})
