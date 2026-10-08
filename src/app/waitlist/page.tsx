import WaitlistForm from './waitlist-form'
import Logo from '@/components/Logo'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export const metadata = { title: 'Join the Waitlist' }

export default async function WaitlistPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen bg-white flex flex-col">

      {/* Nav */}
      <header className="px-6 md:px-12 h-14 flex items-center justify-between border-b border-[#e2e8f0]">
        <Logo size="md" wordmarkClass="inline" href="/" />
        <nav className="flex items-center gap-3">
          <Link href="/" className="text-xs text-[#456080] hover:text-[#0F1F33] transition-colors" style={os}>← Home</Link>
          {user ? (
            <Link href="/dashboard" className="text-xs bg-[#E8102A] hover:bg-[#C80E24] text-white px-4 py-1.5 rounded-lg transition-colors" style={os}>Dashboard</Link>
          ) : (
            <Link href="/auth/login" className="text-xs text-[#456080] hover:text-[#0F1F33] transition-colors" style={os}>Sign In</Link>
          )}
        </nav>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">

        {/* Badge */}
        <div
          className="inline-flex items-center gap-2 mb-8 px-3 py-1.5 rounded-full border text-[10px] tracking-[0.25em]"
          style={{ ...os, borderColor: 'rgba(200,16,46,0.4)', color: '#C8102E', background: 'rgba(200,16,46,0.06)' }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#C8102E] animate-pulse" />
          Coming Soon
        </div>

        {/* Headline */}
        <h1
          className="text-4xl sm:text-5xl md:text-6xl text-[#0F1F33] text-center leading-tight mb-4 max-w-2xl"
          style={os}
        >
          Coaching that moves<br />
          <span className="text-[#C8102E]">at the speed of the game.</span>
        </h1>

        <p className="text-[#456080] text-sm sm:text-base text-center max-w-md mb-10 leading-relaxed">
          Release Point gives coaches and players a professional-grade film room: frame-by-frame analysis,
          drawing tools, and instant feedback, built for baseball.
        </p>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-2 mb-12">
          {[
            'Frame-by-frame playback',
            'Live coach annotations',
            'Timestamp feedback',
            'Side-by-side compare',
            'Pitch metrics',
            'AI coaching assistant',
          ].map(f => (
            <span
              key={f}
              className="text-[10px] tracking-wider px-3 py-1 rounded-full"
              style={{ ...os, background: '#F0F4F8', color: '#456080', border: '1px solid #DDE4ED' }}
            >
              {f}
            </span>
          ))}
        </div>

        {/* Form card */}
        <div
          className="w-full max-w-md rounded-2xl p-8"
          style={{ background: '#F8FAFC', border: '1px solid #DDE4ED' }}
        >
          <p className="text-[#0F1F33] text-sm font-medium mb-1" style={os}>Get early access</p>
          <p className="text-[#456080] text-xs mb-6">Be first in line. We&apos;ll reach out when your spot is ready.</p>
          <WaitlistForm />
        </div>

        {/* Social proof */}
        <p className="mt-8 text-[#8096AE] text-xs tracking-wider" style={os}>
          Built by coaches. Trusted by players.
        </p>
      </main>

      {/* Footer */}
      <footer className="px-6 py-5 text-center border-t border-[#e2e8f0]">
        <p className="text-[#8096AE] text-xs">&copy; {new Date().getFullYear()} Release Point. All rights reserved.</p>
      </footer>
    </div>
  )
}
