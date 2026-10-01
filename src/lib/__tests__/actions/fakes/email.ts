// Stand-in for @/lib/email: records invite emails; `emailFake.inviteResult` sets the reply.
export const emailFake = {
  invites: [] as { toEmail: string }[],
  inviteResult: {} as { error?: string } | 'throw',
  reset() { this.invites = []; this.inviteResult = {} },
}
export async function sendPlayerInviteEmail(args: { toEmail: string; playerName?: string; coachName: string; inviteUrl: string }) {
  if (emailFake.inviteResult === 'throw') throw new Error('network down')
  if (!emailFake.inviteResult.error) emailFake.invites.push({ toEmail: args.toEmail })
  return emailFake.inviteResult
}
export async function sendClipUploadedEmail() {}
export async function sendWaitlistNotification() {}
export async function sendPlayerJoinedEmail() {}
