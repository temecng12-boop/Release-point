import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Check whether a user is within their rate limit for a given route.
 * Logs the call if allowed.
 *
 * Returns { allowed: true } or { allowed: false, retryAfterSecs }.
 */
export async function checkRateLimit(
  userId: string,
  route: string,
  maxCalls: number,
  windowSecs: number,
): Promise<{ allowed: boolean; retryAfterSecs?: number }> {
  const windowStart = new Date(Date.now() - windowSecs * 1000).toISOString()

  const { count, error } = await supabaseAdmin
    .from('rate_limit_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('route', route)
    .gte('created_at', windowStart)

  if (error) {
    // If the table doesn't exist yet, fail open so the app keeps working
    console.error('[rate-limit] DB error — failing open:', error.message)
    return { allowed: true }
  }

  if ((count ?? 0) >= maxCalls) {
    return { allowed: false, retryAfterSecs: windowSecs }
  }

  // Log this call (fire-and-forget — don't block the response)
  supabaseAdmin
    .from('rate_limit_log')
    .insert({ user_id: userId, route })
    .then(({ error: e }) => {
      if (e) console.error('[rate-limit] insert error:', e.message)
    })

  return { allowed: true }
}
