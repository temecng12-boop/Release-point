import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
// Verified production sender. Resend only sends from verified domains, so
// this must stay on releasepointai.com (verified in Resend) — an unverified
// domain fails every send with "domain not verified".
const FROM = 'Release Point AI <notifications@releasepointai.com>'
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://releasepointai.com'

// TODO(Compliance): guardian email wording. The coach may enter a guardian's
// address for players under 18; this copy is written to the player.
export async function sendPlayerInviteEmail({
  toEmail,
  playerName,
  coachName,
  inviteUrl,
}: {
  toEmail: string
  playerName?: string
  coachName: string
  inviteUrl: string
}): Promise<{ error?: string }> {
  // The caller reports a failure instead of saying an email is on its way.
  if (!resend) return { error: 'Email sending is not set up' }
  const greeting = playerName ? `Hey ${playerName},` : 'Hey,'
  const { error } = await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `${coachName} invited you to Release Point AI`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <div style="background:#0F1F33;border-radius:12px;padding:24px;margin-bottom:24px;">
          <p style="color:#C8102E;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;margin:0 0 6px">Release Point AI</p>
          <h1 style="color:white;font-size:22px;margin:0;text-transform:uppercase;">You're Invited</h1>
        </div>
        <p style="color:#0F1F33;font-size:15px;">${greeting}</p>
        <p style="color:#456080;font-size:14px;line-height:1.6;">
          <strong style="color:#0F1F33">${coachName}</strong> invited you to join Release Point AI, a professional-grade film room built for baseball.
        </p>
        <p style="color:#456080;font-size:14px;line-height:1.6;">
          Click below to set up your account and access your clips, annotations, and pitch or swing data.
        </p>
        <a href="${inviteUrl}"
           style="display:inline-block;background:#C8102E;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:13px;text-transform:uppercase;letter-spacing:0.1em;margin:16px 0;">
          Accept Invite →
        </a>
        <p style="color:#8096AE;font-size:12px;margin-top:8px;">This link expires in 24 hours.</p>
        <p style="color:#3D5166;font-size:12px;margin-top:32px;border-top:1px solid #DDE4ED;padding-top:16px;">
          Release Point AI · Built for coaches and players.
        </p>
      </div>
    `,
  })
  return error ? { error: error.message } : {}
}

export async function sendCoachInviteEmail({
  toEmail,
  coachName,
  inviterName,
  inviteUrl,
}: {
  toEmail: string
  coachName?: string
  inviterName: string
  inviteUrl: string
}): Promise<{ error?: string }> {
  // The caller reports a failure instead of saying an email is on its way.
  if (!resend) return { error: 'Email sending is not set up' }
  const greeting = coachName ? `Hey ${coachName},` : 'Hey,'
  const { error } = await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `${inviterName} invited you to coach on Release Point AI`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <div style="background:#0F1F33;border-radius:12px;padding:24px;margin-bottom:24px;">
          <p style="color:#C8102E;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;margin:0 0 6px">Release Point AI</p>
          <h1 style="color:white;font-size:22px;margin:0;text-transform:uppercase;">Coach Early Access</h1>
        </div>
        <p style="color:#0F1F33;font-size:15px;">${greeting}</p>
        <p style="color:#456080;font-size:14px;line-height:1.6;">
          <strong style="color:#0F1F33">${inviterName}</strong> invited you to coach on Release Point AI, a professional-grade film room built for baseball.
        </p>
        <p style="color:#456080;font-size:14px;line-height:1.6;">
          Accepting creates your own coach account and organization: your teams, your roster, your clips. Nothing is shared with anyone else's account.
        </p>
        <a href="${inviteUrl}"
           style="display:inline-block;background:#C8102E;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:13px;text-transform:uppercase;letter-spacing:0.1em;margin:16px 0;">
          Accept Invite →
        </a>
        <p style="color:#8096AE;font-size:12px;margin-top:8px;">This link expires in 24 hours. After you accept, you can set a password anytime from Sign in → Forgot password, or keep signing in with an email link.</p>
        <p style="color:#3D5166;font-size:12px;margin-top:32px;border-top:1px solid #DDE4ED;padding-top:16px;">
          By accepting this invite you agree to the <a href="${SITE}/terms" style="color:#1C3A5C;">Terms of Service</a> and <a href="${SITE}/privacy" style="color:#1C3A5C;">Privacy Policy</a>.<br />
          Release Point AI · Built for coaches and players.
        </p>
      </div>
    `,
  })
  return error ? { error: error.message } : {}
}

export async function sendAssistantCoachInviteEmail({
  toEmail,
  coachName,
  inviterName,
  teamName,
  inviteUrl,
}: {
  toEmail: string
  coachName?: string
  inviterName: string
  teamName: string
  inviteUrl: string
}): Promise<{ error?: string }> {
  if (!resend) return { error: 'Email sending is not set up' }
  const greeting = coachName ? `Hey ${coachName},` : 'Hey,'
  const { error } = await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `${inviterName} invited you to coach ${teamName} on Release Point AI`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <div style="background:#0F1F33;border-radius:12px;padding:24px;margin-bottom:24px;">
          <p style="color:#C8102E;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;margin:0 0 6px">Release Point AI</p>
          <h1 style="color:white;font-size:22px;margin:0;text-transform:uppercase;">Assistant Coach Invite</h1>
        </div>
        <p style="color:#0F1F33;font-size:15px;">${greeting}</p>
        <p style="color:#456080;font-size:14px;line-height:1.6;">
          <strong style="color:#0F1F33">${inviterName}</strong> has invited you to join <strong style="color:#0F1F33">${teamName}</strong> as an assistant coach on Release Point AI — a professional-grade film room built for baseball.
        </p>
        <p style="color:#456080;font-size:14px;line-height:1.6;">
          As an assistant coach you can view all player clips, add annotations, leave voice notes, and track player metrics for everyone on the team.
        </p>
        <a href="${inviteUrl}"
           style="display:inline-block;background:#C8102E;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:13px;text-transform:uppercase;letter-spacing:0.1em;margin:16px 0;">
          Accept Invite →
        </a>
        <p style="color:#8096AE;font-size:12px;margin-top:8px;">This link expires in 24 hours. After you accept, you can set a password anytime from Sign in → Forgot password, or keep signing in with an email link.</p>
        <p style="color:#3D5166;font-size:12px;margin-top:32px;border-top:1px solid #DDE4ED;padding-top:16px;">
          By accepting this invite you agree to the <a href="${SITE}/terms" style="color:#1C3A5C;">Terms of Service</a> and <a href="${SITE}/privacy" style="color:#1C3A5C;">Privacy Policy</a>.<br />
          Release Point AI · Built for coaches and players.
        </p>
      </div>
    `,
  })
  return error ? { error: error.message } : {}
}

export async function sendAssistantCoachAddedEmail({
  toEmail,
  coachName,
  inviterName,
  teamName,
  teamId,
}: {
  toEmail: string
  coachName?: string
  inviterName: string
  teamName: string
  teamId: string
}): Promise<{ error?: string }> {
  if (!resend) return { error: 'Email sending is not set up' }
  const greeting = coachName ? `Hey ${coachName},` : 'Hey,'
  const teamUrl = `${SITE}/dashboard/team/${teamId}`
  const { error } = await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `${inviterName} added you as assistant coach for ${teamName}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <div style="background:#0F1F33;border-radius:12px;padding:24px;margin-bottom:24px;">
          <p style="color:#C8102E;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;margin:0 0 6px">Release Point AI</p>
          <h1 style="color:white;font-size:22px;margin:0;text-transform:uppercase;">You're on the Staff</h1>
        </div>
        <p style="color:#0F1F33;font-size:15px;">${greeting}</p>
        <p style="color:#456080;font-size:14px;line-height:1.6;">
          <strong style="color:#0F1F33">${inviterName}</strong> added you as an assistant coach for <strong style="color:#0F1F33">${teamName}</strong> on Release Point AI.
        </p>
        <p style="color:#456080;font-size:14px;line-height:1.6;">
          You can now view all player clips, add annotations, and track metrics for everyone on the team.
        </p>
        <a href="${teamUrl}"
           style="display:inline-block;background:#C8102E;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:13px;text-transform:uppercase;letter-spacing:0.1em;margin:16px 0;">
          View Team →
        </a>
        <p style="color:#3D5166;font-size:12px;margin-top:32px;border-top:1px solid #DDE4ED;padding-top:16px;">
          Release Point AI · Built for coaches and players.
        </p>
      </div>
    `,
  })
  return error ? { error: error.message } : {}
}

export async function sendClipUploadedEmail({
  coachEmail,
  coachName,
  playerName,
  clipTitle,
  clipId,
}: {
  coachEmail: string
  coachName: string
  playerName: string
  clipTitle: string
  clipId: string
}) {
  if (!resend) return
  await resend.emails.send({
    from: FROM,
    to: coachEmail,
    subject: `New clip from ${playerName}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <div style="background:#0F1F33;border-radius:12px;padding:24px;margin-bottom:24px;">
          <p style="color:#C8102E;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;margin:0 0 6px">Release Point AI</p>
          <h1 style="color:white;font-size:22px;margin:0;text-transform:uppercase;">New Clip Uploaded</h1>
        </div>
        <p style="color:#0F1F33;font-size:15px;">Hey ${coachName},</p>
        <p style="color:#456080;font-size:14px;line-height:1.6;">
          <strong style="color:#0F1F33">${playerName}</strong> just uploaded a new clip: <em>${clipTitle}</em>.
        </p>
        <a href="${SITE}/clips/${clipId}"
           style="display:inline-block;background:#C8102E;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:13px;text-transform:uppercase;letter-spacing:0.1em;margin:16px 0;">
          View Clip →
        </a>
        <p style="color:#3D5166;font-size:12px;margin-top:32px;border-top:1px solid #DDE4ED;padding-top:16px;">
          You&apos;re receiving this because you&apos;re a coach on Release Point AI.
          <a href="${SITE}/profile" style="color:#1C3A5C;">Manage notifications</a>
        </p>
      </div>
    `,
  })
}

export async function sendWaitlistNotification({
  email,
  name,
  role,
  programName,
  athleteCount,
  tech,
  referral,
}: {
  email: string
  name?: string | null
  role?: string | null
  programName?: string | null
  athleteCount?: string | null
  tech?: string | null
  referral?: string | null
}) {
  if (!resend) return
  const row = (label: string, val?: string | null) =>
    val ? `<p style="color:#0F1F33;font-size:14px;margin:6px 0;"><strong>${label}:</strong> ${val}</p>` : ''
  await resend.emails.send({
    from: FROM,
    to: 'temecng12@gmail.com',
    subject: `New waitlist signup: ${name || email}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <div style="background:#0F1F33;border-radius:12px;padding:24px;margin-bottom:24px;">
          <p style="color:#C8102E;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;margin:0 0 6px">Release Point AI</p>
          <h1 style="color:white;font-size:22px;margin:0;text-transform:uppercase;">New Waitlist Signup</h1>
        </div>
        ${row('Name', name)}
        ${row('Email', email)}
        ${row('Role', role)}
        ${row('Program', programName)}
        ${row('Athletes', athleteCount)}
        ${row('Tech', tech)}
        ${row('Heard via', referral)}
        <p style="color:#3D5166;font-size:12px;margin-top:32px;border-top:1px solid #DDE4ED;padding-top:16px;">
          Release Point AI Waitlist
        </p>
      </div>
    `,
  })
}

export async function sendCoachApprovalEmail({
  toEmail,
  name,
  inviteUrl,
}: {
  toEmail: string
  name?: string
  inviteUrl: string
}) {
  if (!resend) return { error: 'Email sending is not set up' }
  const greeting = name ? `Hey ${name},` : 'Hey,'
  const { error } = await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: "You're in — Release Point",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <div style="background:#0F1F33;border-radius:12px;padding:24px;margin-bottom:24px;">
          <p style="color:#C8102E;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;margin:0 0 6px">Release Point</p>
          <h1 style="color:white;font-size:22px;margin:0;text-transform:uppercase;">You're Approved</h1>
        </div>
        <p style="color:#0F1F33;font-size:15px;">${greeting}</p>
        <p style="color:#456080;font-size:14px;line-height:1.6;">
          Your waitlist spot just turned into a coaching account. Click below to set up your profile, add your players, and start uploading film.
        </p>
        <a href="${inviteUrl}"
           style="display:inline-block;background:#C8102E;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:13px;text-transform:uppercase;letter-spacing:0.1em;margin:16px 0;">
          Set Up Your Account →
        </a>
        <p style="color:#8096AE;font-size:12px;margin-top:8px;">This link expires in 24 hours.</p>
        <p style="color:#3D5166;font-size:12px;margin-top:32px;border-top:1px solid #DDE4ED;padding-top:16px;">
          Release Point · Built for coaches and players.
        </p>
      </div>
    `,
  })
  return error ? { error: error.message } : {}
}

export async function sendPlayerJoinedEmail({
  coachEmail,
  coachName,
  playerName,
  playerId,
}: {
  coachEmail: string
  coachName: string
  playerName: string
  playerId: string
}) {
  if (!resend) return
  await resend.emails.send({
    from: FROM,
    to: coachEmail,
    subject: `${playerName} joined your roster`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <div style="background:#0F1F33;border-radius:12px;padding:24px;margin-bottom:24px;">
          <p style="color:#C8102E;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;margin:0 0 6px">Release Point AI</p>
          <h1 style="color:white;font-size:22px;margin:0;text-transform:uppercase;">Player Joined</h1>
        </div>
        <p style="color:#0F1F33;font-size:15px;">Hey ${coachName},</p>
        <p style="color:#456080;font-size:14px;line-height:1.6;">
          <strong style="color:#0F1F33">${playerName}</strong> accepted your invite and is now on your roster.
        </p>
        <a href="${SITE}/profile/${playerId}"
           style="display:inline-block;background:#1C3A5C;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:13px;text-transform:uppercase;letter-spacing:0.1em;margin:16px 0;">
          View Player Profile →
        </a>
        <p style="color:#3D5166;font-size:12px;margin-top:32px;border-top:1px solid #DDE4ED;padding-top:16px;">
          You&apos;re receiving this because you&apos;re a coach on Release Point AI.
        </p>
      </div>
    `,
  })
}
