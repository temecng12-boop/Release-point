// Accept-link builder for invite emails (coach + player invites).
//
// Supabase's generateLink returns an `action_link` in the IMPLICIT flow
// (.../auth/callback#access_token=...): the tokens sit in the URL fragment,
// which a server route never sees, so the invitee would land NOT signed in.
// Instead we build the email link ourselves from `properties.hashed_token`
// (present on every generateLink response) and point it at our server-side
// /auth/confirm route, which verifies with verifyOtp (PKCE-style,
// cookies set server-side) and then runs the invite + age gates.
const PRODUCTION_SITE_URL = 'https://releasepointai.com'

function siteBase(siteUrl: string | undefined): string {
  return (siteUrl || PRODUCTION_SITE_URL).replace(/\/$/, '')
}

/**
 * The link emailed for an invite: /auth/confirm?token_hash=…&type=invite&next=….
 * `next` is the post-accept landing page (players funnel through /onboarding
 * to the age screen; coaches go to /dashboard). Never the raw action_link.
 */
export function buildInviteAcceptUrl(
  siteUrl: string | undefined,
  hashedToken: string,
  next: string,
): string {
  const url = new URL('/auth/confirm', siteBase(siteUrl))
  url.searchParams.set('token_hash', hashedToken)
  url.searchParams.set('type', 'invite')
  url.searchParams.set('next', next)
  return url.toString()
}
