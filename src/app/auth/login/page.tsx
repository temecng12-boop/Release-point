'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import Logo from '@/components/Logo'
import { signIn } from '@/app/actions/auth'
import { createClient } from '@/lib/supabase/client'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }
const inputClass = 'w-full bg-white border border-[#DDE4ED] text-[#0F1F33] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#456080] focus:ring-1 focus:ring-[#456080]/20 placeholder:text-[#3D5166] transition-colors'

export default function LoginPage() {
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
    <div className="min-h-screen bg-[#F5F7FA] flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] shrink-0 bg-[#1C3A5C] border-r border-[#1C3A5C] p-10">
        <div>
          <div className="mb-12">
            <Logo size="md" wordmarkClass="inline" />
          </div>
          <div className="space-y-8">
            <div>
              <p className="text-3xl text-white leading-tight mb-3" style={oswald}>
                Welcome Back.
              </p>
              <p className="text-sm text-[#B8D0E8] leading-relaxed">
                Your clips, metrics, and player feedback are waiting.
              </p>
            </div>
            <div className="border-t border-white/20 pt-8 space-y-5">
              <p className="text-xs text-[#B8D0E8] tracking-widest" style={oswald}>Sign in with</p>
              <div>
                <p className="text-sm text-white mb-1" style={oswald}>Email + Password</p>
                <p className="text-xs text-[#B8D0E8]">Works for coaches and players — use the credentials you signed up with.</p>
              </div>
              <div>
                <p className="text-sm text-white mb-1" style={oswald}>Email Link</p>
                <p className="text-xs text-[#B8D0E8]">No password? Request a one-click sign-in link sent to your email.</p>
              </div>
            </div>
          </div>
        </div>
        <p className="text-xs text-white/40">Release Point — Pitching &amp; hitting mechanics analyzer</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <Logo size="md" wordmarkClass="inline" />
          </div>

          <div className="bg-white border border-[#DDE4ED] rounded-xl shadow-sm overflow-hidden">
            <div className="h-1 bg-[#C8102E]" />
            <div className="p-8">
              <div className="mb-6">
                <h1 className="text-xl text-[#0F1F33] mb-1" style={oswald}>Sign In</h1>
                <p className="text-sm text-[#3D5166]">Coaches and players — sign in with your password or email link</p>
              </div>

              {/* Mode toggle */}
              <div className="flex bg-[#F5F7FA] border border-[#DDE4ED] rounded-lg p-1 mb-6 gap-1">
                <button
                  onClick={() => setMagicMode(false)}
                  className={`flex-1 py-2 rounded-md text-xs transition-colors ${
                    !magicMode
                      ? 'bg-white text-[#0F1F33] border border-[#DDE4ED]'
                      : 'text-[#3D5166] hover:text-[#456080]'
                  }`}
                  style={oswald}
                >
                  Password
                </button>
                <button
                  onClick={() => setMagicMode(true)}
                  className={`flex-1 py-2 rounded-md text-xs transition-colors ${
                    magicMode
                      ? 'bg-white text-[#0F1F33] border border-[#DDE4ED]'
                      : 'text-[#3D5166] hover:text-[#456080]'
                  }`}
                  style={oswald}
                >
                  Email Link
                </button>
              </div>

              {!magicMode ? (
                <form action={action} className="space-y-4">
                  <div>
                    <label className="block text-xs text-[#456080] mb-1.5 tracking-wide" style={oswald}>Email Address</label>
                    <input type="email" name="email" required placeholder="coach@example.com" className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs text-[#456080] mb-1.5 tracking-wide" style={oswald}>Password</label>
                    <input type="password" name="password" required placeholder="Your password" className={inputClass} />
                  </div>
                  {state?.error && (
                    <div className="bg-[#C8102E]/10 border border-[#C8102E]/30 rounded-lg px-4 py-3">
                      <p className="text-sm text-[#C8102E]">{state.error}</p>
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={pending}
                    className="w-full bg-[#C8102E] hover:bg-[#9E0E24] text-white rounded-lg py-3 text-sm font-medium transition-colors disabled:opacity-50 mt-2"
                    style={oswald}
                  >
                    {pending ? 'Signing In…' : 'Sign In'}
                  </button>
                </form>
              ) : (
                <form onSubmit={sendMagicLink} className="space-y-4">
                  <div>
                    <label className="block text-xs text-[#456080] mb-1.5 tracking-wide" style={oswald}>Your Invite Email</label>
                    <input
                      type="email"
                      required
                      value={magicEmail}
                      onChange={(e) => setMagicEmail(e.target.value)}
                      placeholder="The email your coach invited you with"
                      className={inputClass}
                    />
                  </div>
                  {magicState.error && (
                    <div className="bg-[#C8102E]/10 border border-[#C8102E]/30 rounded-lg px-4 py-3">
                      <p className="text-sm text-[#C8102E]">{magicState.error}</p>
                    </div>
                  )}
                  {magicState.success && (
                    <div className="bg-green-900/20 border border-green-800/40 rounded-lg px-4 py-3">
                      <p className="text-sm text-green-400">{magicState.success}</p>
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={magicPending}
                    className="w-full bg-[#C8102E] hover:bg-[#9E0E24] text-white rounded-lg py-3 text-sm font-medium transition-colors disabled:opacity-50 mt-2"
                    style={oswald}
                  >
                    {magicPending ? 'Sending…' : 'Send Sign-in Link'}
                  </button>
                  <p className="text-xs text-[#3D5166] text-center">
                    We&apos;ll email you a one-click sign-in link.
                  </p>
                </form>
              )}

              {/* Google OAuth */}
              <div className="mt-5">
                <div className="relative flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-[#DDE4ED]" />
                  <span className="text-xs text-[#3D5166] tracking-widest shrink-0" style={oswald}>Or</span>
                  <div className="flex-1 h-px bg-[#DDE4ED]" />
                </div>
                <button
                  type="button"
                  onClick={signInWithGoogle}
                  className="w-full flex items-center justify-center gap-3 border border-[#DDE4ED] hover:border-[#456080] hover:bg-[#F5F7FA] rounded-lg py-3 text-sm text-[#0F1F33] transition-all"
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

              <div className="mt-5 pt-5 border-t border-[#DDE4ED] space-y-2 text-center">
                <p className="text-xs text-[#3D5166] tracking-widest mb-3" style={oswald}>New here?</p>
                <div className="flex gap-2">
                  <Link
                    href="/auth/signup"
                    className="flex-1 py-2.5 rounded-lg border border-[#DDE4ED] hover:border-[#C8102E]/50 hover:bg-[#F5F7FA] text-xs text-[#456080] hover:text-[#0F1F33] transition-all text-center"
                    style={oswald}
                  >
                    Coach Account
                  </Link>
                  <Link
                    href="/auth/signup"
                    className="flex-1 py-2.5 rounded-lg border border-[#DDE4ED] hover:border-[#C8102E]/50 hover:bg-[#F5F7FA] text-xs text-[#456080] hover:text-[#0F1F33] transition-all text-center"
                    style={oswald}
                  >
                    Player Account
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
