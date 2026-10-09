// Server-only: is this signed-in user a platform admin?
// Used by /admin/waitlist (page + approve action). Never trust the client.
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isPlatformAdmin } from '@/lib/platform-admin'

export type PlatformAdminGate =
  | { ok: true; user: { id: string; email?: string | null } }
  | { ok: false; status: 401 | 403; error: string }

export async function requirePlatformAdmin(): Promise<PlatformAdminGate> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (!isPlatformAdmin(
    profile as { is_platform_admin?: boolean | null } | null,
    user.email,
  )) {
    return { ok: false, status: 403, error: 'Forbidden' }
  }
  return { ok: true, user }
}
