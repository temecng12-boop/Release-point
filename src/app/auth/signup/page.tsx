'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import Logo from '@/components/Logo'
import { signUp, signUpPlayer } from '@/app/actions/auth'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

const inputClass =
  'w-full bg-white border border-[#DDE4ED] text-[#0F1F33] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#456080] focus:ring-1 focus:ring-[#456080]/20 placeholder:text-[#7A92A8] transition-colors'

function CoachForm({ onBack }: { onBack: () => void }) {
  const [state, action, pending] = useActionState(signUp, undefined)
  return (
    <form action={action} className="space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-xs text-[#7A92A8] hover:text-[#456080] transition-colors mb-2" style={oswald}>
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
      {state?.error && (
        <div className="bg-[#C8102E]/10 border border-[#C8102E]/30 rounded-lg px-4 py-3">
          <p className="text-sm text-[#C8102E]">{state.error}</p>
        </div>
      )}
      <button type="submit" disabled={pending} className="w-full bg-[#C8102E] hover:bg-[#9E0E24] text-white rounded-lg py-3 text-sm transition-colors disabled:opacity-50 mt-2" style={oswald}>
        {pending ? 'Creating Account…' : 'Create Coach Account'}
      </button>
    </form>
  )
}

function PlayerForm({ onBack }: { onBack: () => void }) {
  const [state, action, pending] = useActionState(signUpPlayer, undefined)
  return (
    <form action={action} className="space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-xs text-[#7A92A8] hover:text-[#456080] transition-colors mb-2" style={oswald}>
        ← Back
      </button>
      <div>
        <label className="block text-xs text-[#456080] mb-1.5 tracking-wide" style={oswald}>Full Name</label>
        <input type="text" name="full_name" required placeholder="Your name" className={inputClass} />
      </div>
      <div>
        <label className="block text-xs text-[#456080] mb-1.5 tracking-wide" style={oswald}>Email Address</label>
        <input type="email" name="email" required placeholder="your@email.com" className={inputClass} />
        <p className="text-[11px] text-[#7A92A8] mt-1.5">Use the same email your coach invited you with to auto-connect to your team.</p>
      </div>
      <div>
        <label className="block text-xs text-[#456080] mb-1.5 tracking-wide" style={oswald}>Password</label>
        <input type="password" name="password" required minLength={8} placeholder="Minimum 8 characters" className={inputClass} />
      </div>
      {state?.error && (
        <div className="bg-[#C8102E]/10 border border-[#C8102E]/30 rounded-lg px-4 py-3">
          <p className="text-sm text-[#C8102E]">{state.error}</p>
        </div>
      )}
      <button type="submit" disabled={pending} className="w-full bg-[#C8102E] hover:bg-[#9E0E24] text-white rounded-lg py-3 text-sm transition-colors disabled:opacity-50 mt-2" style={oswald}>
        {pending ? 'Creating Account…' : 'Create Player Account'}
      </button>
    </form>
  )
}

function RoleSelect({ onSelect }: { onSelect: (role: 'coach' | 'player') => void }) {
  return (
    <div className="space-y-4">
      <div className="mb-7">
        <h1 className="text-xl text-[#0F1F33] mb-1" style={oswald}>Join Release Point</h1>
        <p className="text-sm text-[#7A92A8]">Are you a coach or a player?</p>
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
        <p className="text-xs text-[#7A92A8] leading-relaxed">Manage your roster, upload and annotate clips, import Rapsodo metrics, and track player development.</p>
        <div className="mt-3 flex gap-1.5 flex-wrap">
          {['Teams', 'Video Analysis', 'Rapsodo', 'AI Coach'].map((t) => (
            <span key={t} className="text-[10px] px-2 py-0.5 bg-white border border-[#DDE4ED] text-[#7A92A8] rounded" style={oswald}>{t}</span>
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
        <p className="text-xs text-[#7A92A8] leading-relaxed">Review your clips and coach annotations, track your pitch metrics, and follow your progress over time.</p>
        <div className="mt-3 flex gap-1.5 flex-wrap">
          {['Clip Review', 'Metrics', 'Coach Feedback'].map((t) => (
            <span key={t} className="text-[10px] px-2 py-0.5 bg-white border border-[#DDE4ED] text-[#7A92A8] rounded" style={oswald}>{t}</span>
          ))}
        </div>
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

              <div className="mt-6 pt-5 border-t border-[#DDE4ED] text-center">
                <p className="text-sm text-[#7A92A8]">
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
