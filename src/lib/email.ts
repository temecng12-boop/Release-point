import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const FROM = 'Release Point <notifications@releasepoint.app>'
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://releasepointai.com'

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
}) {
  if (!resend) return
  const greeting = playerName ? `Hey ${playerName},` : 'Hey,'
  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `${coachName} invited you to Release Point`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <div style="background:#0F1F33;border-radius:12px;padding:24px;margin-bottom:24px;">
          <p style="color:#C8102E;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;margin:0 0 6px">Release Point</p>
          <h1 style="color:white;font-size:22px;margin:0;text-transform:uppercase;">You're Invited</h1>
        </div>
        <p style="color:#0F1F33;font-size:15px;">${greeting}</p>
        <p style="color:#456080;font-size:14px;line-height:1.6;">
          <strong style="color:#0F1F33">${coachName}</strong> invited you to join Release Point — a professional-grade film room built for baseball.
        </p>
        <p style="color:#456080;font-size:14px;line-height:1.6;">
          Click below to set up your account and access your clips, annotations, and pitch data.
        </p>
        <a href="${inviteUrl}"
           style="display:inline-block;background:#C8102E;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:13px;text-transform:uppercase;letter-spacing:0.1em;margin:16px 0;">
          Accept Invite →
        </a>
        <p style="color:#8096AE;font-size:12px;margin-top:8px;">This link expires in 24 hours.</p>
        <p style="color:#3D5166;font-size:12px;margin-top:32px;border-top:1px solid #DDE4ED;padding-top:16px;">
          Release Point · Built for coaches and players.
        </p>
      </div>
    `,
  })
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
          <p style="color:#C8102E;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;margin:0 0 6px">Release Point</p>
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
          You&apos;re receiving this because you&apos;re a coach on Release Point.
          <a href="${SITE}/profile" style="color:#1C3A5C;">Manage notifications</a>
        </p>
      </div>
    `,
  })
}

export async function sendWaitlistNotification({
  email,
  name,
}: {
  email: string
  name?: string | null
}) {
  if (!resend) return
  await resend.emails.send({
    from: FROM,
    to: 'temecng12@gmail.com',
    subject: `New waitlist signup: ${email}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <div style="background:#0F1F33;border-radius:12px;padding:24px;margin-bottom:24px;">
          <p style="color:#C8102E;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;margin:0 0 6px">Release Point</p>
          <h1 style="color:white;font-size:22px;margin:0;text-transform:uppercase;">New Waitlist Signup</h1>
        </div>
        ${name ? `<p style="color:#0F1F33;font-size:15px;"><strong>Name:</strong> ${name}</p>` : ''}
        <p style="color:#0F1F33;font-size:15px;"><strong>Email:</strong> ${email}</p>
        <p style="color:#3D5166;font-size:12px;margin-top:32px;border-top:1px solid #DDE4ED;padding-top:16px;">
          Release Point Waitlist
        </p>
      </div>
    `,
  })
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
          <p style="color:#C8102E;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;margin:0 0 6px">Release Point</p>
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
          You&apos;re receiving this because you&apos;re a coach on Release Point.
        </p>
      </div>
    `,
  })
}
