// Guardian consent flow, server side (players under 13 only).
//
//   * attachGuardian: the player's own coach (players.coach_id = caller) adds
//     or changes the player's guardian. Reuses this coach's guardians row for
//     the same email, otherwise creates one (created_by = the coach), then sets
//     players.guardian_id. Refused once guardian consent is on file.
//   * sendGuardianInvite: emails the guardian a sign-up / sign-in link that
//     lands on /guardian/consent?player_id=..., at most once per
//     GUARDIAN_INVITE_COOLDOWN_MS per player (players.guardian_invite_sent_at).
//   * resolveGuardianForPlayer / linkGuardianAccount: the consent page and
//     recordConsent. Only the guardian on file for that player qualifies: the
//     guardians row linked to this account (user_id), or, while unlinked, the
//     same verified email.
//
// Authorization happens here; writes go through the service-role client the
// caller passes in. Database error text is logged, never returned.
import type { SupabaseClient } from '@supabase/supabase-js'
import { isPlayersOwnCoach } from './auth/roster-access'
import { isMissingAgeBandColumn } from './consent-server'
import { isValidEmail, maskEmail, normalizeEmail } from './guardian-email'
import { safeRedirectPath } from './safe-redirect'
import type { GuardianConsentEmailInput } from './guardian-consent-email'

type Db = Pick<SupabaseClient, 'from' | 'rpc'>
type Err = { code?: string | null; message?: string | null } | null

export const GUARDIAN_INVITE_COOLDOWN_MS = 10 * 60 * 1000
export const GUARDIAN_ONLY_UNDER_13 = 'A parent or guardian is only needed for players under 13. Set the player\'s age to Under 13 first.'
export const GUARDIAN_NOT_AVAILABLE = 'Adding a guardian isn\'t available yet: a database update still needs to be applied.'
export const CONSENT_ON_FILE_CHANGE_REFUSED =
  'Consent is already on file from this player\'s current guardian, so the guardian can\'t be changed here. Contact support if it needs to change.'
const GUARDIAN_SAVE_FAILED = 'Couldn\'t save the guardian. Please try again.'
const INVITE_FAILED = 'Couldn\'t send the consent email. Please try again.'

const PLAYER_COLUMNS = 'id, full_name, email, coach_id, guardian_id, consent_given_at, age_band, age_confirmed_at, guardian_invite_sent_at'
type PlayerRow = {
  id: string; full_name: string | null; email: string | null; coach_id: string | null; guardian_id: string | null
  consent_given_at: string | null; age_band: string | null; age_confirmed_at: string | null; guardian_invite_sent_at: string | null
}
type GuardianRow = { id: string; email: string; full_name: string | null; user_id: string | null; created_by?: string | null }

function log(context: string, error: Err, extra: Record<string, unknown> = {}) {
  console.error(`[${context}]`, { ...extra, code: error?.code ?? null, message: error?.message ?? null })
}

/** The player, if `coachId` is their own coach. */
async function loadOwnPlayer(db: Db, coachId: string, playerId: string): Promise<{ player: PlayerRow } | { error: string }> {
  if (typeof playerId !== 'string' || !playerId) return { error: 'Invalid player' }
  const { data, error } = await db.from('players').select(PLAYER_COLUMNS).eq('id', playerId).maybeSingle()
  if (isMissingAgeBandColumn(error)) return { error: GUARDIAN_NOT_AVAILABLE }
  if (error) { log('guardian.loadPlayer', error, { playerId }); return { error: GUARDIAN_SAVE_FAILED } }
  const player = data as PlayerRow | null
  if (!player || !isPlayersOwnCoach(coachId, player)) return { error: 'Not authorized' }
  return { player }
}

function isUnder13Row(p: PlayerRow) {
  return p.age_band === 'under_13' && !!p.age_confirmed_at
}

export type AttachResult = { success: true; guardianId: string; changed: boolean } | { error: string }

export async function attachGuardian(
  db: Db,
  coachId: string,
  playerId: string,
  input: { full_name?: unknown; email?: unknown },
): Promise<AttachResult> {
  const email = normalizeEmail(input?.email)
  const fullName = typeof input?.full_name === 'string' ? input.full_name.trim().slice(0, 120) : ''
  if (!email || !isValidEmail(email)) return { error: 'Enter a valid email address for the parent or guardian.' }

  const loaded = await loadOwnPlayer(db, coachId, playerId)
  if ('error' in loaded) return loaded
  const { player } = loaded
  if (!isUnder13Row(player)) return { error: GUARDIAN_ONLY_UNDER_13 }
  if (player.email && normalizeEmail(player.email) === email) {
    return { error: 'Use the parent or guardian\'s own email, not the player\'s.' }
  }

  if (player.guardian_id) {
    const { data: current, error } = await db.from('guardians').select('id, email').eq('id', player.guardian_id).maybeSingle()
    if (error) { log('attachGuardian.current', error, { playerId }); return { error: GUARDIAN_SAVE_FAILED } }
    if (current && normalizeEmail((current as GuardianRow).email) === email) {
      return { success: true, guardianId: (current as GuardianRow).id, changed: false }
    }
    // Consent came from the guardian on file; never keep it under someone else.
    if (player.consent_given_at) return { error: CONSENT_ON_FILE_CHANGE_REFUSED }
  }

  // Reuse this coach's guardians row for the same email; otherwise create one.
  const { data: existing, error: findError } = await db
    .from('guardians').select('id').eq('created_by', coachId).eq('email', email).limit(1)
  if (findError) { log('attachGuardian.find', findError, { playerId }); return { error: GUARDIAN_SAVE_FAILED } }
  let guardianId = (existing as { id: string }[] | null)?.[0]?.id ?? null
  if (!guardianId) {
    const { data: created, error: insertError } = await db
      .from('guardians')
      .insert({ email, full_name: fullName || null, created_by: coachId })
      .select('id')
      .single()
    if (insertError || !created) { log('attachGuardian.insert', insertError, { playerId }); return { error: GUARDIAN_SAVE_FAILED } }
    guardianId = (created as { id: string }).id
  }

  // A new guardian can be emailed right away (the cooldown is per guardian on file).
  let link = db.from('players')
    .update({ guardian_id: guardianId, guardian_invite_sent_at: null })
    .eq('id', playerId)
    .eq('coach_id', coachId)
    .is('consent_given_at', null)
  link = player.guardian_id ? link.eq('guardian_id', player.guardian_id) : link.is('guardian_id', null)
  const { data: updated, error: linkError } = await link.select('id')
  if (linkError || !Array.isArray(updated) || updated.length !== 1) {
    log('attachGuardian.link', linkError ?? { message: 'no row updated' }, { playerId })
    return { error: GUARDIAN_SAVE_FAILED }
  }
  return { success: true, guardianId, changed: true }
}

export type InviteDeps = {
  db: Db
  /** supabaseAdmin.auth.admin.generateLink */
  generateLink: (args: { type: 'invite' | 'magiclink'; email: string; options: { data?: Record<string, unknown>; redirectTo: string } }) =>
    Promise<{ data: { properties?: { action_link?: string } | null } | null; error: Err }>
  sendEmail: (args: GuardianConsentEmailInput & { toEmail: string }) => Promise<{ error?: string }>
  siteUrl: string
  coachName: string
  now?: () => Date
}

export type InviteResult = { success: string } | { error: string; rateLimited?: boolean }

export function consentPath(playerId: string): string {
  return safeRedirectPath(`/guardian/consent?player_id=${encodeURIComponent(playerId)}`, '/guardian')
}

/** Minutes left (rounded up) before another email may go out, or 0. */
export function cooldownMinutesLeft(sentAt: string | null | undefined, now: Date): number {
  if (!sentAt) return 0
  const t = Date.parse(sentAt)
  if (Number.isNaN(t)) return 0
  const left = t + GUARDIAN_INVITE_COOLDOWN_MS - now.getTime()
  return left > 0 ? Math.ceil(left / 60000) : 0
}

export async function sendGuardianInvite(deps: InviteDeps, coachId: string, playerId: string): Promise<InviteResult> {
  const { db } = deps
  const now = (deps.now ?? (() => new Date()))()
  const loaded = await loadOwnPlayer(db, coachId, playerId)
  if ('error' in loaded) return loaded
  const { player } = loaded
  if (!isUnder13Row(player)) return { error: GUARDIAN_ONLY_UNDER_13 }
  if (!player.guardian_id) return { error: 'Add the parent or guardian\'s email first.' }
  if (player.consent_given_at) return { error: 'Guardian consent is already on file for this player.' }

  const { data: g, error: gError } = await db.from('guardians').select('id, email, full_name').eq('id', player.guardian_id).maybeSingle()
  if (gError || !g) { log('sendGuardianInvite.guardian', gError ?? { message: 'guardian not found' }, { playerId }); return { error: INVITE_FAILED } }
  const guardian = g as GuardianRow

  const minutes = cooldownMinutesLeft(player.guardian_invite_sent_at, now)
  if (minutes > 0) {
    return { error: `A consent email was sent less than 10 minutes ago. You can resend it in ${minutes} minute${minutes === 1 ? '' : 's'}.`, rateLimited: true }
  }

  // Claim the send slot: only if guardian_invite_sent_at is still what we read
  // (two quick clicks can't both send).
  const stamp = now.toISOString()
  let claim = db.from('players').update({ guardian_invite_sent_at: stamp }).eq('id', playerId).eq('coach_id', coachId)
    .eq('guardian_id', guardian.id)
  claim = player.guardian_invite_sent_at ? claim.eq('guardian_invite_sent_at', player.guardian_invite_sent_at) : claim.is('guardian_invite_sent_at', null)
  const { data: claimed, error: claimError } = await claim.select('id')
  if (claimError) { log('sendGuardianInvite.claim', claimError, { playerId }); return { error: INVITE_FAILED } }
  if (!Array.isArray(claimed) || claimed.length !== 1) {
    return { error: 'A consent email was just sent. You can resend it in 10 minutes.', rateLimited: true }
  }
  // Give the slot back if nothing went out, so the coach can retry now.
  const release = async () => {
    const { error } = await db.from('players').update({ guardian_invite_sent_at: player.guardian_invite_sent_at })
      .eq('id', playerId).eq('guardian_invite_sent_at', stamp)
    if (error) log('sendGuardianInvite.release', error, { playerId })
  }

  const site = new URL(deps.siteUrl).origin
  const path = consentPath(playerId)
  const redirectTo = `${site}/auth/confirm?next=${encodeURIComponent(path)}`
  const options = { data: { role: 'guardian', full_name: guardian.full_name ?? '' }, redirectTo }
  let { data: link, error: linkError } = await deps.generateLink({ type: 'invite', email: guardian.email, options })
  // An existing account gets a sign-in link instead of a sign-up link.
  if (linkError && (linkError.code === 'email_exists' || (linkError.message ?? '').toLowerCase().includes('already'))) {
    ({ data: link, error: linkError } = await deps.generateLink({ type: 'magiclink', email: guardian.email, options: { redirectTo } }))
  }
  const actionUrl = link?.properties?.action_link
  if (linkError || !actionUrl) {
    log('sendGuardianInvite.link', linkError ?? { message: 'no action link' }, { playerId })
    await release()
    return { error: INVITE_FAILED }
  }

  let sent: { error?: string }
  try {
    sent = await deps.sendEmail({
      toEmail: guardian.email,
      guardianName: guardian.full_name,
      playerName: player.full_name || 'your player',
      coachName: deps.coachName,
      actionUrl,
      consentUrl: `${site}${path}`,
    })
  } catch (e) {
    sent = { error: e instanceof Error ? e.message : 'unknown error' }
  }
  if (sent.error) {
    log('sendGuardianInvite.send', { message: sent.error }, { playerId, to: maskEmail(guardian.email) })
    await release()
    return { error: `Couldn't send the consent email to ${guardian.email}. Please try again.` }
  }
  return { success: `Consent email sent to ${guardian.email}.` }
}

// ── Consent page and recordConsent ──────────────────────────────────────────

export type ConsentUser = { id: string; email?: string | null; email_confirmed_at?: string | null }
export type GuardianMatch =
  | { ok: true; guardian: GuardianRow; player: { id: string; full_name: string | null; age_group: string | null } }
  | { ok: false; reason: 'not_found' | 'not_guardian' | 'failed' }

/**
 * True if this account is the guardian on file: linked by user_id, or (while
 * the guardians row is unlinked) the same verified email.
 */
export function isGuardianAccount(guardian: Pick<GuardianRow, 'email' | 'user_id'>, user: ConsentUser): boolean {
  if (guardian.user_id) return guardian.user_id === user.id
  return !!user.email && !!user.email_confirmed_at && normalizeEmail(guardian.email) === normalizeEmail(user.email)
}

export async function resolveGuardianForPlayer(db: Db, user: ConsentUser, playerId: string): Promise<GuardianMatch> {
  if (typeof playerId !== 'string' || !playerId) return { ok: false, reason: 'not_found' }
  const { data: p, error } = await db.from('players').select('id, full_name, age_group, guardian_id').eq('id', playerId).maybeSingle()
  if (error) { log('resolveGuardian.player', error, { playerId }); return { ok: false, reason: 'failed' } }
  const player = p as { id: string; full_name: string | null; age_group: string | null; guardian_id: string | null } | null
  if (!player) return { ok: false, reason: 'not_found' }
  if (!player.guardian_id) return { ok: false, reason: 'not_guardian' }
  const { data: g, error: gError } = await db.from('guardians').select('id, email, full_name, user_id').eq('id', player.guardian_id).maybeSingle()
  if (gError) { log('resolveGuardian.guardian', gError, { playerId }); return { ok: false, reason: 'failed' } }
  const guardian = g as GuardianRow | null
  if (!guardian || !isGuardianAccount(guardian, user)) return { ok: false, reason: 'not_guardian' }
  return { ok: true, guardian, player: { id: player.id, full_name: player.full_name, age_group: player.age_group } }
}

/**
 * Links the account to the guardians row (when unlinked), makes sure a profile
 * exists, and lets migration 029 turn an empty 'player' profile into
 * 'guardian'. Real players, coaches and anyone with data keep their role.
 * Idempotent. Returns false (after logging) if a step failed.
 */
export async function linkGuardianAccount(db: Db, user: ConsentUser, guardian: GuardianRow): Promise<boolean> {
  if (!guardian.user_id) {
    const { error } = await db.from('guardians').update({ user_id: user.id }).eq('id', guardian.id).is('user_id', null)
    // 23505: this account is already linked to another guardians row (another
    // coach's). Consent still works through the verified email match.
    if (error && error.code !== '23505') { log('linkGuardianAccount.link', error); return false }
  }
  // Insert-only: an existing profile's role and name are never overwritten.
  const { error: profileError } = await db
    .from('profiles')
    .upsert({ id: user.id, full_name: guardian.full_name ?? user.email ?? '', role: 'guardian' }, { onConflict: 'id', ignoreDuplicates: true })
  if (profileError) { log('linkGuardianAccount.profile', profileError); return false }
  const { error: roleError } = await db.rpc('promote_empty_player_to_guardian', { p_user_id: user.id })
  if (roleError) { log('linkGuardianAccount.role', roleError); return false }
  return true
}
