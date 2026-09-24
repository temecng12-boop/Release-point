import Link from 'next/link'
import Logo from '@/components/Logo'
import SiteFooter from '@/components/SiteFooter'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#F5F7FA] text-[#0F1F33] overflow-x-hidden">

      {/* ── Nav ── */}
      <header
        className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 md:px-12 h-14"
        style={{ backgroundColor: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(20px)', borderBottom: '1px solid #DDE4ED' }}
      >
        <Logo size="md" wordmarkClass="inline" />
        <nav className="flex items-center gap-1">
          <Link href="/auth/login" className="text-xs text-[#3D5166] hover:text-[#456080] transition-colors px-4 py-2" style={oswald}>Sign In</Link>
          <Link href="/auth/signup" className="text-xs bg-[#C8102E] hover:bg-[#A50D26] text-white px-5 py-2 rounded-lg transition-colors" style={oswald}>Get Started</Link>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex items-center pt-14">
        {/* Background */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 60% at 15% 55%, rgba(200,16,46,0.07) 0%, transparent 60%)' }} />
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 50% at 85% 40%, rgba(28,58,92,0.18) 0%, transparent 60%)' }} />
          <div className="absolute inset-0" style={{
            backgroundImage: 'linear-gradient(rgba(28,58,92,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(28,58,92,0.06) 1px, transparent 1px)',
            backgroundSize: '80px 80px',
          }} />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 w-full py-20 lg:py-0 lg:min-h-screen lg:flex lg:items-center">
          <div className="grid lg:grid-cols-[1fr,1.15fr] gap-12 lg:gap-20 items-center w-full">

            {/* Left: copy */}
            <div>
              <div className="inline-flex items-center gap-2 bg-[#C8102E]/10 border border-[#C8102E]/25 rounded-full px-4 py-1.5 mb-8">
                <div className="w-1.5 h-1.5 rounded-full bg-[#C8102E] shrink-0" />
                <span className="text-[10px] text-[#C8102E] tracking-[0.25em]" style={oswald}>Coaching Intelligence Platform</span>
              </div>

              <h1 className="text-[clamp(52px,8.5vw,96px)] leading-[0.85] mb-7 text-[#0F1F33]" style={oswald}>
                See Every<br />Pitch<br /><span className="text-[#C8102E]">Differently.</span>
              </h1>

              <p className="text-base sm:text-lg text-[#3D5166] max-w-[360px] mb-10 leading-[1.75]">
                Frame-by-frame video analysis, Rapsodo metrics, and AI coaching in one platform. Built for coaches who take development seriously.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mb-10">
                <Link
                  href="/auth/signup"
                  className="px-8 py-3.5 bg-[#C8102E] hover:bg-[#A50D26] text-white text-sm rounded-lg transition-all hover:shadow-[0_0_24px_rgba(200,16,46,0.35)] text-center"
                  style={oswald}
                >
                  Start Free — Coaches
                </Link>
                <Link
                  href="/auth/login"
                  className="px-8 py-3.5 border border-[#DDE4ED] hover:border-[#456080] text-[#3D5166] hover:text-[#456080] text-sm rounded-lg transition-colors text-center"
                  style={oswald}
                >
                  Player Login
                </Link>
              </div>

              <div className="flex items-center gap-5 flex-wrap">
                {['No credit card required', 'Free for coaches', 'All pitchers welcome'].map((t) => (
                  <div key={t} className="flex items-center gap-1.5">
                    <div className="w-1 h-1 rounded-full bg-[#C8102E]/60" />
                    <span className="text-xs text-[#3D5166]">{t}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: product mockup — desktop only */}
            <div className="hidden lg:block relative">
              <div className="absolute -inset-8 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(200,16,46,0.08), transparent 65%)' }} />

              <div className="relative rounded-2xl overflow-hidden border border-[#1C3A5C] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
                {/* Browser chrome */}
                <div className="flex items-center gap-3 px-4 py-3 bg-[#030810] border-b border-[#1C3A5C]">
                  <div className="flex gap-1.5 shrink-0">
                    <div className="w-3 h-3 rounded-full bg-[#FF5F57] opacity-50" />
                    <div className="w-3 h-3 rounded-full bg-[#FFBD2E] opacity-50" />
                    <div className="w-3 h-3 rounded-full bg-[#28C840] opacity-50" />
                  </div>
                  <div className="flex-1 bg-[#060F1A] border border-[#1C3A5C] rounded-md px-3 py-1 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#1C3A5C] shrink-0" />
                    <span className="text-[10px] text-[#4A6880] font-mono truncate">app.releasepoint.io/clips/jake-morrison</span>
                  </div>
                </div>

                {/* App nav strip */}
                <div className="flex items-center justify-between px-4 py-2 bg-[#060F1A] border-b border-[#1C3A5C]">
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/rp-icon.png" alt="RP" style={{ height: 14, width: 'auto', objectFit: 'contain' }} />
                    <span className="text-[#1C3A5C] text-xs">/</span>
                    <span className="text-[10px] text-[#4A6880]" style={oswald}>Jake Morrison</span>
                    <span className="text-[#1C3A5C] text-xs">/</span>
                    <span className="text-[10px] text-[#9FB3CC]" style={oswald}>Sep 14, 2026</span>
                  </div>
                  <span className="text-[9px] bg-[#14304F] text-[#9FB3CC] px-2 py-0.5 rounded" style={oswald}>Coach</span>
                </div>

                {/* Content: video + metrics */}
                <div className="grid bg-[#060F1A]" style={{ gridTemplateColumns: '1fr 196px' }}>

                  {/* Video area */}
                  <div className="border-r border-[#1C3A5C]">
                    <div className="relative bg-[#020810]" style={{ paddingBottom: '56.25%' }}>
                      <div className="absolute inset-0">
                        <div className="absolute inset-0 opacity-[0.035]" style={{
                          backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
                          backgroundSize: '30px 30px',
                        }} />
                        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 225" preserveAspectRatio="none">
                          <line x1="115" y1="192" x2="298" y2="52" stroke="#C8102E" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
                          <circle cx="115" cy="192" r="5.5" fill="#C8102E" opacity="0.9" />
                          <circle cx="298" cy="52" r="5.5" fill="#C8102E" opacity="0.9" />
                          <circle cx="255" cy="75" r="18" fill="none" stroke="#3B82F6" strokeWidth="2" opacity="0.85" />
                          <circle cx="255" cy="75" r="4" fill="#3B82F6" opacity="0.9" />
                          <line x1="72" y1="185" x2="188" y2="162" stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="5,3" strokeLinecap="round" opacity="0.75" />
                          <circle cx="72" cy="185" r="4" fill="#F59E0B" opacity="0.75" />
                        </svg>
                        <div className="absolute top-2 left-2">
                          <span className="text-[9px] bg-[#C8102E] text-white px-1.5 py-0.5 rounded font-mono">0:02.4</span>
                        </div>
                        <div className="absolute top-2 right-2">
                          <span className="text-[9px] bg-[#0B1E36] border border-[#1C3A5C] text-[#9FB3CC] px-1.5 py-0.5 rounded">Early shoulder</span>
                        </div>
                      </div>
                    </div>
                    {/* Video controls */}
                    <div className="px-3 py-2.5 bg-[#0B1E36] border-t border-[#1C3A5C] flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-full bg-[#C8102E] flex items-center justify-center shrink-0">
                        <span className="text-white text-[8px] ml-px">▶</span>
                      </div>
                      <div className="flex-1 h-px bg-[#1C3A5C] rounded-full overflow-hidden">
                        <div className="h-full w-1/5 bg-[#C8102E] rounded-full" />
                      </div>
                      <span className="text-[9px] text-[#4A6880] font-mono shrink-0">0:02 / 0:11</span>
                      <div className="flex gap-1 ml-1">
                        {(['Line', 'Arc', '○'] as const).map((t, i) => (
                          <span key={t} className={`text-[8px] px-1.5 py-0.5 rounded ${i === 0 ? 'bg-[#C8102E] text-white' : 'bg-[#060F1A] text-[#4A6880] border border-[#1C3A5C]'}`} style={oswald}>{t}</span>
                        ))}
                        <div className="flex gap-0.5 ml-1">
                          {['#C8102E', '#3B82F6', '#F59E0B'].map((c) => (
                            <div key={c} className="w-3 h-3 rounded-full" style={{ backgroundColor: c }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Metrics panel */}
                  <div className="flex flex-col">
                    <div className="px-3 py-2.5 border-b border-[#1C3A5C]">
                      <p className="text-[9px] tracking-[0.2em] text-[#C8102E]" style={oswald}>Pitch Metrics</p>
                      <p className="text-[9px] text-[#4A6880] mt-0.5">4-Seam · Sep 14</p>
                    </div>
                    {[
                      { label: 'Velocity', value: '87 mph', pct: 78, color: '#C8102E' },
                      { label: 'Spin Rate', value: '2,347', pct: 65, color: '#3B82F6' },
                      { label: 'V. Break', value: '16.4"', pct: 85, color: '#10B981' },
                      { label: 'H. Break', value: '8.2"', pct: 70, color: '#8B5CF6' },
                    ].map((m) => (
                      <div key={m.label} className="px-3 py-2.5 border-b border-[#0B1E36]">
                        <div className="flex justify-between mb-1.5">
                          <span className="text-[9px] text-[#4A6880]" style={oswald}>{m.label}</span>
                          <span className="text-[9px] font-mono text-[#E8EDF5]">{m.value}</span>
                        </div>
                        <div className="h-px bg-[#1C3A5C] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${m.pct}%`, backgroundColor: m.color }} />
                        </div>
                      </div>
                    ))}
                    <div className="px-3 py-2 border-b border-[#1C3A5C] bg-[#0B1E36] flex justify-between">
                      <span className="text-[9px] text-[#4A6880]" style={oswald}>16U</span>
                      <span className="text-[9px] text-[#C8102E]" style={oswald}>Elite ↑</span>
                    </div>
                    {/* Mini AI preview */}
                    <div className="flex-1 p-3 space-y-2 overflow-hidden">
                      <p className="text-[9px] tracking-[0.15em] text-[#4A6880] mb-2" style={oswald}>AI Coach</p>
                      <div className="bg-[#C8102E] rounded-xl rounded-br-none px-2 py-1.5 ml-2 text-[9px] text-white leading-snug">
                        Compare to 16U avg?
                      </div>
                      <div className="bg-[#0B1E36] border border-[#1C3A5C] rounded-xl rounded-bl-none px-2 py-1.5 mr-2 text-[9px] text-[#9FB3CC] leading-snug">
                        At 2,347rpm he&apos;s <span className="text-[#E8EDF5]">above avg</span>. Elite for his age group.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll cue */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden md:flex flex-col items-center gap-2 opacity-30">
          <span className="text-[9px] text-[#3D5166] tracking-[0.3em]" style={oswald}>Scroll</span>
          <div className="w-px h-8 bg-gradient-to-b from-[#3D5166] to-transparent" />
        </div>
      </section>

      {/* ── Stats bar ── */}
      <div className="border-y border-[#DDE4ED]">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-3 divide-x divide-[#DDE4ED]">
          {[
            { n: 'All Levels', l: 'Youth through professional' },
            { n: 'Rapsodo', l: 'Native CSV import' },
            { n: 'AI', l: 'Built-in coaching intelligence' },
          ].map((s) => (
            <div key={s.n} className="py-10 text-center px-4">
              <p className="text-[clamp(22px,3.5vw,38px)] text-[#0F1F33] leading-none mb-2" style={oswald}>{s.n}</p>
              <p className="text-xs text-[#3D5166]">{s.l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Feature 1: Video ── */}
      <section className="max-w-6xl mx-auto px-6 py-28 md:py-40 grid md:grid-cols-2 gap-16 items-center">
        <div>
          <p className="text-xs sm:text-sm tracking-[0.2em] text-[#C8102E] mb-5" style={oswald}>01 — Video Analysis</p>
          <h2 className="text-[clamp(36px,5.5vw,68px)] leading-[0.88] text-[#0F1F33] mb-6" style={oswald}>
            Annotate<br />Every<br />Frame.
          </h2>
          <p className="text-base sm:text-lg text-[#3D5166] leading-[1.85] max-w-sm">
            Draw directly on video. Mark arm angles, hip rotation, and release points. Every annotation is timestamped and shared with your player instantly.
          </p>
        </div>
        <div className="rounded-xl overflow-hidden border border-[#DDE4ED] bg-white shadow-sm">
          <div className="relative aspect-video bg-[#EAEFF5] overflow-hidden">
            <div className="absolute inset-0 opacity-[0.04]" style={{ background: 'repeating-linear-gradient(135deg, #1C3A5C 0px, #1C3A5C 1px, transparent 1px, transparent 30px)' }} />
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 225" preserveAspectRatio="none">
              <line x1="80" y1="180" x2="300" y2="60" stroke="#C8102E" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="80" cy="180" r="5" fill="#C8102E" opacity="0.9" />
              <circle cx="300" cy="60" r="5" fill="#C8102E" opacity="0.9" />
              <circle cx="210" cy="120" r="8" fill="none" stroke="#3B82F6" strokeWidth="2" />
              <line x1="160" y1="140" x2="260" y2="90" stroke="#10B981" strokeWidth="1.5" strokeDasharray="4,3" strokeLinecap="round" />
            </svg>
            <div className="absolute top-[38%] left-[52%] w-6 h-6 rounded-full border-2 border-[#3B82F6] flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-[#3B82F6]" />
            </div>
          </div>
          <div className="px-4 py-3 flex items-center gap-3 border-t border-[#DDE4ED]">
            <div className="w-6 h-6 rounded-full bg-[#C8102E] flex items-center justify-center shrink-0">
              <span className="text-white text-[8px]">▶</span>
            </div>
            <div className="flex-1 h-px bg-[#DDE4ED] rounded-full overflow-hidden">
              <div className="h-full w-1/3 bg-[#C8102E] rounded-full" />
            </div>
            <span className="text-[10px] text-[#3D5166] font-mono shrink-0">0:34 / 1:47</span>
          </div>
          <div className="px-4 py-2.5 flex items-center gap-2 border-t border-[#DDE4ED]">
            {['Line', 'Circle', 'Box', 'Free'].map((t, i) => (
              <span key={t} className={`text-[9px] px-2 py-1 rounded ${i === 0 ? 'bg-[#C8102E] text-white' : 'bg-[#F5F7FA] text-[#3D5166] border border-[#DDE4ED]'}`} style={oswald}>{t}</span>
            ))}
            <div className="ml-auto flex items-center gap-1.5">
              {['#C8102E', '#3B82F6', '#10B981'].map((c) => <div key={c} className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: c }} />)}
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature 2: Rapsodo ── */}
      <section className="border-y border-[#DDE4ED] bg-[#F0F4F8]">
        <div className="max-w-6xl mx-auto px-6 py-28 md:py-40 grid md:grid-cols-2 gap-16 items-center">
          <div className="rounded-xl border border-[#DDE4ED] bg-white overflow-hidden shadow-sm order-2 md:order-1">
            <div className="px-5 py-4 border-b border-[#DDE4ED] flex items-center justify-between">
              <span className="text-xs text-[#3D5166]" style={oswald}>Session · Sep 14, 2026</span>
              <span className="text-[10px] bg-green-900/30 text-green-400 px-2 py-0.5 rounded" style={oswald}>Rapsodo Connected</span>
            </div>
            {[
              { label: 'Velocity', value: '87', unit: 'mph', pct: 78, color: '#C8102E' },
              { label: 'Spin Rate', value: '2,347', unit: 'rpm', pct: 65, color: '#3B82F6' },
              { label: 'Spin Axis', value: '221', unit: '°', pct: 55, color: '#10B981' },
              { label: 'H. Break', value: '8.2', unit: '"', pct: 70, color: '#8B5CF6' },
              { label: 'V. Break', value: '16.4', unit: '"', pct: 85, color: '#F59E0B' },
            ].map((m) => (
              <div key={m.label} className="px-5 py-3.5 border-b border-[#EEF2F7] last:border-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-[#3D5166]" style={oswald}>{m.label}</span>
                  <span className="text-sm text-[#0F1F33] font-mono">{m.value}<span className="text-xs text-[#3D5166] ml-0.5">{m.unit}</span></span>
                </div>
                <div className="h-px bg-[#DDE4ED] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${m.pct}%`, backgroundColor: m.color }} />
                </div>
              </div>
            ))}
            <div className="px-5 py-3 flex items-center justify-between bg-[#F0F4F8]">
              <span className="text-[10px] text-[#3D5166]" style={oswald}>16U Benchmark</span>
              <span className="text-[10px] text-[#C8102E]" style={oswald}>Above Average ↑</span>
            </div>
          </div>
          <div className="order-1 md:order-2">
            <p className="text-xs sm:text-sm tracking-[0.2em] text-[#C8102E] mb-5" style={oswald}>02 — Rapsodo</p>
            <h2 className="text-[clamp(36px,5.5vw,68px)] leading-[0.88] text-[#0F1F33] mb-6" style={oswald}>
              Data That<br />Means<br />Something.
            </h2>
            <p className="text-base sm:text-lg text-[#3D5166] leading-[1.85] max-w-sm">
              Import your Rapsodo CSV. Velocity, spin rate, axis, and break — each metric benchmarked against real data for your player&apos;s age group. No interpretation needed.
            </p>
          </div>
        </div>
      </section>

      {/* ── Feature 3: AI ── */}
      <section className="max-w-6xl mx-auto px-6 py-28 md:py-40 grid md:grid-cols-2 gap-16 items-center">
        <div>
          <p className="text-xs sm:text-sm tracking-[0.2em] text-[#C8102E] mb-5" style={oswald}>03 — AI Coach</p>
          <h2 className="text-[clamp(36px,5.5vw,68px)] leading-[0.88] text-[#0F1F33] mb-6" style={oswald}>
            An Expert<br />In Every<br />Session.
          </h2>
          <p className="text-base sm:text-lg text-[#3D5166] leading-[1.85] max-w-sm">
            The AI knows your player&apos;s age group, position, and Rapsodo numbers. Ask it anything. It responds with real data — not guesses.
          </p>
        </div>
        <div className="rounded-xl border border-[#DDE4ED] bg-white overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-[#DDE4ED] flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#C8102E]" />
            <span className="text-xs text-[#3D5166]" style={oswald}>AI Coach · Jake M · 16U · Pitcher</span>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex justify-end">
              <div className="max-w-[80%] bg-[#C8102E] rounded-xl rounded-br-sm px-4 py-2.5 text-xs text-white leading-relaxed">
                His curveball spin axis is at 55°. What does that mean for break shape?
              </div>
            </div>
            <div className="flex justify-start">
              <div className="max-w-[85%] bg-[#F0F4F8] border border-[#DDE4ED] rounded-xl rounded-bl-sm px-4 py-3 text-xs text-[#456080] leading-relaxed">
                At 55° you&apos;ll see a strong 1-to-7 shape. At 2,347 rpm for a 16U pitcher that&apos;s <span className="text-[#0F1F33]">above average</span> — elite by most standards.
              </div>
            </div>
            <div className="flex justify-end">
              <div className="max-w-[80%] bg-[#C8102E] rounded-xl rounded-br-sm px-4 py-2.5 text-xs text-white leading-relaxed">
                What drills would improve spin efficiency?
              </div>
            </div>
            <div className="flex justify-start">
              <div className="max-w-[85%] bg-[#F0F4F8] border border-[#DDE4ED] rounded-xl rounded-bl-sm px-4 py-3 text-xs text-[#456080] leading-relaxed">
                <span className="text-[#0F1F33]">Towel drill + wall spin work:</span> Middle finger pressure at release. Start at 60% effort — don&apos;t chase velocity until the axis locks in.
              </div>
            </div>
          </div>
          <div className="px-4 py-3 border-t border-[#DDE4ED] flex gap-2">
            <div className="flex-1 bg-[#F5F7FA] border border-[#DDE4ED] rounded-lg px-3 py-2 text-xs text-[#3D5166]">Ask about this clip…</div>
            <button className="bg-[#C8102E] hover:bg-[#A50D26] rounded-lg px-4 py-2 text-xs text-white transition-colors" style={oswald}>Send</button>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="border-y border-[#DDE4ED] bg-[#F0F4F8]">
        <div className="max-w-5xl mx-auto px-6 py-24 md:py-36">
          <p className="text-[10px] tracking-[0.3em] text-[#3D5166] mb-14 text-center" style={oswald}>How It Works</p>
          <div className="grid md:grid-cols-3 gap-12 md:gap-8">
            {[
              { n: '01', t: 'Build Your Program', d: 'Create teams by age group. Invite players by email. Guardian consent handled automatically.' },
              { n: '02', t: 'Upload & Analyze', d: 'Add clips, annotate mechanics, import Rapsodo CSVs. Everything linked to the player.' },
              { n: '03', t: 'Players Get It All', d: 'Every annotation, metric, and AI insight is shared with the player instantly.' },
            ].map((s) => (
              <div key={s.n} className="relative pl-6 border-l border-[#DDE4ED]">
                <p className="text-5xl text-[#C8102E] leading-none mb-5" style={oswald}>{s.n}</p>
                <p className="text-base sm:text-lg text-[#0F1F33] mb-2.5" style={oswald}>{s.t}</p>
                <p className="text-sm sm:text-base text-[#3D5166] leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Age groups ── */}
      <section className="max-w-4xl mx-auto px-6 py-20 text-center">
        <p className="text-[10px] tracking-[0.3em] text-[#3D5166] mb-6" style={oswald}>All pitchers welcome · All levels</p>
        <div className="flex items-center justify-center flex-wrap gap-2">
          {['Youth', 'Middle School', 'High School', 'College', 'Professional', 'Pitching Coordinators', 'Pitching Coaches'].map((age) => (
            <span key={age} className="px-5 py-2 rounded-lg border border-[#DDE4ED] text-xs text-[#456080] hover:border-[#C8102E]/50 hover:text-[#0F1F33] transition-colors cursor-default" style={oswald}>{age}</span>
          ))}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="border-t border-[#DDE4ED] bg-[#F0F4F8] relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 100%, rgba(200,16,46,0.06) 0%, transparent 70%)' }} />
        <div className="relative max-w-4xl mx-auto px-6 py-36 md:py-48 text-center">
          <h2 className="text-[clamp(44px,8vw,88px)] leading-[0.88] text-[#0F1F33] mb-8" style={oswald}>
            Upgrade Your<br />Program<br /><span className="text-[#C8102E]">Today.</span>
          </h2>
          <Link
            href="/auth/signup"
            className="inline-block px-12 py-4 bg-[#C8102E] hover:bg-[#A50D26] text-white text-sm rounded-lg transition-all hover:shadow-[0_0_32px_rgba(200,16,46,0.4)]"
            style={oswald}
          >
            Get Started Free
          </Link>
          <p className="text-xs text-[#3D5166] mt-5">Free for coaches · No credit card required</p>
        </div>
      </section>

      <SiteFooter />

    </div>
  )
}
