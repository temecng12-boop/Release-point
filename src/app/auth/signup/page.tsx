'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import Logo from '@/components/Logo'
import { signUp, signUpPlayer } from '@/app/actions/auth'
import { createClient } from '@/lib/supabase/client'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

const inputCls = [
  'w-full rounded-lg px-4 py-3 text-sm text-slate-900 transition-all',
  'focus:outline-none placeholder:text-slate-300',
  'bg-white border border-slate-200 focus:border-slate-400 focus:ring-1 focus:ring-slate-200',
].join(' ')

function CoachForm({ onBack }: { onBack: () => void }) {
  const [state, action, pending] = useActionState(signUp, undefined)
  const [tosAccepted, setTosAccepted] = useState(false)
  return (
    <form action={action} className="space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700 transition-colors mb-2" style={os}>
        ← Back
      </button>
      <div>
        <label className="block text-[11px] text-slate-500 mb-1.5 tracking-[0.2em]" style={os}>Full Name</label>
        <input type="text" name="full_name" required placeholder="Coach name" className={inputCls} />
      </div>
      <div>
        <label className="block text-[11px] text-slate-500 mb-1.5 tracking-[0.2em]" style={os}>Email Address</label>
        <input type="email" name="email" required placeholder="coach@example.com" className={inputCls} />
      </div>
      <div>
        <label className="block text-[11px] text-slate-500 mb-1.5 tracking-[0.2em]" style={os}>Password</label>
        <input type="password" name="password" required minLength={8} placeholder="Minimum 8 characters" className={inputCls} />
      </div>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          name="tos"
          checked={tosAccepted}
          onChange={(e) => setTosAccepted(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-[#E8102A] shrink-0"
        />
        <span className="text-xs text-slate-500 leading-relaxed">
          I agree to the{' '}
          <a href="/terms" target="_blank" className="text-slate-700 hover:text-slate-900 hover:underline">Terms of Service</a>
          {' '}and{' '}
          <a href="/privacy" target="_blank" className="text-slate-700 hover:text-slate-900 hover:underline">Privacy Policy</a>
        </span>
      </label>
      {state?.error && (
        <div className="rounded-lg px-4 py-3" style={{ background: 'rgba(232,16,42,0.06)', border: '1px solid rgba(232,16,42,0.2)' }}>
          <p className="text-sm text-[#E8102A]">{state.error}</p>
        </div>
      )}
      <button
        type="submit"
        disabled={pending || !tosAccepted}
        className="w-full bg-slate-950 hover:bg-slate-800 active:scale-95 text-white rounded-lg py-3 text-sm transition-all disabled:opacity-40 mt-2"
        style={os}
      >
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
        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto bg-slate-100">
          <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <p className="text-sm text-slate-950 mb-1 tracking-tight" style={os}>Check Your Email</p>
          <p className="text-xs text-slate-500 leading-relaxed">We sent a sign-in link to <strong className="text-slate-700">{state.email}</strong>. Click it to finish setting up your account.</p>
        </div>
        <button type="button" onClick={onBack} className="text-xs text-slate-400 hover:text-slate-700 transition-colors" style={os}>
          ← Back
        </button>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700 transition-colors mb-2" style={os}>
        ← Back
      </button>
      <div>
        <label className="block text-[11px] text-slate-500 mb-1.5 tracking-[0.2em]" style={os}>Full Name</label>
        <input type="text" name="full_name" required placeholder="Your name" className={inputCls} />
      </div>
      <div>
        <label className="block text-[11px] text-slate-500 mb-1.5 tracking-[0.2em]" style={os}>Email Address</label>
        <input type="email" name="email" required placeholder="your@email.com" className={inputCls} />
        <p className="text-[11px] text-slate-400 mt-1.5">Use the same email your coach invited you with to auto-connect to your team.</p>
      </div>
      {state?.error && (
        <div className="rounded-lg px-4 py-3" style={{ background: 'rgba(232,16,42,0.06)', border: '1px solid rgba(232,16,42,0.2)' }}>
          <p className="text-sm text-[#E8102A]">{state.error}</p>
        </div>
      )}
      <p className="text-[11px] text-slate-400 leading-relaxed">
        By continuing you agree to our{' '}
        <a href="/terms" target="_blank" className="text-slate-600 hover:underline">Terms of Service</a>
        {' '}and consent to video storage for coaching purposes.
      </p>
      <button
        type="submit"
        disabled={pending}
        className="w-full bg-slate-950 hover:bg-slate-800 active:scale-95 text-white rounded-lg py-3 text-sm transition-all disabled:opacity-40 mt-2"
        style={os}
      >
        {pending ? 'Sending Link…' : 'Send Sign-in Link'}
      </button>
    </form>
  )
}

function RoleSelect({ onSelect }: { onSelect: (role: 'coach' | 'player') => void }) {
  return (
    <div className="space-y-4">
      <div className="mb-7">
        <h1 className="text-xl text-slate-950 mb-1 tracking-tighter" style={os}>Join Release Point</h1>
        <p className="text-sm text-slate-500">Are you a coach or a player?</p>
      </div>

      {[
        {
          role: 'coach' as const,
          title: 'Coach',
          desc: 'Manage your roster, upload and annotate clips, import Rapsodo metrics, and track player development.',
          tags: ['Teams', 'Video Analysis', 'Rapsodo', 'AI Coach'],
        },
        {
          role: 'player' as const,
          title: 'Player',
          desc: 'Review your clips and coach annotations, track your pitch metrics, and follow your progress over time.',
          tags: ['Clip Review', 'Metrics', 'Coach Feedback'],
        },
      ].map(item => (
        <button
          key={item.role}
          type="button"
          onClick={() => onSelect(item.role)}
          className="w-full group text-left rounded-xl p-5 transition-all hover:bg-slate-50"
          style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-800 tracking-tight" style={os}>{item.title}</span>
            <span className="text-xs text-[#E8102A] opacity-0 group-hover:opacity-100 transition-opacity" style={os}>Get Started →</span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed mb-3">{item.desc}</p>
          <div className="flex gap-1.5 flex-wrap">
            {item.tags.map((t) => (
              <span key={t} className="text-[10px] px-2 py-0.5 rounded text-slate-500"
                style={{ ...os, background: '#f1f5f9', border: '1px solid #e2e8f0' }}>
                {t}
              </span>
            ))}
          </div>
        </button>
      ))}
    </div>
  )
}

function OAuthButtons() {
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
  return (
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
  )
}

export default function SignupPage() {
  const [role, setRole] = useState<'coach' | 'player' | null>(null)

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
          <div className="space-y-6">
            {[
              { n: '01', title: 'Video Analysis', desc: 'Frame-by-frame mechanics breakdown with canvas annotation tools' },
              { n: '02', title: 'Rapsodo',         desc: 'Import pitch metrics — velocity, spin, break — benchmarked automatically' },
              { n: '03', title: 'AI Coach',         desc: 'Data-backed analysis tied to your player\'s age group and real numbers' },
              { n: '04', title: 'Team Management', desc: 'Organize players by team and age group, share clips instantly' },
            ].map((f) => (
              <div key={f.title} className="flex gap-4 pl-4" style={{ borderLeft: '2px solid #e2e8f0' }}>
                <div>
                  <p className="text-[10px] text-[#E8102A] mb-1 tracking-[0.2em]" style={os}>{f.n}</p>
                  <p className="text-sm text-slate-800 mb-0.5 tracking-tight" style={os}>{f.title}</p>
                  <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
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
              {role === null && <RoleSelect onSelect={setRole} />}
              {role === 'coach'  && <CoachForm  onBack={() => setRole(null)} />}
              {role === 'player' && <PlayerForm onBack={() => setRole(null)} />}

              {role === null && <OAuthButtons />}

              <div className="mt-5 pt-5 text-center" style={{ borderTop: '1px solid #e2e8f0' }}>
                <p className="text-sm text-slate-500">
                  Already have an account?{' '}
                  <Link href="/auth/login" className="text-slate-800 hover:text-slate-950 transition-colors font-medium">
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
