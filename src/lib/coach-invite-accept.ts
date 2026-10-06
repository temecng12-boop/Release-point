// Consumes an early-access coach invite when the invited coach signs in
// (auth/callback). Server-only: takes the service-role client.
//
// The invite flow (app/actions/coach-invites.ts) creates the auth user with
// role 'coach' metadata, so the profile trigger already makes them a coach.
// This is the safety net for the ways that doesn't happen:
//   * the coach signs in with Google/Apple (same email) instead of the link,
//     so their profile was created as a player;
//   * ops created the auth user by hand and the admin invited the email.
//
// A profile is only ever upgraded player -> coach when the account has no
// footprint yet (no players/guardians rows, no teams, no staff rows): an
// established player or parent account is never re-roled by an invite.
// Anything unexpected is logged for ops; sign-in itself is never blocked.
import type { SupabaseClient } from '@supabase/supabase-js'
import { recordTermsAcceptance } from './terms-acceptance'
import { TERMS_VERSION } from './terms-version'

type Db = Pick<SupabaseClient, 'from'>

const MISSING_TABLE = new Set(['42P01', 'PGRST205'])

export type AcceptOutcome = 'accepted' | 'already' | 'none'

function missingTableCode(code: string | null | undefined): boolean {
  return !!code && MISSING_TABLE.has(code)
}

async function hasFootprint(db: Db, userId: string): Promise<boolean> {
  const checks = [
    db.from('players').select('id').eq('user_id', userId).limit(1),
    db.from('guardians').select('id').eq('user_id', userId).limit(1),
    db.from('teams').select('id').eq('coach_id', userId).limit(1),
    db.from('team_coaches').select('team_id').eq('coach_id', userId).limit(1),
  ]
  const results = await Promise.all(checks)
  for (const r of results) {
    if (r.error) {
      // A missing table (older DB) means no footprint there; anything else
      // fails closed: don't touch the role.
      if (!missingTableCode(r.error.code)) return true
      continue
    }
    const rows = r.data as unknown[] | null
    if (rows && rows.length > 0) return true
  }
  return false
}

export async function acceptCoachInvite(
  db: Db,
  user: { id: string; email?: string | null },
): Promise<AcceptOutcome> {
  const email = (user.email ?? '').trim().toLowerCase()
  if (!email) return 'none'

  const { data: invite, error: inviteError } = await db
    .from('coach_invites')
    .select('id, accepted_at')
    .eq('email', email)
    .maybeSingle()
  if (inviteError) {
    if (missingTableCode(inviteError.code)) return 'none'
    console.error('[acceptCoachInvite] invite lookup failed', { userId: user.id, code: inviteError.code, message: inviteError.message })
    return 'none'
  }
  const row = invite as { id: string; accepted_at?: string | null } | null
  if (!row) return 'none'
  if (row.accepted_at) return 'already'

  const now = new Date().toISOString()
  const { error: markError } = await db.from('coach_invites').update({ accepted_at: now }).eq('id', row.id)
  if (markError) console.error('[acceptCoachInvite] invite mark failed', { userId: user.id, code: markError.code, message: markError.message })

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError) {
    console.error('[acceptCoachInvite] profile lookup failed', { userId: user.id, code: profileError.code, message: profileError.message })
  } else if (!profile) {
    const { error: insertError } = await db.from('profiles').insert({ id: user.id, full_name: '', role: 'coach' })
    if (insertError) console.error('[acceptCoachInvite] coach profile insert failed', { userId: user.id, code: insertError.code, message: insertError.message })
  } else if ((profile as { role?: string }).role !== 'coach') {
    if (await hasFootprint(db, user.id)) {
      console.error('[acceptCoachInvite] invite held by an established non-coach account; role left alone', { userId: user.id })
    } else {
      const { error: roleError } = await db.from('profiles').update({ role: 'coach' }).eq('id', user.id)
      if (roleError) console.error('[acceptCoachInvite] coach role update failed', { userId: user.id, code: roleError.code, message: roleError.message })
    }
  }

  // The invite email states that accepting agrees to the Terms.
  if (!(await recordTermsAcceptance(db, user.id, now, TERMS_VERSION))) {
    console.error('[acceptCoachInvite] terms acceptance not stored', { userId: user.id })
  }
  return 'accepted'
}
