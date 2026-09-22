'use client'

import { useState, useTransition } from 'react'
import { deleteAccount } from '@/app/actions/auth'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export default function DeleteAccountButton() {
  const [confirming, setConfirming] = useState(false)
  const [input, setInput] = useState('')
  const [pending, startTransition] = useTransition()

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-xs text-[#C8102E] hover:text-red-400 border border-[#C8102E]/30 hover:border-[#C8102E]/60 px-4 py-2 rounded-lg transition-colors"
        style={oswald}
      >
        Delete Account
      </button>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#456080]">
        This will permanently delete your account and all data. Type <span className="text-[#0F1F33] font-mono">DELETE</span> to confirm.
      </p>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Type DELETE"
        className="w-full max-w-xs bg-white border border-[#DDE4ED] text-[#0F1F33] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8102E]/50 font-mono"
      />
      <div className="flex gap-2">
        <button
          onClick={() => startTransition(() => deleteAccount())}
          disabled={input !== 'DELETE' || pending}
          className="text-xs bg-[#C8102E] hover:bg-[#9E0E24] text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={oswald}
        >
          {pending ? 'Deleting…' : 'Confirm Delete'}
        </button>
        <button
          onClick={() => { setConfirming(false); setInput('') }}
          disabled={pending}
          className="text-xs text-[#7A92A8] hover:text-[#456080] px-4 py-2 rounded-lg transition-colors"
          style={oswald}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
