'use client'

import { useState } from 'react'
import { joinWaitlist } from '@/app/actions/waitlist'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export default function WaitlistForm() {
  const [name,    setName]    = useState('')
  const [email,   setEmail]   = useState('')
  const [state,   setState]   = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setState('loading')
    const result = await joinWaitlist({ email, name })
    if (result.success) {
      setState('success')
    } else {
      setState('error')
      setMessage(result.error ?? 'Something went wrong.')
    }
  }

  if (state === 'success') {
    return (
      <div className="text-center py-4 space-y-3">
        <div className="w-12 h-12 rounded-full bg-[#C8102E]/10 border border-[#C8102E]/30 flex items-center justify-center mx-auto">
          <svg className="w-6 h-6 text-[#C8102E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-white text-sm font-medium" style={os}>You're on the list</p>
        <p className="text-[#8096AE] text-xs">We'll reach out to {email} when your spot is ready. Thanks for the support.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Your name"
        className="w-full bg-[#0F1F33] border border-[rgba(255,255,255,0.1)] rounded-lg px-4 py-3 text-sm text-white placeholder:text-[#3D5166] focus:outline-none focus:border-[#456080] transition-colors"
      />
      <input
        type="email"
        value={email}
        onChange={e => { setEmail(e.target.value); if (state === 'error') setState('idle') }}
        placeholder="Email address"
        required
        className="w-full bg-[#0F1F33] border border-[rgba(255,255,255,0.1)] rounded-lg px-4 py-3 text-sm text-white placeholder:text-[#3D5166] focus:outline-none focus:border-[#456080] transition-colors"
      />
      {state === 'error' && (
        <p className="text-[#C8102E] text-xs">{message}</p>
      )}
      <button
        type="submit"
        disabled={state === 'loading' || !email}
        className="w-full bg-[#C8102E] hover:bg-[#9E0E24] disabled:opacity-50 text-white py-3 rounded-lg text-sm transition-colors"
        style={os}
      >
        {state === 'loading' ? 'Joining…' : 'Join the waitlist'}
      </button>
    </form>
  )
}
