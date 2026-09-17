'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { signUp } from '@/app/actions/auth'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

const inputClass =
  'w-full bg-[#060F1A] border border-[#1C3A5C] text-[#E8EDF5] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#9FB3CC] focus:ring-1 focus:ring-[#9FB3CC]/20 placeholder:text-[#4A6880] transition-colors'

export default function SignupPage() {
  const [state, action, pending] = useActionState(signUp, undefined)

  if (state?.message) {
    return (
      <div className="min-h-screen bg-[#060F1A] flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="bg-[#0B1E36] border border-[#1C3A5C] rounded-xl shadow-2xl overflow-hidden">
            <div className="h-1 bg-[#C8102E]" />
            <div className="p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-green-900/30 border border-green-800/50 flex items-center justify-center mx-auto mb-4">
                <span className="text-green-400 text-xl">✓</span>
              </div>
              <h2 className="text-lg text-[#E8EDF5] mb-2" style={oswald}>
                Check Your Email
              </h2>
              <p className="text-sm text-[#9FB3CC]">{state.message}</p>
              <Link
                href="/auth/login"
                className="mt-6 inline-block text-sm text-[#C8102E] hover:text-red-400 transition-colors"
              >
                ← Back to sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#060F1A] flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] shrink-0 bg-[#0B1E36] border-r border-[#1C3A5C] p-10">
        <div>
          <div className="flex items-center gap-3 mb-12">
            <span className="text-2xl">⚾</span>
            <span className="text-xl text-white tracking-widest" style={oswald}>
              Release Point
            </span>
          </div>
          <div className="space-y-6">
            {[
              { n: '01', title: 'Video Analysis', desc: 'Frame-by-frame mechanics breakdown with canvas annotation tools' },
              { n: '02', title: 'Rapsodo', desc: 'Import pitch metrics — velocity, spin, break — benchmarked automatically' },
              { n: '03', title: 'AI Coach', desc: 'Data-backed analysis tied to your player\'s age group and real numbers' },
              { n: '04', title: 'Team Management', desc: 'Organize players by team and age group, share clips instantly' },
            ].map((f) => (
              <div key={f.title} className="flex gap-4 pl-4 border-l border-[#1C3A5C]">
                <div>
                  <p className="text-[10px] text-[#C8102E] mb-1 tracking-[0.2em]" style={oswald}>{f.n}</p>
                  <p className="text-sm text-[#E8EDF5] mb-0.5" style={oswald}>{f.title}</p>
                  <p className="text-xs text-[#4A6880] leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-[#1C3A5C]">
          Release Point — Pitching &amp; hitting mechanics analyzer
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 justify-center mb-8">
            <span className="text-2xl">⚾</span>
            <span className="text-xl text-white tracking-widest" style={oswald}>
              Release Point
            </span>
          </div>

          <div className="bg-[#0B1E36] border border-[#1C3A5C] rounded-xl shadow-2xl overflow-hidden">
            <div className="h-1 bg-[#C8102E]" />
            <div className="p-8">
              <div className="mb-7">
                <h1 className="text-xl text-[#E8EDF5] mb-1" style={oswald}>
                  Create Coach Account
                </h1>
                <p className="text-sm text-[#4A6880]">
                  You&apos;ll be able to invite players and organize teams after signing in.
                </p>
              </div>

              <form action={action} className="space-y-4">
                <div>
                  <label className="block text-xs text-[#9FB3CC] mb-1.5 tracking-wide" style={oswald}>
                    Full Name
                  </label>
                  <input
                    type="text"
                    name="full_name"
                    required
                    placeholder="Coach name"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#9FB3CC] mb-1.5 tracking-wide" style={oswald}>
                    Email Address
                  </label>
                  <input
                    type="email"
                    name="email"
                    required
                    placeholder="coach@example.com"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#9FB3CC] mb-1.5 tracking-wide" style={oswald}>
                    Password
                  </label>
                  <input
                    type="password"
                    name="password"
                    required
                    minLength={8}
                    placeholder="Minimum 8 characters"
                    className={inputClass}
                  />
                </div>

                {state?.error && (
                  <div className="bg-[#C8102E]/10 border border-[#C8102E]/30 rounded-lg px-4 py-3">
                    <p className="text-sm text-[#C8102E]">{state.error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={pending}
                  className="w-full bg-[#C8102E] hover:bg-[#9E0E24] text-white rounded-lg py-3 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                  style={oswald}
                >
                  {pending ? 'Creating Account…' : 'Create Coach Account'}
                </button>
              </form>

              <div className="mt-6 pt-5 border-t border-[#1C3A5C] text-center">
                <p className="text-sm text-[#4A6880]">
                  Already have an account?{' '}
                  <Link href="/auth/login" className="text-[#9FB3CC] hover:text-white transition-colors font-medium">
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
