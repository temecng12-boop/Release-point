// Calling a server action from the UI: only change the screen after the
// server confirmed the change. A returned { error } and a request that never
// reached the server (thrown) both come back as { ok: false, error }, so the
// caller can keep what is on screen and show the message.

// Any action result; { error } and { warning } are read when present.
export type ActionOutcome = object | null | undefined | void

export const CONNECTION_ERROR = 'Couldn\'t reach the server. Check your connection and try again.'

/** Next.js delivers redirect()/notFound() as a thrown signal; let it through. */
export function isNextNavigationSignal(e: unknown): boolean {
  if (!e || typeof e !== 'object' || !('digest' in e)) return false
  const digest = String((e as { digest?: unknown }).digest)
  return digest.startsWith('NEXT_REDIRECT') || digest.startsWith('NEXT_HTTP_ERROR_FALLBACK') || digest === 'NEXT_NOT_FOUND'
}

export type CheckedResult<T> = { ok: true; value: T; warning: string | null } | { ok: false; error: string }

export async function runAction<T extends ActionOutcome>(call: () => Promise<T>): Promise<CheckedResult<T>> {
  let value: T
  try {
    value = await call()
  } catch (e) {
    if (isNextNavigationSignal(e)) throw e
    console.error('[runAction] request failed', e)
    return { ok: false, error: CONNECTION_ERROR }
  }
  if (value && typeof value === 'object' && 'error' in value && value.error) {
    return { ok: false, error: typeof value.error === 'string' ? value.error : 'Something went wrong. Please try again.' }
  }
  const warning = value && typeof value === 'object' && 'warning' in value && typeof value.warning === 'string' && value.warning
    ? value.warning
    : null
  return { ok: true, value, warning }
}
