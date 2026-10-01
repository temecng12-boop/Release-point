// "Report a problem": limits and validation shared by the form (client) and
// the submitFeedbackReport server action. Pure; tested in
// src/lib/__tests__/feedback-validate.test.ts. Keep in step with 028.

export const FEEDBACK_MESSAGE_MAX = 4000
export const FEEDBACK_SCREENSHOT_MAX_BYTES = 10 * 1024 * 1024
export const FEEDBACK_BUCKET = 'feedback-screenshots'
export const FEEDBACK_COOLDOWN_MS = 30_000

/** Accepted screenshot types and the file extension each is stored under. */
export const SCREENSHOT_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
}
export const SCREENSHOT_ACCEPT = 'image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif'

const EXT_TO_TYPE: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export type Check<T> = { ok: true; value: T } | { ok: false; error: string }

export function validateMessage(value: unknown): Check<string> {
  if (typeof value !== 'string' || value.trim() === '') return { ok: false, error: 'Please describe what happened.' }
  if (value.length > FEEDBACK_MESSAGE_MAX) return { ok: false, error: `Please keep it under ${FEEDBACK_MESSAGE_MAX.toLocaleString('en-US')} characters.` }
  return { ok: true, value: value.trim() }
}

/**
 * The screenshot's real type. Some browsers (iOS for HEIC, some Android
 * pickers) leave File.type empty, so the extension is used then.
 */
export function screenshotType(file: { type?: string | null; name?: string | null }): string | null {
  const t = (file.type ?? '').toLowerCase().split(';')[0].trim()
  if (t && SCREENSHOT_TYPES[t]) return t
  if (t && t !== 'application/octet-stream') return null
  const ext = (file.name ?? '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  return ext ? EXT_TO_TYPE[ext] ?? null : null
}

export function validateScreenshot(file: { type?: string | null; name?: string | null; size: number }): Check<{ mime: string; ext: string; bytes: number }> {
  const mime = screenshotType(file)
  if (!mime) return { ok: false, error: 'Screenshots must be PNG, JPEG, WebP or HEIC images.' }
  if (!Number.isFinite(file.size) || file.size <= 0) return { ok: false, error: 'That screenshot file is empty.' }
  if (file.size > FEEDBACK_SCREENSHOT_MAX_BYTES) return { ok: false, error: 'Screenshots must be 10 MB or smaller.' }
  return { ok: true, value: { mime, ext: SCREENSHOT_TYPES[mime], bytes: file.size } }
}

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v)
}

/** Storage path for a report's screenshot: <uid>/<reportId>.<ext> (028 policy). */
export function screenshotPath(userId: string, reportId: string, ext: string): string {
  return `${userId}/${reportId}.${ext}`
}

/** Server check of the screenshot the browser says it uploaded. */
export function validateScreenshotMeta(userId: string, reportId: string, meta: unknown): Check<{ path: string; mime: string; bytes: number }> {
  const m = meta as { path?: unknown; mime?: unknown; bytes?: unknown } | null
  if (!m || typeof m !== 'object') return { ok: false, error: 'Invalid screenshot.' }
  const mime = typeof m.mime === 'string' ? m.mime : ''
  const ext = SCREENSHOT_TYPES[mime]
  const bytes = typeof m.bytes === 'number' ? m.bytes : NaN
  if (!ext) return { ok: false, error: 'Screenshots must be PNG, JPEG, WebP or HEIC images.' }
  if (!Number.isInteger(bytes) || bytes <= 0 || bytes > FEEDBACK_SCREENSHOT_MAX_BYTES) return { ok: false, error: 'Screenshots must be 10 MB or smaller.' }
  if (m.path !== screenshotPath(userId, reportId, ext)) return { ok: false, error: 'Invalid screenshot.' }
  return { ok: true, value: { path: m.path as string, mime, bytes } }
}

/** Light client-side cooldown after a sent report (the database enforces the real limit). */
export function cooldownLeftMs(lastSentAt: number | null, now: number): number {
  if (lastSentAt == null || !Number.isFinite(lastSentAt) || lastSentAt > now) return 0
  return Math.max(0, FEEDBACK_COOLDOWN_MS - (now - lastSentAt))
}
