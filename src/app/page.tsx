import Link from 'next/link'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#060F1A] text-[#E8EDF5] overflow-x-hidden">

      {/* ── Nav ── */}
      <header className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 md:px-12 h-14" style={{ backgroundColor: 'rgba(6,15,26,0.9)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(28,58,92,0.4)' }}>
        <div className="flex items-center gap-2.5">
          <span className="text-base">⚾</span>
          <span className="text-sm tracking-[0.15em] text-[#E8EDF5]" style={oswald}>Release Point</span>
        </div>
        <nav className="flex items-center gap-2">
          <Link href="/auth/login" className="text-xs text-[#4A6880] hover:text-[#9FB3CC] transition-colors px-4 py-2" style={oswald}>Sign In</Link>
          <Link href="/auth/signup" className="text-xs bg-[#C8102E] hover:bg-[#A50D26] text-white px-5 py-2.5 rounded transition-colors" style={oswald}>Get Started</Link>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section className="relative flex flex-col items-center justify-center text-center min-h-screen px-6 pt-14">
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 80% 50% at 50% 60%, rgba(200,16,46,0.06) 0%, transparent 70%)' }} />

        <div className="relative max-w-5xl w-full">
          <p className="text-[11px] tracking-[0.3em] text-[#C8102E] mb-8" style={oswald}>The Coach's Film Room</p>
          <h1 className="text-[clamp(64px,12vw,140px)] leading-[0.88] mb-8 text-[#E8EDF5]" style={oswald}>
            See Every<br />Pitch<br /><span className="text-[#C8102E]">Differently.</span>
          </h1>
          <p className="text-base md:text-lg text-[#4A6880] max-w-lg mx-auto mb-10 leading-relaxed">
            Video analysis. Rapsodo metrics. AI coaching. One platform.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/auth/signup" className="w-full sm:w-auto px-10 py-4 bg-[#C8102E] hover:bg-[#A50D26] text-white text-sm rounded transition-colors" style={oswald}>
              Start Free — Coaches
            </Link>
            <Link href="/auth/login" className="w-full sm:w-auto px-10 py-4 border border-[#1C3A5C] hover:border-[#4A6880] text-[#4A6880] hover:text-[#9FB3CC] text-sm rounded transition-colors" style={oswald}>
              Player Login
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <div className="border-y border-[#1C3A5C]">
        <div className="max-w-4xl mx-auto px-6 grid grid-cols-3 divide-x divide-[#1C3A5C]">
          {[
            { n: '12U–18U', l: 'Age-adjusted benchmarks' },
            { n: 'Rapsodo', l: 'Native CSV support' },
            { n: 'AI', l: 'Built-in pitching coach' },
          ].map(s => (
            <div key={s.n} className="py-8 text-center px-4">
              <p className="text-2xl md:text-3xl text-[#E8EDF5] leading-none mb-1.5" style={oswald}>{s.n}</p>
              <p className="text-xs text-[#4A6880]">{s.l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Feature 1: Video ── */}
      <section className="max-w-6xl mx-auto px-6 py-28 md:py-36 grid md:grid-cols-2 gap-16 items-center">
        <div>
          <p className="text-[10px] tracking-[0.3em] text-[#C8102E] mb-6" style={oswald}>01 — Video Analysis</p>
          <h2 className="text-[clamp(40px,6vw,72px)] leading-[0.9] text-[#E8EDF5] mb-6" style={oswald}>
            Annotate<br />Every<br />Frame.
          </h2>
          <p className="text-sm text-[#4A6880] leading-relaxed max-w-sm">
            Draw directly on video. The point tracker follows arm angles, hip rotation, and release points — frame to frame, automatically.
          </p>
        </div>

        {/* Video mockup */}
        <div className="rounded-xl overflow-hidden border border-[#1C3A5C] bg-[#0B1E36]">
          {/* Fake video */}
          <div className="relative aspect-video bg-[#060F1A] overflow-hidden">
            {/* Field lines suggestion */}
            <div className="absolute inset-0 opacity-10" style={{ background: 'repeating-linear-gradient(135deg, #1C3A5C 0px, #1C3A5C 1px, transparent 1px, transparent 30px)' }} />
            {/* Annotation line */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 225" preserveAspectRatio="none">
              <line x1="80" y1="180" x2="300" y2="60" stroke="#C8102E" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="80" cy="180" r="5" fill="#C8102E" opacity="0.9" />
              <circle cx="300" cy="60" r="5" fill="#C8102E" opacity="0.9" />
              <circle cx="210" cy="120" r="8" fill="none" stroke="#3B82F6" strokeWidth="2" />
              <line x1="160" y1="140" x2="260" y2="90" stroke="#10B981" strokeWidth="1.5" strokeDasharray="4,3" strokeLinecap="round" />
            </svg>
            {/* Track point indicator */}
            <div className="absolute top-[38%] left-[52%] w-6 h-6 rounded-full border-2 border-[#3B82F6] flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-[#3B82F6]" />
            </div>
          </div>
          {/* Player controls bar */}
          <div className="px-4 py-3 flex items-center gap-3 border-t border-[#1C3A5C]">
            <div className="w-6 h-6 rounded-full bg-[#C8102E] flex items-center justify-center shrink-0">
              <span className="text-white text-[8px]">▶</span>
            </div>
            <div className="flex-1 h-1 bg-[#1C3A5C] rounded-full overflow-hidden">
              <div className="h-full w-1/3 bg-[#C8102E] rounded-full" />
            </div>
            <span className="text-[10px] text-[#4A6880] font-mono shrink-0">0:34 / 1:47</span>
          </div>
          {/* Tool bar */}
          <div className="px-4 py-2.5 flex items-center gap-2 border-t border-[#1C3A5C]">
            {['Line', 'Circle', 'Box', 'Free'].map((t, i) => (
              <span key={t} className={`text-[9px] px-2 py-1 rounded ${i === 0 ? 'bg-[#C8102E] text-white' : 'bg-[#060F1A] text-[#4A6880] border border-[#1C3A5C]'}`} style={oswald}>{t}</span>
            ))}
            <div className="ml-auto flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#C8102E]" />
              <div className="w-3 h-3 rounded-full bg-[#3B82F6]" />
              <div className="w-3 h-3 rounded-full bg-[#10B981]" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature 2: Rapsodo ── */}
      <section className="border-y border-[#1C3A5C] bg-[#0B1E36]">
        <div className="max-w-6xl mx-auto px-6 py-28 md:py-36 grid md:grid-cols-2 gap-16 items-center">
          {/* Metrics mockup */}
          <div className="rounded-xl border border-[#1C3A5C] bg-[#060F1A] overflow-hidden order-2 md:order-1">
            <div className="px-5 py-4 border-b border-[#1C3A5C] flex items-center justify-between">
              <span className="text-xs text-[#4A6880]" style={oswald}>Session · Sep 14, 2026</span>
              <span className="text-[10px] bg-green-900/30 text-green-400 px-2 py-0.5 rounded" style={oswald}>Rapsodo Connected</span>
            </div>
            {[
              { label: 'Velocity', value: '87', unit: 'mph', pct: 78, color: '#C8102E', pitch: '4-Seam Fastball' },
              { label: 'Spin Rate', value: '2,347', unit: 'rpm', pct: 65, color: '#3B82F6', pitch: '4-Seam Fastball' },
              { label: 'Spin Axis', value: '221', unit: '°', pct: 55, color: '#10B981', pitch: '4-Seam Fastball' },
              { label: 'H. Break', value: '8.2', unit: '"', pct: 70, color: '#8B5CF6', pitch: '4-Seam Fastball' },
              { label: 'V. Break', value: '16.4', unit: '"', pct: 85, color: '#F59E0B', pitch: '4-Seam Fastball' },
            ].map(m => (
              <div key={m.label} className="px-5 py-3.5 border-b border-[#0B1E36] last:border-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-[#4A6880]" style={oswald}>{m.label}</span>
                  <span className="text-sm text-[#E8EDF5] font-mono">{m.value}<span className="text-xs text-[#4A6880] ml-0.5">{m.unit}</span></span>
                </div>
                <div className="h-1 bg-[#1C3A5C] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${m.pct}%`, backgroundColor: m.color }} />
                </div>
              </div>
            ))}
            <div className="px-5 py-3 flex items-center justify-between bg-[#0B1E36]">
              <span className="text-[10px] text-[#4A6880]" style={oswald}>16U Benchmark</span>
              <span className="text-[10px] text-[#C8102E]" style={oswald}>Above Average ↑</span>
            </div>
          </div>

          <div className="order-1 md:order-2">
            <p className="text-[10px] tracking-[0.3em] text-[#C8102E] mb-6" style={oswald}>02 — Rapsodo</p>
            <h2 className="text-[clamp(40px,6vw,72px)] leading-[0.9] text-[#E8EDF5] mb-6" style={oswald}>
              Data That<br />Means<br />Something.
            </h2>
            <p className="text-sm text-[#4A6880] leading-relaxed max-w-sm">
              Import your Rapsodo CSV. Every metric — velocity, spin rate, axis, break — linked to the clip. Benchmarked against the player's age group, automatically.
            </p>
          </div>
        </div>
      </section>

      {/* ── Feature 3: AI ── */}
      <section className="max-w-6xl mx-auto px-6 py-28 md:py-36 grid md:grid-cols-2 gap-16 items-center">
        <div>
          <p className="text-[10px] tracking-[0.3em] text-[#C8102E] mb-6" style={oswald}>03 — AI Coach</p>
          <h2 className="text-[clamp(40px,6vw,72px)] leading-[0.9] text-[#E8EDF5] mb-6" style={oswald}>
            An Expert<br />In Every<br />Session.
          </h2>
          <p className="text-sm text-[#4A6880] leading-relaxed max-w-sm">
            The AI knows your player's age group, position, and Rapsodo data. Ask it anything. It cites real numbers — and says when it doesn't have data.
          </p>
        </div>

        {/* Chat mockup */}
        <div className="rounded-xl border border-[#1C3A5C] bg-[#0B1E36] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#1C3A5C] flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#C8102E]" />
            <span className="text-xs text-[#4A6880]" style={oswald}>AI Coach · Jake M · 16U · Pitcher</span>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex justify-end">
              <div className="max-w-[80%] bg-[#C8102E] rounded-xl rounded-br-sm px-4 py-2.5 text-xs text-white leading-relaxed">
                His curveball spin axis is at 55°. What does that mean for the break shape?
              </div>
            </div>
            <div className="flex justify-start">
              <div className="max-w-[85%] bg-[#060F1A] border border-[#1C3A5C] rounded-xl rounded-bl-sm px-4 py-3 text-xs text-[#9FB3CC] leading-relaxed">
                At 55° you&apos;ll see a strong 1-to-7 shape with moderate horizontal movement. At 2,347 rpm for a 16U pitcher that&apos;s <span className="text-[#E8EDF5]">above the age average</span> — elite by most standards. Mechanically, watch the pronation at release. That axis often comes from early supination in the grip.
              </div>
            </div>
            <div className="flex justify-end">
              <div className="max-w-[80%] bg-[#C8102E] rounded-xl rounded-br-sm px-4 py-2.5 text-xs text-white leading-relaxed">
                What drills would help improve spin efficiency?
              </div>
            </div>
            <div className="flex justify-start">
              <div className="max-w-[85%] bg-[#060F1A] border border-[#1C3A5C] rounded-xl rounded-bl-sm px-4 py-3 text-xs text-[#9FB3CC] leading-relaxed">
                <span className="text-[#E8EDF5]">Towel drill + spin axis work:</span> Focus on middle finger pressure at release. Wall spin drills at 60% effort first — don&apos;t chase velocity until the axis locks in.
              </div>
            </div>
          </div>
          <div className="px-4 py-3 border-t border-[#1C3A5C] flex gap-2">
            <div className="flex-1 bg-[#060F1A] border border-[#1C3A5C] rounded-lg px-3 py-2 text-xs text-[#4A6880]">Ask about this clip…</div>
            <button className="bg-[#C8102E] rounded-lg px-4 py-2 text-xs text-white" style={oswald}>Send</button>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="border-y border-[#1C3A5C] bg-[#0B1E36]">
        <div className="max-w-5xl mx-auto px-6 py-24 md:py-32">
          <div className="grid md:grid-cols-3 gap-12 md:gap-6">
            {[
              { n: '01', t: 'Create Your Program', d: 'Build teams by age group. Invite players by email.' },
              { n: '02', t: 'Upload & Analyze', d: 'Add clips, annotate mechanics, import Rapsodo CSVs.' },
              { n: '03', t: 'Players Get It', d: 'Everything you save is visible to the player instantly.' },
            ].map(s => (
              <div key={s.n} className="relative pl-6 border-l border-[#1C3A5C]">
                <p className="text-5xl text-[#C8102E] leading-none mb-4" style={oswald}>{s.n}</p>
                <p className="text-base text-[#E8EDF5] mb-2" style={oswald}>{s.t}</p>
                <p className="text-sm text-[#4A6880] leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Age groups ── */}
      <section className="max-w-4xl mx-auto px-6 py-20 text-center">
        <p className="text-[10px] tracking-[0.3em] text-[#4A6880] mb-4" style={oswald}>Built for every level</p>
        <div className="flex items-center justify-center flex-wrap gap-2">
          {['Youth', 'Middle School', 'High School', 'Amateur', 'Professional'].map(age => (
            <span key={age} className="px-5 py-2 rounded border border-[#1C3A5C] text-xs text-[#9FB3CC] hover:border-[#C8102E] hover:text-[#E8EDF5] transition-colors cursor-default" style={oswald}>{age}</span>
          ))}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="border-t border-[#1C3A5C] bg-[#0B1E36]">
        <div className="max-w-4xl mx-auto px-6 py-32 md:py-40 text-center">
          <h2 className="text-[clamp(48px,8vw,96px)] leading-[0.88] text-[#E8EDF5] mb-8" style={oswald}>
            Upgrade Your<br />Program<br /><span className="text-[#C8102E]">Today.</span>
          </h2>
          <Link href="/auth/signup" className="inline-block px-12 py-4 bg-[#C8102E] hover:bg-[#A50D26] text-white text-sm rounded transition-colors" style={oswald}>
            Get Started Free
          </Link>
          <p className="text-xs text-[#4A6880] mt-5">Free for coaches · No credit card required</p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[#1C3A5C] px-6 md:px-12 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span>⚾</span>
          <span className="text-xs text-[#4A6880]" style={oswald}>Release Point</span>
        </div>
        <div className="flex items-center gap-6 flex-wrap justify-center">
          <Link href="/auth/signup" className="text-xs text-[#4A6880] hover:text-[#9FB3CC] transition-colors" style={oswald}>Coach Sign Up</Link>
          <Link href="/auth/login" className="text-xs text-[#4A6880] hover:text-[#9FB3CC] transition-colors" style={oswald}>Player Login</Link>
          <Link href="/privacy" className="text-xs text-[#4A6880] hover:text-[#9FB3CC] transition-colors" style={oswald}>Privacy</Link>
          <Link href="/terms" className="text-xs text-[#4A6880] hover:text-[#9FB3CC] transition-colors" style={oswald}>Terms</Link>
        </div>
      </footer>

    </div>
  )
}
