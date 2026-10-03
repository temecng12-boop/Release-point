// TODO(Compliance): PLACEHOLDER WORDING. Every word of the guardian consent
// email lives in this file and must be reviewed and replaced by Compliance
// before this ships. Do not add pricing. Keep it covering pitching and hitting.

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export type GuardianConsentEmailInput = {
  guardianName?: string | null
  playerName: string
  coachName: string
  /** One-click sign-up / sign-in link that lands on the consent page. */
  actionUrl: string
  /** The consent page itself, for a parent who signs in another way. */
  consentUrl: string
}

/** TODO(Compliance): placeholder subject line. */
export function guardianConsentSubject(input: Pick<GuardianConsentEmailInput, 'playerName'>): string {
  return `[PLACEHOLDER] Consent needed for ${input.playerName} on Release Point`
}

/** TODO(Compliance): placeholder body. */
export function guardianConsentHtml(input: GuardianConsentEmailInput): string {
  const greeting = input.guardianName ? `Hi ${esc(input.guardianName)},` : 'Hi,'
  return `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <div style="background:#0F1F33;border-radius:12px;padding:24px;margin-bottom:24px;">
          <p style="color:#C8102E;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;margin:0 0 6px">Release Point</p>
          <h1 style="color:white;font-size:22px;margin:0;text-transform:uppercase;">Guardian Consent</h1>
        </div>
        <p style="color:#8096AE;font-size:11px;">[PLACEHOLDER COPY: pending Compliance review]</p>
        <p style="color:#0F1F33;font-size:15px;">${greeting}</p>
        <p style="color:#456080;font-size:14px;line-height:1.6;">
          <strong style="color:#0F1F33">${esc(input.coachName)}</strong> added <strong style="color:#0F1F33">${esc(input.playerName)}</strong>
          to Release Point, where coaches review pitching and hitting video with their players.
          Players under 13 need a parent or guardian's consent before any video can be added.
        </p>
        <p style="color:#456080;font-size:14px;line-height:1.6;">
          Use the button below to sign in (or create your account) and review the consent request.
        </p>
        <a href="${esc(input.actionUrl)}"
           style="display:inline-block;background:#C8102E;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:13px;text-transform:uppercase;letter-spacing:0.1em;margin:16px 0;">
          Review Consent →
        </a>
        <p style="color:#8096AE;font-size:12px;margin-top:8px;">
          This button works once and expires in 24 hours. If it has expired, sign in with this email address at
          <a href="${esc(input.consentUrl)}" style="color:#1C3A5C;">${esc(input.consentUrl)}</a>.
        </p>
        <p style="color:#3D5166;font-size:12px;margin-top:32px;border-top:1px solid #DDE4ED;padding-top:16px;">
          You're receiving this because a coach entered this address as the player's parent or guardian.
          If that's a mistake, you can ignore this email.
        </p>
      </div>
    `
}
