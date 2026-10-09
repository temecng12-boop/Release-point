// Server-only loader for /admin/waitlist. The waitlist table is never
// queried unless requirePlatformAdmin passes.
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requirePlatformAdmin, type PlatformAdminGate } from '@/lib/platform-admin-server'

export type WaitlistEntry = {
  id: string
  email: string
  name: string | null
  role: string | null
  program_name: string | null
  athlete_count: string | null
  referral: string | null
  created_at: string
  approved_at: string | null
  invite_sent_at: string | null
}

export type AdminWaitlistPage =
  | Extract<PlatformAdminGate, { ok: false }>
  | { ok: true; entries: WaitlistEntry[] }

export async function loadAdminWaitlistPage(): Promise<AdminWaitlistPage> {
  const gate = await requirePlatformAdmin()
  if (!gate.ok) return gate

  const { data: entries } = await supabaseAdmin
    .from('waitlist')
    .select('id, email, name, role, program_name, athlete_count, referral, created_at, approved_at, invite_sent_at')
    .order('created_at', { ascending: false })

  return { ok: true, entries: (entries ?? []) as WaitlistEntry[] }
}
