'use client'

import { useRef, useState } from 'react'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

/**
 * Copyable invite link. Shown after an invite is created so the coach can
 * text it to the player directly when the invite email fails to arrive
 * (or instead of relying on email at all). The link is the same Supabase
 * invite URL the email button points to and expires in 24 hours.
 */
export default function InviteLinkBox({ inviteUrl }: { inviteUrl: string }) {
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl)
    } catch {
      // Clipboard API unavailable (permissions or non-secure context):
      // select the text so the coach can copy it by hand.
      inputRef.current?.focus()
      inputRef.current?.select()
      return
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
      <p className="text-sm font-medium text-[#0F1F33]">Or share this invite link directly</p>
      <p className="text-xs text-[#3D5166] mt-0.5 mb-2 leading-relaxed">
        Email not arriving? Copy this link and text it instead — it works the same as the email button and expires in 24 hours.
      </p>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          readOnly
          value={inviteUrl}
          onFocus={(e) => e.target.select()}
          aria-label="Invite link"
          className="flex-1 min-w-0 bg-white border border-[#DDE4ED] rounded-md px-3 py-2 text-xs text-[#0F1F33] focus:outline-none focus:border-[#456080]"
        />
        <button
          type="button"
          onClick={copyLink}
          className="shrink-0 bg-[#0F1F33] hover:bg-[#1C3A5C] text-white rounded-md px-4 py-2 text-xs transition-colors"
          style={oswald}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  )
}
