'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import BirthFields from '@/components/birth-fields'
import AgeStopNotice from '@/components/age-stop-notice'

// The one screen: birth month and year, name, email and the Terms, in one
// step (spec T1). Used for player self-signup (mode 'signup': name and email
// typed, a sign-in link is sent), for a signed-in player whose age isn't
// confirmed yet (mode 'account': a coach-invited player accepting the
// invite, or someone who used Google/Apple from the sign-in page; the email
// is the signed-in one), and before the Google and Apple buttons on the
// signup page (mode 'oauth': birth month and year and the Terms only; the
// buttons show once the server has checked the answer, `readyContent`).
// The server checks the age before anything else; this browser code knows
// nothing about age limits, and no copy here names one.

export type AgeConfirmFormState = { error?: string; stopped?: boolean; done?: boolean; sent?: boolean; email?: string; ready?: boolean } | undefined

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }
const label = 'block text-[11px] text-slate-500 mb-1.5 tracking-[0.2em]'
const inputCls = [
  'w-full rounded-lg px-4 py-3 text-sm text-slate-900 transition-all min-h-11',
  'focus:outline-none placeholder:text-slate-300',
  'bg-white border border-slate-200 focus:border-slate-400 focus:ring-1 focus:ring-slate-200',
].join(' ')

export default function AgeConfirmForm({
  mode,
  action,
  stopped = false,
  defaultName = '',
  email,
  next = '/dashboard',
  onBack,
  onStopped,
  readyContent,
}: {
  mode: 'signup' | 'account' | 'oauth'
  action: (prev: AgeConfirmFormState, formData: FormData) => Promise<AgeConfirmFormState>
  /** The stop cookie is already set (read on the server): show only the stop message. */
  stopped?: boolean
  defaultName?: string
  /** Account mode: the signed-in email, shown read-only. */
  email?: string | null
  /** Account mode: where to go once saved. */
  next?: string
  onBack?: () => void
  /** Called once the server stops the answer (the parent can hide its other options). */
  onStopped?: () => void
  /** OAuth mode: what to show once the answer is accepted (the Google and Apple buttons). */
  readyContent?: React.ReactNode
}) {
  const [state, formAction, pending] = useActionState(action, undefined)
  const [tosAccepted, setTosAccepted] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (state?.done) router.replace(next)
    if (state?.stopped) onStopped?.()
  }, [state, next, router, onStopped])

  const back = onBack && (
    <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700 transition-colors min-h-11" style={os}>
      ← Back
    </button>
  )

  if (stopped || state?.stopped) {
    return (
      <div className="space-y-4">
        <AgeStopNotice />
        {back}
      </div>
    )
  }

  if (mode === 'oauth' && state?.ready) {
    return (
      <div className="space-y-4" data-testid="oauth-ready">
        {back}
        {readyContent}
      </div>
    )
  }

  if (state?.sent) {
    return (
      <div className="text-center space-y-4">
        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto bg-slate-100">
          <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <p className="text-sm text-slate-950 mb-1 tracking-tight" style={os}>Check Your Email</p>
          <p className="text-xs text-slate-500 leading-relaxed">We sent a sign-in link to <strong className="text-slate-700">{state.email}</strong>. Click it to finish setting up your account.</p>
        </div>
        {back}
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-4" data-testid="age-confirm-form">
      {back}
      <BirthFields legendClassName={label} legendStyle={os} />
      {mode !== 'oauth' && (
        <div>
          <label htmlFor="acf-name" className={label} style={os}>Full Name</label>
          <input id="acf-name" type="text" name="full_name" required autoComplete="name" defaultValue={defaultName} placeholder="Your name" className={inputCls} />
        </div>
      )}
      {mode === 'signup' ? (
        <div>
          <label htmlFor="acf-email" className={label} style={os}>Email Address</label>
          <input id="acf-email" type="email" name="email" required autoComplete="email" placeholder="your@email.com" className={inputCls} />
          <p className="text-[11px] text-slate-400 mt-1.5">Use the same email your coach invited you with to auto-connect to your team.</p>
        </div>
      ) : email ? (
        <div>
          <p className={label} style={os}>Email Address</p>
          <p className="text-sm text-slate-700 break-all" data-testid="acf-email">{email}</p>
        </div>
      ) : null}
      <label className="flex items-start gap-3 cursor-pointer min-h-11">
        <input
          type="checkbox"
          name="tos"
          value="yes"
          required
          checked={tosAccepted}
          onChange={(e) => setTosAccepted(e.target.checked)}
          className="mt-0.5 w-5 h-5 accent-[#E8102A] shrink-0"
        />
        <span className="text-xs text-slate-500 leading-relaxed">
          I agree to the{' '}
          <a href="/terms" target="_blank" className="text-slate-700 hover:text-slate-900 underline">Terms of Service</a>
          {' '}and{' '}
          <a href="/privacy" target="_blank" className="text-slate-700 hover:text-slate-900 underline">Privacy Policy</a>
        </span>
      </label>
      {state?.error && (
        <div role="alert" className="rounded-lg px-4 py-3" style={{ background: 'rgba(232,16,42,0.06)', border: '1px solid rgba(232,16,42,0.2)' }}>
          <p className="text-sm text-[#E8102A]">{state.error}</p>
        </div>
      )}
      <button
        type="submit"
        disabled={pending || !tosAccepted || !!state?.done}
        className="w-full bg-slate-950 hover:bg-slate-800 active:scale-95 text-white rounded-lg py-3 text-sm transition-all disabled:opacity-40 min-h-11"
        style={os}
      >
        {mode === 'signup'
          ? (pending ? 'Sending Link…' : 'Send Sign-in Link')
          : mode === 'oauth'
            ? (pending ? 'Checking…' : 'Continue')
            : (pending || state?.done ? 'Saving…' : 'Continue')}
      </button>
    </form>
  )
}
