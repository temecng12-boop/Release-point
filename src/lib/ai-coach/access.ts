// Shared access check for paid AI routes (/api/ai-chat, /api/analyze-clip).
//
// Same rules as the AI Coach chat route: signed-in caller, age-screen gate
// (coaches pass), then clip access (player, direct coach, or team coach —
// not guardians). Analyze-clip also requires video consent because still
// frames are sent to the model.
import { supabaseAdmin } from '@/lib/supabase/admin'
import { checkAiChatGate } from '@/lib/ai-chat-gate'
import { canViewPlayerContent } from '@/lib/clip-access'
import { loadClipContext, type LoadedClipContext } from '@/lib/ai-coach/clip-context'
import { checkUploadConsent } from '@/lib/consent-server'

export type AiCoachClipAccess =
  | { ok: true; context: LoadedClipContext }
  | { ok: false; status: 403 | 404 | 500; error: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function requireAiCoachClipAccess(
  userId: string,
  clipId: unknown,
  opts: { requireVideoConsent?: boolean; denyUnknownAs?: 403 | 404 } = {},
): Promise<AiCoachClipAccess> {
  const gate = await checkAiChatGate(supabaseAdmin, userId)
  if (!gate.ok) return { ok: false, status: gate.status, error: gate.error }

  if (typeof clipId !== 'string' || !UUID_RE.test(clipId)) {
    return { ok: false, status: 404, error: 'Clip not found' }
  }

  const { data: clip, error: clipError } = await supabaseAdmin
    .from('clips')
    .select('player_id')
    .eq('id', clipId)
    .maybeSingle()
  if (clipError) {
    console.error('[ai-coach-access] clip lookup failed', clipId, clipError)
    return { ok: false, status: 500, error: 'Could not load this clip.' }
  }
  if (!clip?.player_id) return { ok: false, status: 404, error: 'Clip not found' }

  const access = await canViewPlayerContent(supabaseAdmin, userId, clip.player_id)
  if (!access.allowed || access.via === 'guardian') {
    return { ok: false, status: opts.denyUnknownAs ?? 403, error: 'You don\'t have access to this clip.' }
  }

  if (opts.requireVideoConsent) {
    const consent = await checkUploadConsent(supabaseAdmin, clip.player_id)
    if (!consent.ok) return { ok: false, status: 403, error: consent.error }
  }

  const loaded = await loadClipContext(userId, clipId)
  if (!loaded.ok) return { ok: false, status: loaded.status, error: loaded.message }
  return { ok: true, context: loaded.context }
}
