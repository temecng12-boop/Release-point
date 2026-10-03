// Maps database / storage errors from a report submission to a friendly
// message. Never silent: every failure gets "Couldn't send your report" plus
// what to do. Tested in feedback-errors.test.ts.

export type FeedbackErrorKind = 'rate_limited' | 'not_set_up' | 'signed_out' | 'too_large' | 'bad_type' | 'invalid' | 'network' | 'unknown'

export type ErrLike = { code?: string | null; message?: string | null; status?: number | string | null; statusCode?: number | string | null; error?: string | null } | null | undefined

export function feedbackErrorKind(e: ErrLike): FeedbackErrorKind {
  if (!e) return 'unknown'
  const code = String(e.code ?? '')
  const msg = `${e.message ?? ''} ${e.error ?? ''}`.toLowerCase()
  const status = Number(e.status ?? e.statusCode ?? NaN)
  if (code === 'RP429' || msg.includes('feedback_rate_limited')) return 'rate_limited'
  // Table or bucket missing (028 not applied): Postgres, PostgREST and Storage codes.
  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST204' || /relation .*feedback_reports.* does not exist|could not find the table|bucket not found/.test(msg)) return 'not_set_up'
  if (code === '23514' && /feedback_reports_message_len/.test(msg)) return 'invalid'
  if (status === 413 || /maximum allowed size|payload too large|too large/.test(msg)) return 'too_large'
  if (/mime type .* is not supported|invalid_mime_type|not supported/.test(msg)) return 'bad_type'
  if (code === 'PGRST301' || code === 'PGRST302' || status === 401 || /jwt|not authenticated|session/.test(msg)) return 'signed_out'
  if (/failed to fetch|network|load failed|fetch failed/.test(msg)) return 'network'
  return 'unknown'
}

const MESSAGES: Record<FeedbackErrorKind, string> = {
  rate_limited: "Couldn't send your report: you've sent several in a short time. Please wait a few minutes and try again.",
  not_set_up: "Couldn't send your report: reporting isn't set up yet on our side. Please try again later or email support.",
  signed_out: "Couldn't send your report: your session has expired. Please sign in again and retry.",
  too_large: "Couldn't send your report: the screenshot is larger than 10 MB.",
  bad_type: "Couldn't send your report: screenshots must be PNG, JPEG, WebP or HEIC images.",
  invalid: "Couldn't send your report: please describe what happened (up to 4,000 characters).",
  network: "Couldn't send your report: check your connection and try again.",
  unknown: "Couldn't send your report. Please try again in a moment.",
}

export function feedbackErrorMessage(kind: FeedbackErrorKind): string {
  return MESSAGES[kind]
}

/** Short reason a screenshot didn't attach (the text report still goes out). */
export function screenshotFailureNote(e: ErrLike): string {
  const kind = feedbackErrorKind(e)
  if (kind === 'too_large') return 'the file is larger than 10 MB'
  if (kind === 'bad_type') return 'the file type isn’t supported'
  if (kind === 'rate_limited' || /row-level security|unauthorized|403/.test(`${e?.message ?? ''} ${e?.statusCode ?? ''}`.toLowerCase())) return 'too many uploads in a short time, or the upload wasn’t allowed'
  if (kind === 'not_set_up') return 'screenshot storage isn’t set up yet'
  if (kind === 'network') return 'the connection dropped during upload'
  return 'the upload failed'
}
