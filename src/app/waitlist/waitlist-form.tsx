'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { joinWaitlist } from '@/app/actions/waitlist'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

const inputCls =
  'w-full bg-white border border-[#DDE4ED] rounded-lg px-4 py-3 text-sm text-[#0F1F33] placeholder:text-[#8096AE] focus:outline-none focus:border-[#456080] transition-colors max-sm:min-h-11'

export default function WaitlistForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const submitting = useRef(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Disable-on-submit + ref guard so a double-tap can't fire two inserts.
    if (submitting.current || state === 'loading') return
    submitting.current = true
    setState('loading')
    setMessage('')
    try {
      const result = await joinWaitlist({ email, name })
      if ('success' in result && result.success) {
        setState('success')
      } else {
        setState('error')
        setMessage(('error' in result && result.error) || 'Something went wrong. Please try again.')
      }
    } catch {
      setState('error')
      setMessage('Something went wrong. Please try again.')
    } finally {
      submitting.current = false
    }
  }

  if (state === 'success') {
    return (
      <div className="text-center py-4 space-y-3" role="status">
        <div className="w-12 h-12 rounded-full bg-[#C8102E]/10 border border-[#C8102E]/30 flex items-center justify-center mx-auto">
          <svg className="w-6 h-6 text-[#C8102E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-[#0F1F33] text-sm font-medium" style={os}>You&apos;re on the list</p>
        <p className="text-[#456080] text-xs">
          Thanks for your interest in Release Point. We&apos;ll reach out at {email} when your spot is ready.
        </p>
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
        autoComplete="name"
        className={inputCls}
      />
      <input
        type="email"
        value={email}
        onChange={e => { setEmail(e.target.value); if (state === 'error') setState('idle') }}
        placeholder="Email address"
        required
        autoComplete="email"
        className={inputCls}
      />
      {state === 'error' && (
        <p className="text-[#C8102E] text-xs" role="alert">{message}</p>
      )}
      <button
        type="submit"
        disabled={state === 'loading' || !email.trim()}
        className="w-full bg-[#C8102E] hover:bg-[#9E0E24] disabled:opacity-50 text-white py-3 rounded-lg text-sm transition-colors max-sm:min-h-11"
        style={os}
      >
        {state === 'loading' ? 'Joining…' : 'Join the waitlist'}
      </button>
      <p className="text-[#8096AE] text-[11px] leading-relaxed">
        Players under 13: please ask a parent or guardian to sign up for you.
      </p>
      <p className="text-[#8096AE] text-[11px] leading-relaxed">
        We&apos;ll use your email to contact you about Release Point access. See how we handle your information in our{' '}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-[#456080]">Privacy Policy</Link>.
      </p>
      <p className="text-[#456080] text-xs text-center pt-1">
        Already part of the test group?{' '}
        <Link href="/auth/login" className="underline underline-offset-2 hover:text-[#0F1F33]">Sign in</Link>
      </p>
    </form>
  )
}
