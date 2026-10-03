/**
 * "Report a problem" form validation (client and server share it).
 * Run with: npx tsx --test src/lib/__tests__/feedback-validate.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FEEDBACK_MESSAGE_MAX, FEEDBACK_SCREENSHOT_MAX_BYTES, FEEDBACK_COOLDOWN_MS,
  cooldownLeftMs, screenshotPath, screenshotType, validateMessage, validateScreenshot, validateScreenshotMeta,
} from '../feedback/validate'

const U = '11111111-1111-4111-8111-111111111111', R = '22222222-2222-4222-8222-222222222222'

test('message: required, trimmed, max length', () => {
  assert.deepEqual(validateMessage('  The video froze  '), { ok: true, value: 'The video froze' })
  for (const bad of ['', '   \n', null, undefined, 42]) assert.equal(validateMessage(bad).ok, false, String(bad))
  assert.equal(validateMessage('x'.repeat(FEEDBACK_MESSAGE_MAX)).ok, true)
  const r = validateMessage('x'.repeat(FEEDBACK_MESSAGE_MAX + 1))
  assert.ok(!r.ok && /4,000/.test(r.error))
  assert.ok(validateMessage('Élan ✓ 🎯'.repeat(10)).ok)
})

test('screenshot type: png/jpeg/webp/heic/heif, extension fallback when the type is empty', () => {
  assert.equal(screenshotType({ type: 'image/png', name: 'a.png' }), 'image/png')
  assert.equal(screenshotType({ type: 'IMAGE/JPEG', name: 'a' }), 'image/jpeg')
  assert.equal(screenshotType({ type: '', name: 'IMG_0001.HEIC' }), 'image/heic')
  assert.equal(screenshotType({ type: 'application/octet-stream', name: 'shot.heif' }), 'image/heif')
  assert.equal(screenshotType({ type: '', name: 'photo.jpeg' }), 'image/jpeg')
  assert.equal(screenshotType({ type: 'image/gif', name: 'a.gif' }), null)
  assert.equal(screenshotType({ type: 'image/svg+xml', name: 'x.png' }), null)   // the type wins over the name
  assert.equal(screenshotType({ type: '', name: 'notes.pdf' }), null)
})

test('screenshot size: 10 MB cap, empty refused', () => {
  assert.deepEqual(validateScreenshot({ type: 'image/webp', name: 'a.webp', size: 1234 }), { ok: true, value: { mime: 'image/webp', ext: 'webp', bytes: 1234 } })
  assert.equal(validateScreenshot({ type: 'image/png', name: 'a.png', size: FEEDBACK_SCREENSHOT_MAX_BYTES }).ok, true)
  const big = validateScreenshot({ type: 'image/png', name: 'a.png', size: FEEDBACK_SCREENSHOT_MAX_BYTES + 1 })
  assert.ok(!big.ok && /10 MB/.test(big.error))
  assert.equal(validateScreenshot({ type: 'image/png', name: 'a.png', size: 0 }).ok, false)
  assert.equal(validateScreenshot({ type: 'image/gif', name: 'a.gif', size: 10 }).ok, false)
})

test('server check of screenshot metadata: own path, allowed type, size', () => {
  const path = screenshotPath(U, R, 'png')
  assert.equal(path, `${U}/${R}.png`)
  assert.deepEqual(validateScreenshotMeta(U, R, { path, mime: 'image/png', bytes: 5 }), { ok: true, value: { path, mime: 'image/png', bytes: 5 } })
  assert.equal(validateScreenshotMeta(U, R, { path: `${R}/${R}.png`, mime: 'image/png', bytes: 5 }).ok, false)          // other user
  assert.equal(validateScreenshotMeta(U, R, { path: `${U}/${R}.jpg`, mime: 'image/png', bytes: 5 }).ok, false)          // ext/type mismatch
  assert.equal(validateScreenshotMeta(U, R, { path, mime: 'image/png', bytes: FEEDBACK_SCREENSHOT_MAX_BYTES + 1 }).ok, false)
  assert.equal(validateScreenshotMeta(U, R, { path, mime: 'text/html', bytes: 5 }).ok, false)
  assert.equal(validateScreenshotMeta(U, R, null).ok, false)
})

test('client cooldown', () => {
  assert.equal(cooldownLeftMs(null, 1000), 0)
  assert.equal(cooldownLeftMs(1000, 1000 + 5000), FEEDBACK_COOLDOWN_MS - 5000)
  assert.equal(cooldownLeftMs(1000, 1000 + FEEDBACK_COOLDOWN_MS), 0)
  assert.equal(cooldownLeftMs(9999, 1000), 0)   // clock went backwards: don't block
})
