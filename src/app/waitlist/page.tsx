import WaitlistForm from './waitlist-form'
import Logo from '@/components/Logo'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export const metadata = { title: 'Join the Waitlist — Release Point' }

export default function WaitlistPage() {
  return (
    <div className="min-h-screen bg-[#0F1F33] flex flex-col">

      {/* Nav */}
      <header className="px-6 md:px-12 h-14 flex items-center">
        <Logo size="md" wordmarkClass="inline" dark />
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">

        {/* Badge */}
        <div
          className="inline-flex items-center gap-2 mb-8 px-3 py-1.5 rounded-full border text-[10px] tracking-[0.25em]"
          style={{ ...os, borderColor: 'rgba(200,16,46,0.4)', color: '#C8102E', background: 'rgba(200,16,46,0.08)' }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#C8102E] animate-pulse" />
          Coming Soon
        </div>

        {/* Headline */}
        <h1
          className="text-4xl sm:text-5xl md:text-6xl text-white text-center leading-tight mb-4 max-w-2xl"
          style={os}
        >
          Coaching that moves<br />
          <span className="text-[#C8102E]">at the speed of the game.</span>
        </h1>

        <p className="text-[#8096AE] text-sm sm:text-base text-center max-w-md mb-10 leading-relaxed">
          Release Point gives coaches and players a professional-grade film room — frame-by-frame analysis,
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
              style={{ ...os, background: 'rgba(255,255,255,0.06)', color: '#AAB8C8', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {f}
            </span>
          ))}
        </div>

        {/* Form card */}
        <div
          className="w-full max-w-md rounded-2xl p-8"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <p className="text-white text-sm font-medium mb-1" style={os}>Get early access</p>
          <p className="text-[#8096AE] text-xs mb-6">Be first in line. We'll reach out when your spot is ready.</p>
          <WaitlistForm />
        </div>

        {/* Social proof */}
        <p className="mt-8 text-[#3D5166] text-xs tracking-wider" style={os}>
          Built by coaches. Trusted by players.
        </p>
      </main>

      {/* Footer */}
      <footer className="px-6 py-5 text-center">
        <p className="text-[#3D5166] text-xs">© {new Date().getFullYear()} Release Point. All rights reserved.</p>
      </footer>
    </div>
  )
}
