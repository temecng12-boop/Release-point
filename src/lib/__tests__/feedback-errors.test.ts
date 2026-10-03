/**
 * "Report a problem": error mapping and the server submit path.
 * Run with: npx tsx --test src/lib/__tests__/feedback-errors.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { feedbackErrorKind, feedbackErrorMessage, screenshotFailureNote } from '../feedback/errors'
import { submitFeedback } from '../feedback/submit'

const U = '11111111-1111-4111-8111-111111111111', R = '22222222-2222-4222-8222-222222222222'

test('database and storage errors map to friendly kinds', () => {
  assert.equal(feedbackErrorKind({ code: 'RP429', message: 'feedback_rate_limited' }), 'rate_limited')
  assert.equal(feedbackErrorKind({ code: '42P01', message: 'relation "public.feedback_reports" does not exist' }), 'not_set_up')
  assert.equal(feedbackErrorKind({ code: 'PGRST205', message: "Could not find the table 'public.feedback_reports' in the schema cache" }), 'not_set_up')
  assert.equal(feedbackErrorKind({ statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' }), 'not_set_up')
  assert.equal(feedbackErrorKind({ statusCode: '413', message: 'The object exceeded the maximum allowed size' }), 'too_large')
  assert.equal(feedbackErrorKind({ statusCode: '415', message: 'mime type image/gif is not supported' }), 'bad_type')
  assert.equal(feedbackErrorKind({ code: 'PGRST301', message: 'JWT expired' }), 'signed_out')
  assert.equal(feedbackErrorKind({ message: 'TypeError: Failed to fetch' }), 'network')
  assert.equal(feedbackErrorKind({ code: '42501', message: 'new row violates row-level security policy' }), 'unknown')
  assert.equal(feedbackErrorKind(null), 'unknown')
  for (const k of ['rate_limited', 'not_set_up', 'signed_out', 'too_large', 'bad_type', 'invalid', 'network', 'unknown'] as const)
    assert.match(feedbackErrorMessage(k), /^Couldn't send your report/)
  assert.match(feedbackErrorMessage('not_set_up'), /isn't set up yet/)
})

test('screenshot failure notes', () => {
  assert.equal(screenshotFailureNote({ statusCode: '413', message: 'The object exceeded the maximum allowed size' }), 'the file is larger than 10 MB')
  assert.match(screenshotFailureNote({ statusCode: '403', message: 'new row violates row-level security policy' }), /too many uploads|wasn’t allowed/)
  assert.equal(screenshotFailureNote({ message: 'Bucket not found' }), 'screenshot storage isn’t set up yet')
  assert.equal(screenshotFailureNote({ message: 'weird' }), 'the upload failed')
})

function fakeClient(error: { code?: string; message?: string } | null = null) {
  const rows: Record<string, unknown>[] = []
  let selected = false
  const client = { from: (t: string) => ({ insert: (row: Record<string, unknown>) => {
    assert.equal(t, 'feedback_reports'); rows.push(row)
    const p = Promise.resolve({ error }) as Promise<{ error: typeof error }> & { select?: () => void }
    p.select = () => { selected = true }
    return p
  } }) }
  return { client, rows, selected: () => selected }
}
const req = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1', origin: 'https://releasepointai.com', env: { VERCEL_GIT_COMMIT_SHA: 'abcdef1234567', VERCEL_ENV: 'production' } }
const ctx = { pageUrl: `https://releasepointai.com/clips/${R}`, viewportW: 390, viewportH: 664, pixelRatio: 3 }

test('submit: inserts with the user session client, no read-back, server-side version and device', async () => {
  const f = fakeClient()
  const r = await submitFeedback(f.client, { id: U, email: 'c@x.test' }, { id: R, message: ' It froze ', context: ctx, screenshot: { path: `${U}/${R}.png`, mime: 'image/png', bytes: 2048 } }, req)
  assert.deepEqual(r, { ok: true, id: R, screenshot: 'attached' })
  assert.equal(f.selected(), false)
  const row = f.rows[0]
  assert.equal(row.user_id, U); assert.equal(row.message, 'It froze'); assert.equal(row.route, '/clips/[id]'); assert.equal(row.clip_id, R)
  assert.equal(row.device, 'iPhone'); assert.equal(row.browser, 'Safari 18.6'); assert.equal(row.app_version, 'abcdef123456 (production)')
  assert.equal(row.screenshot_path, `${U}/${R}.png`); assert.equal(row.screenshot_status, 'attached')
})

test('submit: screenshot failed or invalid -> text report still sent, marked failed', async () => {
  const f = fakeClient()
  assert.deepEqual(await submitFeedback(f.client, { id: U }, { id: R, message: 'x', context: ctx, screenshotFailed: true }, req), { ok: true, id: R, screenshot: 'failed' })
  assert.deepEqual(await submitFeedback(f.client, { id: U }, { id: R, message: 'x', context: ctx, screenshot: { path: `someone-else/${R}.png`, mime: 'image/png', bytes: 1 } }, req), { ok: true, id: R, screenshot: 'failed' })
  assert.deepEqual(f.rows.map(r => [r.screenshot_status, r.screenshot_path]), [['failed', null], ['failed', null]])
})

test('submit: never silent on failure', async () => {
  const err = console.error; console.error = () => {}
  try {
    const missing = await submitFeedback(fakeClient({ code: 'PGRST205', message: "Could not find the table 'public.feedback_reports'" }).client, { id: U }, { id: R, message: 'x', context: ctx }, req)
    assert.ok(!missing.ok && missing.kind === 'not_set_up' && /Couldn't send your report/.test(missing.error))
    const limited = await submitFeedback(fakeClient({ code: 'RP429', message: 'feedback_rate_limited' }).client, { id: U }, { id: R, message: 'x', context: ctx }, req)
    assert.ok(!limited.ok && limited.kind === 'rate_limited' && /wait a few minutes/.test(limited.error))
  } finally { console.error = err }
  const f = fakeClient()
  const out = await submitFeedback(f.client, null, { id: R, message: 'x', context: ctx }, req)
  assert.ok(!out.ok && out.kind === 'signed_out')
  const blank = await submitFeedback(f.client, { id: U }, { id: R, message: '  ', context: ctx }, req)
  assert.ok(!blank.ok && blank.kind === 'invalid')
  const badId = await submitFeedback(f.client, { id: U }, { id: 'nope', message: 'x', context: ctx }, req)
  assert.ok(!badId.ok)
  assert.equal(f.rows.length, 0)
})
