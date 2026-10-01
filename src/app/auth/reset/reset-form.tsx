'use client'

import { useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
import Logo from '@/components/Logo'
import { resetPassword } from '@/app/actions/password-reset'
import { passwordProblem, PASSWORD_MIN_LENGTH } from '@/lib/password-rule'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }
const inputCls = [
  'w-full rounded-lg px-4 py-3 text-sm text-slate-900 transition-all !min-h-11',
  'focus:outline-none placeholder:text-slate-300',
  'bg-white border border-slate-200 focus:border-slate-400 focus:ring-1 focus:ring-slate-200',
].join(' ')
const errorBox = { background: 'rgba(232,16,42,0.06)', border: '1px solid rgba(232,16,42,0.2)' }

export default function ResetForm({ problem }: { problem: string | null }) {
  const [state, action, pending] = useActionState(resetPassword, undefined)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [touched, setTouched] = useState(false)

  const ruleProblem = passwordProblem(password)
  const mismatch = confirm !== '' && confirm !== password
  const showRule = touched && ruleProblem !== null

  // Success only after the server confirmed the update; then on to the dashboard.
  useEffect(() => {
    if (!state?.success) return
    const t = setTimeout(() => { window.location.replace(`${window.location.origin}/dashboard`) }, 1500)
    return () => clearTimeout(t)
  }, [state?.success])

  const linkProblem = problem ?? (state?.expired ? state.error ?? null : null)

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8"><Logo size="md" wordmarkClass="inline" /></div>
        <div className="rounded-2xl overflow-hidden bg-white" style={{ border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div className="h-px bg-[#E8102A]" />
          <div className="p-8">
            <h1 className="text-xl text-slate-950 mb-1 tracking-tighter" style={os}>Set a New Password</h1>

            {linkProblem ? (
              <div className="mt-4 space-y-4">
                <div role="alert" className="rounded-lg px-4 py-3" style={errorBox}>
                  <p className="text-sm text-[#E8102A]">{linkProblem}</p>
                </div>
                <Link href="/auth/login?reset=1" className="inline-flex items-center justify-center w-full !min-h-11 bg-slate-950 hover:bg-slate-800 text-white rounded-lg text-sm" style={os}>
                  Request a New Reset Link
                </Link>
              </div>
            ) : state?.success ? (
              <div role="status" className="mt-4 rounded-lg px-4 py-3" style={{ background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)' }}>
                <p className="text-sm text-green-700">Your password has been changed. Taking you to your dashboard…</p>
              </div>
            ) : (
              <form
                action={action}
                onSubmit={(e) => {
                  // Inline check first; the server checks again.
                  if (ruleProblem || confirm !== password) { e.preventDefault(); setTouched(true) }
                }}
                className="mt-4 space-y-4"
              >
                <div>
                  <label htmlFor="new-password" className="block text-[11px] text-slate-500 mb-1.5 tracking-[0.2em]" style={os}>New Password</label>
                  <input
                    id="new-password" type="password" name="password" required minLength={PASSWORD_MIN_LENGTH}
                    autoComplete="new-password" value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() => { if (password) setTouched(true) }}
                    aria-invalid={showRule} aria-describedby="new-password-rule"
                    className={inputCls}
                  />
                  <p id="new-password-rule" aria-live="polite" className={`mt-1.5 text-xs ${showRule ? 'text-[#E8102A]' : 'text-slate-400'}`}>
                    {showRule ? ruleProblem : `At least ${PASSWORD_MIN_LENGTH} characters, and not a common password.`}
                  </p>
                </div>
                <div>
                  <label htmlFor="confirm-password" className="block text-[11px] text-slate-500 mb-1.5 tracking-[0.2em]" style={os}>Confirm New Password</label>
                  <input
                    id="confirm-password" type="password" name="confirm_password" required
                    autoComplete="new-password" value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    aria-invalid={touched && mismatch} aria-describedby="confirm-password-msg"
                    className={inputCls}
                  />
                  <p id="confirm-password-msg" aria-live="polite" className="mt-1.5 text-xs text-[#E8102A] min-h-4">
                    {touched && mismatch ? 'The two passwords don\'t match.' : ''}
                  </p>
                </div>
                {state?.error && (
                  <div role="alert" id="reset-error" className="rounded-lg px-4 py-3" style={errorBox}>
                    <p className="text-sm text-[#E8102A]">{state.error}</p>
                  </div>
                )}
                <button
                  type="submit" disabled={pending}
                  aria-describedby={state?.error ? 'reset-error' : undefined}
                  className="w-full !min-h-11 bg-slate-950 hover:bg-slate-800 text-white rounded-lg py-3 text-sm transition-all disabled:opacity-50"
                  style={os}
                >
                  {pending ? 'Saving…' : 'Save New Password'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
