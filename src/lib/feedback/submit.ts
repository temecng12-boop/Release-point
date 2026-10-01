// Server side of "Report a problem": validates the submission and inserts the
// row with the signed-in user's own Supabase client (never the service role).
// No .select() after the insert: users can't read reports back (028).
import { appVersion, parseUserAgent, sanitizeContext } from './capture'
import { feedbackErrorKind, feedbackErrorMessage, type ErrLike, type FeedbackErrorKind } from './errors'
import { isUuid, validateMessage, validateScreenshotMeta } from './validate'

export type FeedbackInput = {
  id: unknown
  message: unknown
  context: unknown
  screenshot?: unknown            // { path, mime, bytes } when the upload succeeded
  screenshotFailed?: unknown      // true when the browser tried and failed
}

export type FeedbackResult =
  | { ok: true; id: string; screenshot: 'attached' | 'failed' | 'none' }
  | { ok: false; kind: FeedbackErrorKind; error: string }

type InsertClient = { from(t: 'feedback_reports'): { insert(row: Record<string, unknown>): PromiseLike<{ error: ErrLike }> } }

export async function submitFeedback(
  client: unknown,
  user: { id: string; email?: string | null } | null,
  input: FeedbackInput,
  req: { userAgent: string | null; origin: string | null; env: Record<string, string | undefined> },
): Promise<FeedbackResult> {
  const fail = (kind: FeedbackErrorKind, error = feedbackErrorMessage(kind)): FeedbackResult => ({ ok: false, kind, error })
  if (!user) return fail('signed_out')
  if (!isUuid(input.id)) return fail('invalid', "Couldn't send your report. Please reload the page and try again.")
  const message = validateMessage(input.message)
  if (!message.ok) return fail('invalid', `Couldn't send your report: ${message.error.charAt(0).toLowerCase()}${message.error.slice(1)}`)

  let shot: { path: string; mime: string; bytes: number } | null = null
  let status: 'attached' | 'failed' | 'none' = input.screenshotFailed === true ? 'failed' : 'none'
  if (input.screenshot != null) {
    const m = validateScreenshotMeta(user.id, input.id, input.screenshot)
    if (m.ok) { shot = m.value; status = 'attached' }
    else status = 'failed'   // keep the text report; the screenshot just isn't linked
  }

  const ctx = sanitizeContext(input.context, req.origin)
  const ua = (req.userAgent ?? '').slice(0, 1024)
  const agent = parseUserAgent(ua)
  const row = {
    id: input.id,
    user_id: user.id,
    email: user.email ?? null,          // the database re-stamps email and role (028)
    message: message.value,
    page_url: ctx.pageUrl || null,
    route: ctx.route,
    clip_id: ctx.clipId,
    user_agent: ua || null,
    device: agent.device,
    os: agent.os,
    browser: agent.browser,
    viewport_w: ctx.viewportW,
    viewport_h: ctx.viewportH,
    pixel_ratio: ctx.pixelRatio,
    app_version: appVersion(req.env),
    screenshot_path: shot?.path ?? null,
    screenshot_mime: shot?.mime ?? null,
    screenshot_bytes: shot?.bytes ?? null,
    screenshot_status: status,
  }
  const { error } = await (client as InsertClient).from('feedback_reports').insert(row)
  if (error) {
    const kind = feedbackErrorKind(error)
    console.error('[feedback] insert failed', { userId: user.id, kind, code: error.code, message: error.message })
    return fail(kind)
  }
  return { ok: true, id: input.id, screenshot: status }
}
