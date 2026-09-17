'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { signIn } from '@/app/actions/auth'
import { createClient } from '@/lib/supabase/client'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }
const inputClass = 'w-full bg-[#060F1A] border border-[#1C3A5C] text-[#E8EDF5] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#9FB3CC] focus:ring-1 focus:ring-[#9FB3CC]/20 placeholder:text-[#4A6880] transition-colors'

export default function LoginPage() {
  const [state, action, pending] = useActionState(signIn, undefined)
  const [magicMode, setMagicMode]   = useState(false)
  const [magicEmail, setMagicEmail] = useState('')
  const [magicState, setMagicState] = useState<{ error?: string; success?: string }>({})
  const [magicPending, setMagicPending] = useState(false)

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
    <div className="min-h-screen bg-[#060F1A] flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] shrink-0 bg-[#0B1E36] border-r border-[#1C3A5C] p-10">
        <div>
          <div className="flex items-center gap-3 mb-12">
            <span className="text-2xl">⚾</span>
            <span className="text-xl text-white tracking-widest" style={oswald}>Release Point</span>
          </div>
          <div className="space-y-8">
            <div>
              <p className="text-3xl text-[#E8EDF5] leading-tight mb-3" style={oswald}>
                Welcome Back.
              </p>
              <p className="text-sm text-[#4A6880] leading-relaxed">
                Your clips, metrics, and player feedback are waiting.
              </p>
            </div>
            <div className="border-t border-[#1C3A5C] pt-8 space-y-5">
              <p className="text-xs text-[#4A6880] tracking-widest" style={oswald}>Sign in as</p>
              <div>
                <p className="text-sm text-[#E8EDF5] mb-1" style={oswald}>Coach</p>
                <p className="text-xs text-[#4A6880]">Use your email and password on the right.</p>
              </div>
              <div>
                <p className="text-sm text-[#E8EDF5] mb-1" style={oswald}>Player</p>
                <p className="text-xs text-[#4A6880]">Switch to the Email Link tab — your coach sent you an invite link to get started.</p>
              </div>
            </div>
          </div>
        </div>
        <p className="text-xs text-[#1C3A5C]">Release Point — Pitching &amp; hitting mechanics analyzer</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 justify-center mb-8">
            <span className="text-2xl">⚾</span>
            <span className="text-xl text-white tracking-widest" style={oswald}>Release Point</span>
          </div>

          <div className="bg-[#0B1E36] border border-[#1C3A5C] rounded-xl shadow-2xl overflow-hidden">
            <div className="h-1 bg-[#C8102E]" />
            <div className="p-8">
              <div className="mb-6">
                <h1 className="text-xl text-[#E8EDF5] mb-1" style={oswald}>Sign In</h1>
                <p className="text-sm text-[#4A6880]">Coaches use password · Players use email link</p>
              </div>

              {/* Mode toggle */}
              <div className="flex bg-[#060F1A] border border-[#1C3A5C] rounded-lg p-1 mb-6 gap-1">
                <button
                  onClick={() => setMagicMode(false)}
                  className={`flex-1 py-2 rounded-md text-xs transition-colors ${
                    !magicMode
                      ? 'bg-[#0B1E36] text-[#E8EDF5] border border-[#1C3A5C]'
                      : 'text-[#4A6880] hover:text-[#9FB3CC]'
                  }`}
                  style={oswald}
                >
                  Password
                </button>
                <button
                  onClick={() => setMagicMode(true)}
                  className={`flex-1 py-2 rounded-md text-xs transition-colors ${
                    magicMode
                      ? 'bg-[#0B1E36] text-[#E8EDF5] border border-[#1C3A5C]'
                      : 'text-[#4A6880] hover:text-[#9FB3CC]'
                  }`}
                  style={oswald}
                >
                  Email Link
                </button>
              </div>

              {!magicMode ? (
                <form action={action} className="space-y-4">
                  <div>
                    <label className="block text-xs text-[#9FB3CC] mb-1.5 tracking-wide" style={oswald}>Email Address</label>
                    <input type="email" name="email" required placeholder="coach@example.com" className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs text-[#9FB3CC] mb-1.5 tracking-wide" style={oswald}>Password</label>
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
                    <label className="block text-xs text-[#9FB3CC] mb-1.5 tracking-wide" style={oswald}>Your Invite Email</label>
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
                  <p className="text-xs text-[#4A6880] text-center">
                    We&apos;ll email you a one-click sign-in link.
                  </p>
                </form>
              )}

              <div className="mt-6 pt-5 border-t border-[#1C3A5C] text-center">
                <p className="text-sm text-[#4A6880]">
                  Need a coach account?{' '}
                  <Link href="/auth/signup" className="text-[#9FB3CC] hover:text-white transition-colors font-medium">
                    Sign up free
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
