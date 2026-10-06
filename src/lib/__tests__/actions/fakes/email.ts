// Stand-in for @/lib/email: records invite emails; `emailFake.inviteResult` sets the reply.
export const emailFake = {
  invites: [] as { toEmail: string }[],
  inviteResult: {} as { error?: string } | 'throw',
  waitlist: [] as { email: string; name?: string | null }[],
  waitlistResult: {} as { error?: string } | 'throw',
  reset() {
    this.invites = []; this.inviteResult = {}
    this.waitlist = []; this.waitlistResult = {}
  },
}
export async function sendPlayerInviteEmail(args: { toEmail: string; playerName?: string; coachName: string; inviteUrl: string }) {
  if (emailFake.inviteResult === 'throw') throw new Error('network down')
  if (!emailFake.inviteResult.error) emailFake.invites.push({ toEmail: args.toEmail })
  return emailFake.inviteResult
}
export async function sendClipUploadedEmail() {}
export async function sendWaitlistNotification(args: { email: string; name?: string | null }) {
  if (emailFake.waitlistResult === 'throw') throw new Error('resend down')
  if (emailFake.waitlistResult.error) throw new Error(emailFake.waitlistResult.error)
  emailFake.waitlist.push({ email: args.email, name: args.name ?? null })
}
export async function sendPlayerJoinedEmail() {}
