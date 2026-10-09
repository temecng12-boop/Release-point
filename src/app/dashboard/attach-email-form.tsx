'use client'

import { useActionState } from 'react'
import { attachPlayerEmail } from '@/app/actions/roster'
import InviteLinkBox from './invite-link-box'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }
const inputCls = 'w-full bg-[#F8FAFC] border border-[#DDE4ED] rounded-md px-3 py-2 text-sm text-[#0F1F33] placeholder:text-[#B0BEC5] focus:outline-none focus:border-[#456080] transition-colors min-h-11'

export default function AttachEmailForm({
  playerId,
  currentEmail,
}: {
  playerId: string
  currentEmail: string | null
}) {
  const [state, action, pending] = useActionState(attachPlayerEmail, undefined)

  return (
    <form action={action} className="space-y-3" data-testid="attach-email-form">
      <input type="hidden" name="player_id" value={playerId} />
      <div>
        <label className="block text-[10px] text-[#3D5166] mb-1.5 tracking-wide" style={os}>
          {currentEmail ? 'Player email' : 'Add an email'}
        </label>
        <input
          type="email"
          name="player_email"
          defaultValue={currentEmail ?? ''}
          placeholder="player@email.com"
          required
          className={inputCls}
        />
      </div>
      <label className="flex items-center gap-2 cursor-pointer min-h-11">
        <input type="checkbox" name="send_invite" value="on" className="accent-[#C8102E]" defaultChecked={!currentEmail} />
        <span className="text-sm text-[#0F1F33]">Send invite now</span>
      </label>
      {state?.error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-md px-3 py-2" role="alert">
          <p className="text-sm text-[#C8102E]">{state.error}</p>
        </div>
      )}
      {state?.success && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-md px-3 py-2" role="status">
          <p className="text-sm text-green-700">{state.success}</p>
        </div>
      )}
      {state?.inviteUrl && <InviteLinkBox inviteUrl={state.inviteUrl} />}
      <button
        type="submit"
        disabled={pending}
        className="w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm text-white transition-colors disabled:opacity-50 min-h-11"
        style={{ ...os, background: pending ? '#4A6880' : '#C8102E' }}
      >
        {pending ? 'Saving…' : 'Save email'}
      </button>
    </form>
  )
}
