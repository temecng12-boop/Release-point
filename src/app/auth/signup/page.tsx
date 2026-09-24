'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import Logo from '@/components/Logo'
import { signUp, signUpPlayer } from '@/app/actions/auth'
import { createClient } from '@/lib/supabase/client'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

const inputClass =
  'w-full bg-white border border-[#DDE4ED] text-[#0F1F33] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#456080] focus:ring-1 focus:ring-[#456080]/20 placeholder:text-[#3D5166] transition-colors'

function CoachForm({ onBack }: { onBack: () => void }) {
  const [state, action, pending] = useActionState(signUp, undefined)
  const [tosAccepted, setTosAccepted] = useState(false)
  return (
    <form action={action} className="space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-xs text-[#3D5166] hover:text-[#456080] transition-colors mb-2" style={oswald}>
        ← Back
      </button>
      <div>
        <label className="block text-xs text-[#456080] mb-1.5 tracking-wide" style={oswald}>Full Name</label>
        <input type="text" name="full_name" required placeholder="Coach name" className={inputClass} />
      </div>
      <div>
        <label className="block text-xs text-[#456080] mb-1.5 tracking-wide" style={oswald}>Email Address</label>
        <input type="email" name="email" required placeholder="coach@example.com" className={inputClass} />
      </div>
      <div>
        <label className="block text-xs text-[#456080] mb-1.5 tracking-wide" style={oswald}>Password</label>
        <input type="password" name="password" required minLength={8} placeholder="Minimum 8 characters" className={inputClass} />
      </div>
      <label className="flex items-start gap-3 cursor-pointer group">
        <input
          type="checkbox"
          name="tos"
          checked={tosAccepted}
          onChange={(e) => setTosAccepted(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-[#C8102E] shrink-0"
        />
        <span className="text-xs text-[#456080] leading-relaxed">
          I agree to the{' '}
          <a href="/terms" target="_blank" className="text-[#1C3A5C] hover:underline">Terms of Service</a>
          {' '}and{' '}
          <a href="/privacy" target="_blank" className="text-[#1C3A5C] hover:underline">Privacy Policy</a>
        </span>
      </label>
      {state?.error && (
        <div className="bg-[#C8102E]/10 border border-[#C8102E]/30 rounded-lg px-4 py-3">
          <p className="text-sm text-[#C8102E]">{state.error}</p>
        </div>
      )}
      <button type="submit" disabled={pending || !tosAccepted} className="w-full bg-[#C8102E] hover:bg-[#9E0E24] text-white rounded-lg py-3 text-sm transition-colors disabled:opacity-50 mt-2" style={oswald}>
        {pending ? 'Creating Account…' : 'Create Coach Account'}
      </button>
    </form>
  )
}

function PlayerForm({ onBack }: { onBack: () => void }) {
  const [state, action, pending] = useActionState(signUpPlayer, undefined)

  if (state?.sent) {
    return (
      <div className="text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-[#EEF2F7] flex items-center justify-center mx-auto">
          <svg className="w-6 h-6 text-[#1C3A5C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <p className="text-sm text-[#0F1F33] mb-1" style={oswald}>Check Your Email</p>
          <p className="text-xs text-[#3D5166] leading-relaxed">We sent a sign-in link to <strong>{state.email}</strong>. Click it to finish setting up your account.</p>
        </div>
        <button type="button" onClick={onBack} className="text-xs text-[#3D5166] hover:text-[#456080] transition-colors" style={oswald}>
          ← Back
        </button>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-xs text-[#3D5166] hover:text-[#456080] transition-colors mb-2" style={oswald}>
        ← Back
      </button>
      <div>
        <label className="block text-xs text-[#456080] mb-1.5 tracking-wide" style={oswald}>Full Name</label>
        <input type="text" name="full_name" required placeholder="Your name" className={inputClass} />
      </div>
      <div>
        <label className="block text-xs text-[#456080] mb-1.5 tracking-wide" style={oswald}>Email Address</label>
        <input type="email" name="email" required placeholder="your@email.com" className={inputClass} />
        <p className="text-[11px] text-[#3D5166] mt-1.5">Use the same email your coach invited you with to auto-connect to your team.</p>
      </div>
      {state?.error && (
        <div className="bg-[#C8102E]/10 border border-[#C8102E]/30 rounded-lg px-4 py-3">
          <p className="text-sm text-[#C8102E]">{state.error}</p>
        </div>
      )}
      <p className="text-[11px] text-[#3D5166] leading-relaxed">
        By continuing you agree to our{' '}
        <a href="/terms" target="_blank" className="text-[#1C3A5C] hover:underline">Terms of Service</a>
        {' '}and consent to video storage for coaching purposes.
      </p>
      <button type="submit" disabled={pending} className="w-full bg-[#C8102E] hover:bg-[#9E0E24] text-white rounded-lg py-3 text-sm transition-colors disabled:opacity-50 mt-2" style={oswald}>
        {pending ? 'Sending Link…' : 'Send Sign-in Link'}
      </button>
    </form>
  )
}

function RoleSelect({ onSelect }: { onSelect: (role: 'coach' | 'player') => void }) {
  return (
    <div className="space-y-4">
      <div className="mb-7">
        <h1 className="text-xl text-[#0F1F33] mb-1" style={oswald}>Join Release Point</h1>
        <p className="text-sm text-[#3D5166]">Are you a coach or a player?</p>
      </div>

      <button
        type="button"
        onClick={() => onSelect('coach')}
        className="w-full group text-left bg-[#F5F7FA] border border-[#DDE4ED] hover:border-[#C8102E]/60 hover:bg-[#EEF2F7] rounded-xl p-5 transition-all"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-[#0F1F33]" style={oswald}>Coach</span>
          <span className="text-xs text-[#C8102E] opacity-0 group-hover:opacity-100 transition-opacity" style={oswald}>Get Started →</span>
        </div>
        <p className="text-xs text-[#3D5166] leading-relaxed">Manage your roster, upload and annotate clips, import Rapsodo metrics, and track player development.</p>
        <div className="mt-3 flex gap-1.5 flex-wrap">
          {['Teams', 'Video Analysis', 'Rapsodo', 'AI Coach'].map((t) => (
            <span key={t} className="text-[10px] px-2 py-0.5 bg-white border border-[#DDE4ED] text-[#3D5166] rounded" style={oswald}>{t}</span>
          ))}
        </div>
      </button>

      <button
        type="button"
        onClick={() => onSelect('player')}
        className="w-full group text-left bg-[#F5F7FA] border border-[#DDE4ED] hover:border-[#C8102E]/60 hover:bg-[#EEF2F7] rounded-xl p-5 transition-all"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-[#0F1F33]" style={oswald}>Player</span>
          <span className="text-xs text-[#C8102E] opacity-0 group-hover:opacity-100 transition-opacity" style={oswald}>Get Started →</span>
        </div>
        <p className="text-xs text-[#3D5166] leading-relaxed">Review your clips and coach annotations, track your pitch metrics, and follow your progress over time.</p>
        <div className="mt-3 flex gap-1.5 flex-wrap">
          {['Clip Review', 'Metrics', 'Coach Feedback'].map((t) => (
            <span key={t} className="text-[10px] px-2 py-0.5 bg-white border border-[#DDE4ED] text-[#3D5166] rounded" style={oswald}>{t}</span>
          ))}
        </div>
      </button>
    </div>
  )
}

function GoogleButton() {
  async function signInWithGoogle() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }
  return (
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
  )
}

export default function SignupPage() {
  const [role, setRole] = useState<'coach' | 'player' | null>(null)

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] shrink-0 bg-[#1C3A5C] border-r border-[#1C3A5C] p-10">
        <div>
          <div className="mb-12">
            <Logo size="md" wordmarkClass="inline" />
          </div>
          <div className="space-y-6">
            {[
              { n: '01', title: 'Video Analysis', desc: 'Frame-by-frame mechanics breakdown with canvas annotation tools' },
              { n: '02', title: 'Rapsodo', desc: 'Import pitch metrics — velocity, spin, break — benchmarked automatically' },
              { n: '03', title: 'AI Coach', desc: 'Data-backed analysis tied to your player\'s age group and real numbers' },
              { n: '04', title: 'Team Management', desc: 'Organize players by team and age group, share clips instantly' },
            ].map((f) => (
              <div key={f.title} className="flex gap-4 pl-4 border-l border-white/20">
                <div>
                  <p className="text-[10px] text-[#C8102E] mb-1 tracking-[0.2em]" style={oswald}>{f.n}</p>
                  <p className="text-sm text-white mb-0.5" style={oswald}>{f.title}</p>
                  <p className="text-xs text-[#B8D0E8] leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-white/40">Release Point — Pitching &amp; hitting mechanics analyzer</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex justify-center mb-8">
            <Logo size="md" wordmarkClass="inline" />
          </div>

          <div className="bg-white border border-[#DDE4ED] rounded-xl shadow-sm overflow-hidden">
            <div className="h-1 bg-[#C8102E]" />
            <div className="p-8">
              {role === null && <RoleSelect onSelect={setRole} />}
              {role === 'coach' && <CoachForm onBack={() => setRole(null)} />}
              {role === 'player' && <PlayerForm onBack={() => setRole(null)} />}

              {role === null && <GoogleButton />}

              <div className="mt-5 pt-5 border-t border-[#DDE4ED] text-center">
                <p className="text-sm text-[#3D5166]">
                  Already have an account?{' '}
                  <Link href="/auth/login" className="text-[#1C3A5C] hover:text-[#0F1F33] transition-colors font-medium">
                    Sign in
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
