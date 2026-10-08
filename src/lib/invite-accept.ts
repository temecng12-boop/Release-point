// Shared invite-acceptance work for the auth routes (/auth/callback for
// OAuth/code links, /auth/confirm for token_hash invite links).
//
// After the session is established both routes do the same three things:
// link the invited players row (lower(trim(email)) match), tell the coach
// their player joined, and consume a pending coach invite (the player ->
// coach upgrade). Email sending is best-effort and never blocks sign-in.
import type { SupabaseClient } from '@supabase/supabase-js'
import { acceptCoachInvite } from './coach-invite-accept'
import { findUnlinkedPlayerIds } from './invite-gate'
import { sendPlayerJoinedEmail } from './email'
import { RESET_PATH } from './password-reset'

type Db = Pick<SupabaseClient, 'from'>
type AcceptUser = { id: string; email?: string | null }

export type LinkedPlayer = { id: string; full_name: string; coach_id: string | null }

/**
 * Links this auth account to its invited players row (if any), notifies the
 * coach, and consumes a pending coach invite. Link failures are logged, never
 * thrown: the sign-in itself stands, and the next sign-in retries the link.
 */
export async function finishInviteAcceptance(
  db: Db,
  user: AcceptUser,
): Promise<{ linkedPlayers: LinkedPlayer[] }> {
  let linkedPlayers: LinkedPlayer[] = []
  if (user.email) {
    const playerIds = await findUnlinkedPlayerIds(db, user.email)
    if (playerIds.length > 0) {
      try {
        const { data: linked, error: linkError } = await db
          .from('players')
          .update({ user_id: user.id, accepted_at: new Date().toISOString() })
          .in('id', playerIds)
          .is('user_id', null)
          .select('id, full_name, coach_id')
        if (linkError) {
          console.error('[invite-accept] player link failed', { userId: user.id, code: (linkError as { code?: string }).code ?? null })
        } else {
          linkedPlayers = ((linked as LinkedPlayer[] | null) ?? [])
        }
      } catch (err) {
        console.error('[invite-accept] player link failed', { userId: user.id, error: err instanceof Error ? err.message : err })
      }
    }

    for (const player of linkedPlayers) {
      if (player.coach_id) {
        try {
          const { data: coachProfile } = await db
            .from('profiles')
            .select('full_name')
            .eq('id', player.coach_id)
            .single()
          const coachUser = await getUserEmail(db, player.coach_id)
          if (coachUser) {
            await sendPlayerJoinedEmail({
              coachEmail: coachUser,
              coachName: (coachProfile as { full_name?: string } | null)?.full_name ?? 'Coach',
              playerName: player.full_name,
              playerId: player.id,
            })
          }
        } catch { /* email is non-critical */ }
      }
    }

    // Early-access coach invite: mark it used and finish the coach setup
    // (role + Terms). Best-effort: sign-in itself is never blocked.
    try {
      await acceptCoachInvite(db, user)
    } catch (err) {
      console.error('[invite-accept] coach invite accept failed', { userId: user.id, error: err instanceof Error ? err.message : err })
    }
  }
  return { linkedPlayers }
}

async function getUserEmail(db: Db, userId: string): Promise<string | null> {
  const admin = (db as unknown as {
    auth?: { admin?: { getUserById?: (id: string) => Promise<{ data?: { user?: { email?: string } | null } }> } }
  }).auth?.admin
  if (!admin?.getUserById) return null
  try {
    const { data } = await admin.getUserById(userId)
    return data?.user?.email ?? null
  } catch {
    return null
  }
}

/**
 * Where an accepted invite goes next: a newly linked player starts at
 * /onboarding (which funnels through the one-screen age gate); everyone
 * else continues to `next`. Mirrors the callback's long-standing rule.
 */
export function postAcceptRedirect(next: string, linkedCount: number): string {
  if (linkedCount > 0 && next !== RESET_PATH) return '/onboarding'
  return next
}

type AdminDb = Pick<SupabaseClient, 'from'> & {
  auth: { admin: { deleteUser: (userId: string) => Promise<{ data: unknown; error: unknown }> } }
}

/**
 * Removes a stray account that passed no invite check (defense in depth
 * behind the hook): deletes its profile row (auth.users cascades it anyway),
 * deletes the auth user, then signs the session out. Cleanup failures are
 * logged, never thrown -- the caller still redirects to the waitlist.
 */
export async function rejectStrayUser(
  admin: AdminDb,
  signOut: () => Promise<unknown>,
  userId: string,
): Promise<void> {
  try {
    await admin.from('profiles').delete().eq('id', userId)
    await admin.auth.admin.deleteUser(userId)
  } catch (err) {
    console.error('[invite-accept] stray-user cleanup failed', { userId, error: err instanceof Error ? err.message : err })
  }
  await signOut()
}
