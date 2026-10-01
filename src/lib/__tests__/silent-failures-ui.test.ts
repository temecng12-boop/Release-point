/**
 * UI handlers that call server actions change the screen (remove, rename,
 * navigate) only after the result was checked, and show the error otherwise.
 * The repo has no DOM test setup, so these read the component source; the
 * failure handling itself is tested in action-result.test.ts and actions/*.
 * Run with: npx tsx --test src/lib/__tests__/silent-failures-ui.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = new URL('../../', import.meta.url)
const read = (p: string) => readFileSync(new URL(p, SRC), 'utf8')

/** Body of `function name(` up to the next function at the same indent. */
function fnBody(src: string, name: string, indent = '  ') {
  const start = src.search(new RegExp(`\\n${indent}(async )?function ${name}\\(`))
  assert.ok(start >= 0, `function ${name} not found`)
  const rest = src.slice(start + 1)
  const end = rest.slice(1).search(new RegExp(`\\n${indent}(async )?function |\\n${indent}return \\(|\\n}`))
  return end < 0 ? rest : rest.slice(0, end + 1)
}

/** Each snippet appears, in this order. */
function inOrder(body: string, ...snippets: string[]) {
  let at = 0
  for (const p of snippets) {
    const i = body.indexOf(p, at)
    assert.ok(i >= 0, `expected ${JSON.stringify(p)} after position ${at} in:\n${body}`)
    at = i + p.length
  }
}

test('video player: removing a mark waits for the server and keeps it on failure', () => {
  const src = read('components/video-player.tsx')
  const body = fnBody(src, 'removeAnnotation')
  assert.match(body, /if \(!shape\.id\) return/)
  inOrder(body, 'runAction(() => deleteAnnotation(', 'if (!result.ok) { setMarkError(', 'return }', 'annotationsRef.current = annotationsRef.current.filter')
  assert.match(src, /disabled=\{!m\.ref\.id\}/)
})

test('video player: Clear marks keeps the marks on failure, and only removes what the server deleted', () => {
  const body = fnBody(read('components/video-player.tsx'), 'clearMarks')
  inOrder(body, 'runAction(() => clearAnnotations(clipId))', 'if (!result.ok) { setMarkError(', 'return }', 'marksAfterClear(', 'annotationsRef.current = kept')
  assert.doesNotMatch(body, /annotationsRef\.current = \[\]/)
  assert.doesNotMatch(body, /setMarkList\(\[\]\)/)
})

test('video player: the mark error line shows each message as written (not always "Mark not saved")', () => {
  const src = read('components/video-player.tsx')
  assert.match(src, /markError && <p role="alert"[^>]*>\{markError\}<\/p>/)
  assert.match(src, /setMarkError\(`Mark not saved: \$\{result\.error\}`\)/)
})

test('video player: a lesson save warning is shown instead of "Lesson saved"', () => {
  const src = read('components/video-player.tsx')
  assert.match(src, /setLessonWarning\(saveResult && 'warning' in saveResult/)
  assert.match(src, /lessonWarning && <span role="status"/)
})

test('clip title: a failed rename reverts the title and shows the error', () => {
  const body = fnBody(read('app/clips/[id]/clip-title.tsx'), 'save')
  inOrder(body, 'runAction(() => renameClip(clipId, trimmed))', 'if (!result.ok) {', 'setValue(saved)', 'setError(', 'return', 'setSaved(trimmed)', 'router.refresh()')
  assert.match(read('app/clips/[id]/clip-title.tsx'), /\{error && <p role="alert"/)
})

test('bullpen: Back saves first and only leaves the run screen after the save worked', () => {
  const src = read('app/dashboard/bullpen-modal.tsx')
  const body = fnBody(src, 'handleSaveProgress')
  inOrder(body, 'runAction(() => updateBullpenSession(session.id, { pitches }))', 'if (!result.ok) { setError(', 'return }', 'onBack({ ...session, pitches })')
  assert.match(src, /<button onClick=\{handleSaveProgress\} disabled=\{saving\}/)
  assert.doesNotMatch(src, /handleSaveProgress\(\); onBack\(\)/)
  // The saved counts replace the stale copy in the session list.
  inOrder(fnBody(src, 'handleBackFromRun'), 'setSessions(prev => prev.map(s => s.id === saved.id ? saved : s))', "setView('list')")
})

test('bullpen: a session leaves the list only when the delete succeeded; otherwise the error shows', () => {
  const src = read('app/dashboard/bullpen-modal.tsx')
  const modal = src.slice(src.indexOf('export default function BullpenModal'))
  inOrder(fnBody(modal, 'handleDelete'), 'runAction(() => deleteBullpenSession(id))', 'if (!result.ok) return result.error', 'setSessions(prev => prev.filter(s => s.id !== id))')
  const list = src.slice(src.indexOf('function SessionList'), src.indexOf('export default function BullpenModal'))
  inOrder(fnBody(list, 'handleDelete'), 'const error = await onDelete(id)', 'if (error) { setDeleteError(', 'return }', 'setConfirmDel(null)')
  assert.match(list, /\{deleteError \?\? 'Delete this session\?'\}/)
})

test('player row: a clip delete warning is shown', () => {
  const src = read('app/dashboard/player-row.tsx')
  inOrder(fnBody(src, 'handleDeleteClip'), 'runAction(() => deleteClip(clipId))', 'if (!result.ok) {', 'setDeleteError(result.error)', 'setDeleteWarning(result.warning)')
  assert.match(src, /\{deleteWarning && \(/)
})

test('guardian consent form: shows the returned error and re-enables the button', () => {
  const src = read('app/guardian/consent/consent-form.tsx')
  inOrder(fnBody(src, 'handleConsent'), 'runAction(() => recordConsent(playerId))', 'if (!result.ok) {', 'setError(result.error)', 'setPending(false)')
  assert.match(src, /\{error && <p role="alert"/)
})

test('auth confirm: a failed player link shows a message with Try again and Continue, sign-in is kept', () => {
  const src = read('app/auth/confirm/page.tsx')
  inOrder(src, 'const link = await runAction(() => linkPlayerRow())', 'if (!link.ok) {', "setStatus('link-failed')", 'return', 'window.location.href = next')
  inOrder(src, "status === 'link-failed'", '{errorMsg}', 'onClick={retryLink}', 'Continue Anyway')
  assert.doesNotMatch(src, /^\s*await linkPlayerRow\(\)/m)
})

test('clip-notes.tsx is gone and nothing imports it', () => {
  assert.equal(existsSync(new URL('app/clips/[id]/clip-notes.tsx', SRC)), false)
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : []
  })
  for (const f of walk(new URL('.', SRC).pathname)) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), /from ['"](\.\/|@\/app\/clips\/\[id\]\/)clip-notes['"]/, f)
  }
})
