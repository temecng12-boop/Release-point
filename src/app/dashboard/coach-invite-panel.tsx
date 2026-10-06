import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isMissingColumnError } from '@/lib/db-errors'
import { isPlatformAdmin } from '@/lib/platform-admin'
import CoachInviteForm from './coach-invite-form'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export type CoachInviteRow = {
  id: string
  email: string
  created_at: string
  accepted_at: string | null
}

/** Platform-admin-only panel. Returns null for everyone else (the server
 *  action enforces this too, so hiding the UI is just courtesy). */
export default async function CoachInvitePanel() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .maybeSingle()
  if (!isPlatformAdmin(
    profile as { is_platform_admin?: boolean | null } | null,
    user.email,
  )) return null

  let invites: CoachInviteRow[] = []
  const { data, error } = await supabaseAdmin
    .from('coach_invites')
    .select('id, email, created_at, accepted_at')
    .order('created_at', { ascending: false })
    .limit(20)
  if (!error) {
    invites = (data ?? []) as CoachInviteRow[]
  } else if (!isMissingColumnError(error, 'coach_invites') && error.code !== '42P01' && error.code !== 'PGRST205') {
    console.error('[CoachInvitePanel] invites read failed', { code: error.code, message: error.message })
  }

  return (
    <div className="bg-white rounded-xl border border-[#DDE4ED] shadow-sm overflow-hidden">
      <div className="h-1 bg-[#1C3A5C]" />
      <div className="p-5">
        <p className="text-[10px] tracking-[0.3em] text-[#1C3A5C] mb-1" style={oswald}>Early Access · Platform Admin</p>
        <p className="text-xs text-[#456080] mb-4 leading-relaxed">
          Invite a coach by email. They get their own coach account and organization — nothing of yours is shared.
        </p>
        <CoachInviteForm />
        {invites.length > 0 && (
          <div className="mt-5 pt-4" style={{ borderTop: '1px solid #f1f5f9' }}>
            <p className="text-[10px] tracking-[0.25em] text-[#8096AE] mb-2" style={oswald}>Recent Invites</p>
            <ul className="space-y-1.5">
              {invites.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-[#0F1F33] truncate">{inv.email}</span>
                  <span
                    className="shrink-0 px-2 py-0.5 rounded"
                    style={inv.accepted_at
                      ? { ...oswald, background: 'rgba(22,163,74,0.08)', color: '#15803d', border: '1px solid rgba(22,163,74,0.2)' }
                      : { ...oswald, background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }}
                  >
                    {inv.accepted_at ? 'Accepted' : 'Sent'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
