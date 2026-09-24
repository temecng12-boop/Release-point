'use client'

import { useActionState, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import Logo from '@/components/Logo'
import { signIn } from '@/app/actions/auth'
import { createClient } from '@/lib/supabase/client'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

const inputCls = [
  'w-full rounded-lg px-4 py-3 text-sm text-slate-900 transition-all',
  'focus:outline-none placeholder:text-slate-300',
  'bg-white border border-slate-200 focus:border-slate-400 focus:ring-1 focus:ring-slate-200',
].join(' ')

function LoginForm() {
  const searchParams = useSearchParams()
  const urlError = searchParams.get('error')
  const [state, action, pending] = useActionState(signIn, undefined)
  const [magicMode, setMagicMode]   = useState(false)
  const [magicEmail, setMagicEmail] = useState('')
  const [magicState, setMagicState] = useState<{ error?: string; success?: string }>({})
  const [magicPending, setMagicPending] = useState(false)

  async function signInWithGoogle() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  async function signInWithApple() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setMagicPending(true)
    setMagicState({})
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: magicEmail,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setMagicPending(false)
    if (error) setMagicState({ error: error.message })
    else setMagicState({ success: 'Check your email for a sign-in link.' })
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Left panel */}
      <div
        className="hidden lg:flex flex-col justify-between w-[400px] shrink-0 p-10 bg-white"
        style={{ borderRight: '1px solid #e2e8f0' }}
      >
        <div>
          <div className="mb-12">
            <Logo size="md" wordmarkClass="inline" />
          </div>
          <div className="space-y-8">
            <div>
              <p className="text-3xl text-slate-950 leading-tight mb-3 tracking-tighter" style={os}>
                Welcome Back.
              </p>
              <p className="text-sm text-slate-500 leading-relaxed">
                Your clips, metrics, and player feedback are waiting.
              </p>
            </div>
            <div className="pt-8 space-y-5" style={{ borderTop: '1px solid #e2e8f0' }}>
              <p className="text-[10px] text-slate-400 tracking-[0.25em]" style={os}>Sign in with</p>
              {[
                { t: 'Email + Password', d: 'Works for coaches and players — use the credentials you signed up with.' },
                { t: 'Email Link',       d: 'No password? Request a one-click sign-in link sent to your email.' },
              ].map(i => (
                <div key={i.t}>
                  <p className="text-sm text-slate-800 mb-1 tracking-tight" style={os}>{i.t}</p>
                  <p className="text-xs text-slate-400 leading-relaxed">{i.d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-300">Release Point — Pitching &amp; hitting mechanics analyzer</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex justify-center mb-8">
            <Logo size="md" wordmarkClass="inline" />
          </div>

          <div className="rounded-2xl overflow-hidden bg-white" style={{ border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div className="h-px bg-[#E8102A]" />
            <div className="p-8">
              <div className="mb-6">
                <h1 className="text-xl text-slate-950 mb-1 tracking-tighter" style={os}>Sign In</h1>
                <p className="text-sm text-slate-500">Coaches and players — sign in with your password or email link</p>
              </div>

              {/* Mode toggle */}
              <div className="flex rounded-lg p-1 mb-6 gap-1"
                style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                {(['Password', 'Email Link'] as const).map((label, idx) => {
                  const active = idx === 0 ? !magicMode : magicMode
                  return (
                    <button
                      key={label}
                      onClick={() => setMagicMode(idx === 1)}
                      className="flex-1 py-2 rounded-md text-xs transition-all"
                      style={{
                        ...os,
                        background: active ? '#ffffff' : 'transparent',
                        color: active ? '#0f172a' : '#94a3b8',
                        border: active ? '1px solid #e2e8f0' : '1px solid transparent',
                        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>

              {urlError && (
                <div className="rounded-lg px-4 py-3 mb-4" style={{ background: 'rgba(232,16,42,0.06)', border: '1px solid rgba(232,16,42,0.2)' }}>
                  <p className="text-sm text-[#E8102A]">
                    {urlError === 'confirmation_failed'
                      ? 'That sign-in link has expired or already been used. Request a new one below.'
                      : 'Sign-in failed. Please try again.'}
                  </p>
                </div>
              )}

              {!magicMode ? (
                <form action={action} className="space-y-4">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1.5 tracking-[0.2em]" style={os}>Email Address</label>
                    <input type="email" name="email" required placeholder="coach@example.com" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1.5 tracking-[0.2em]" style={os}>Password</label>
                    <input type="password" name="password" required placeholder="Your password" className={inputCls} />
                  </div>
                  <p className="text-[11px] text-slate-400">Players — use the <button type="button" onClick={() => setMagicMode(true)} className="text-slate-600 underline underline-offset-2">Email Link</button> tab instead.</p>
                  {state?.error && (
                    <div className="rounded-lg px-4 py-3" style={{ background: 'rgba(232,16,42,0.06)', border: '1px solid rgba(232,16,42,0.2)' }}>
                      <p className="text-sm text-[#E8102A]">{state.error}</p>
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={pending}
                    className="w-full bg-slate-950 hover:bg-slate-800 active:scale-95 text-white rounded-lg py-3 text-sm font-medium transition-all disabled:opacity-50 mt-2"
                    style={os}
                  >
                    {pending ? 'Signing In…' : 'Sign In'}
                  </button>
                </form>
              ) : (
                <form onSubmit={sendMagicLink} className="space-y-4">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1.5 tracking-[0.2em]" style={os}>Your Invite Email</label>
                    <input
                      type="email"
                      required
                      value={magicEmail}
                      onChange={(e) => setMagicEmail(e.target.value)}
                      placeholder="The email your coach invited you with"
                      className={inputCls}
                    />
                  </div>
                  {magicState.error && (
                    <div className="rounded-lg px-4 py-3" style={{ background: 'rgba(232,16,42,0.06)', border: '1px solid rgba(232,16,42,0.2)' }}>
                      <p className="text-sm text-[#E8102A]">{magicState.error}</p>
                    </div>
                  )}
                  {magicState.success && (
                    <div className="rounded-lg px-4 py-3" style={{ background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.2)' }}>
                      <p className="text-sm text-green-700">{magicState.success}</p>
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={magicPending}
                    className="w-full bg-slate-950 hover:bg-slate-800 active:scale-95 text-white rounded-lg py-3 text-sm font-medium transition-all disabled:opacity-50 mt-2"
                    style={os}
                  >
                    {magicPending ? 'Sending…' : 'Send Sign-in Link'}
                  </button>
                  <p className="text-xs text-slate-400 text-center">
                    We&apos;ll email you a one-click sign-in link.
                  </p>
                </form>
              )}

              {/* OAuth */}
              <div className="mt-5 space-y-2">
                <div className="relative flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-[10px] text-slate-400 tracking-widest shrink-0" style={os}>Or</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>
                <button
                  type="button"
                  onClick={signInWithApple}
                  className="w-full flex items-center justify-center gap-3 bg-slate-950 hover:bg-slate-800 active:scale-95 rounded-lg py-3 text-sm text-white font-medium transition-all"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.43c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.56-1.32 3.1-2.53 3.96zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                  </svg>
                  Continue with Apple
                </button>
                <button
                  type="button"
                  onClick={signInWithGoogle}
                  className="w-full flex items-center justify-center gap-3 rounded-lg py-3 text-sm text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-all active:scale-95"
                  style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </button>
              </div>

              <div className="mt-5 pt-5 space-y-2 text-center" style={{ borderTop: '1px solid #e2e8f0' }}>
                <p className="text-[10px] text-slate-400 tracking-widest mb-3" style={os}>New here?</p>
                <div className="flex gap-2">
                  {['Coach Account', 'Player Account'].map(l => (
                    <Link
                      key={l}
                      href="/auth/signup"
                      className="flex-1 py-2.5 rounded-lg text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-all text-center"
                      style={{ ...os, border: '1px solid #e2e8f0' }}
                    >
                      {l}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
