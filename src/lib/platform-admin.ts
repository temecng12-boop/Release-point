// Platform admins (founder/staff): the only accounts that may send
// early-access coach invites. Public /auth/signup stays a waitlist holding
// page; coaches join through an admin-sent invite (coach_invites, 041).
//
// Pure helpers (no Supabase I/O) so the invite action can be unit tested.

/** The founder's access never depends on this list (the DB flag does), but an
 *  env allowlist covers the window before migration 041 is applied. */
export function platformAdminEmails(value: string | undefined = process.env.PLATFORM_ADMIN_EMAILS): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

/** Trimmed + lowercased, the way coach_invites stores and matches emails. */
export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isValidInviteEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

type ProfileLike = { is_platform_admin?: boolean | null } | null | undefined

/**
 * True when the DB flag (migration 041) or the env allowlist grants access.
 * The allowlist takes the raw email because callers may pass an
 * un-normalized address; the flag comes from the caller's own profile row.
 */
export function isPlatformAdmin(
  profile: ProfileLike,
  email: string | null | undefined,
  allowlist: string[] = platformAdminEmails(),
): boolean {
  if (profile?.is_platform_admin === true) return true
  const normalized = (email ?? '').trim().toLowerCase()
  return normalized !== '' && allowlist.includes(normalized)
}
