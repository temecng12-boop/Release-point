import Link from 'next/link'
import Logo from '@/components/Logo'
import SiteFooter from '@/components/SiteFooter'
import SpotlightCard from '@/components/spotlight-card'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#06090F] text-[#EDF2F7] overflow-x-hidden">

      {/* ── Nav ── */}
      <header
        className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 md:px-12 h-14"
        style={{
          backgroundColor: 'rgba(6,9,15,0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <Logo size="md" wordmarkClass="inline" />
        <nav className="flex items-center gap-1">
          <Link
            href="/auth/login"
            className="text-xs text-white/50 hover:text-white/80 transition-colors px-4 py-2"
            style={os}
          >
            Sign In
          </Link>
          <Link
            href="/auth/signup"
            className="text-xs bg-[#E8102A] hover:bg-[#C80E24] active:scale-95 text-white px-5 py-2 rounded-lg transition-all"
            style={os}
          >
            Get Started
          </Link>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex items-center pt-14">
        {/* Ambient glows */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-40 -left-40 w-[700px] h-[700px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(232,16,42,0.06) 0%, transparent 65%)' }} />
          <div className="absolute top-20 right-0 w-[600px] h-[600px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(13,21,32,0.9) 0%, transparent 70%)' }} />
          <div className="absolute inset-0" style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
            backgroundSize: '80px 80px',
          }} />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 w-full py-20 lg:py-0 lg:min-h-screen lg:flex lg:items-center">
          <div className="grid lg:grid-cols-[1fr,1.1fr] gap-16 lg:gap-24 items-center w-full">

            {/* Left: copy */}
            <div className="animate-fade-up">
              <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-8"
                style={{ background: 'rgba(232,16,42,0.1)', border: '1px solid rgba(232,16,42,0.2)' }}>
                <div className="w-1.5 h-1.5 rounded-full bg-[#E8102A] shrink-0" />
                <span className="text-[10px] text-[#E8102A] tracking-[0.25em]" style={os}>Coaching Intelligence Platform</span>
              </div>

              <h1
                className="text-[clamp(52px,8.5vw,96px)] leading-[0.88] mb-7 text-white tracking-tight"
                style={os}
              >
                See Every<br />Pitch<br /><span className="text-[#E8102A]">Differently.</span>
              </h1>

              <p className="text-base sm:text-lg text-white/50 max-w-[360px] mb-10 leading-[1.8]">
                Frame-by-frame video analysis, Rapsodo metrics, and AI coaching in one platform. Built for coaches who take development seriously.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mb-10">
                <Link
                  href="/auth/signup"
                  className="px-8 py-3.5 bg-[#E8102A] hover:bg-[#C80E24] active:scale-95 text-white text-sm rounded-lg transition-all hover:shadow-[0_0_32px_rgba(232,16,42,0.3)] text-center"
                  style={os}
                >
                  Start Free — Coaches
                </Link>
                <Link
                  href="/auth/login"
                  className="px-8 py-3.5 text-sm rounded-lg transition-all text-center text-white/60 hover:text-white/90"
                  style={{ ...os, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}
                >
                  Player Login
                </Link>
              </div>

              <div className="flex items-center gap-6 flex-wrap">
                {['No credit card required', 'Free for coaches', 'All levels welcome'].map((t) => (
                  <div key={t} className="flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-[#E8102A]/60" />
                    <span className="text-xs text-white/35">{t}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: product mockup */}
            <div className="hidden lg:block relative animate-fade-up-2">
              <div className="absolute -inset-12 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(232,16,42,0.07), transparent 65%)' }} />

              <div className="relative rounded-2xl overflow-hidden"
                style={{ border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 32px 80px rgba(0,0,0,0.5)' }}>
                {/* Browser chrome */}
                <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ background: '#0A0E16', borderColor: 'rgba(255,255,255,0.07)' }}>
                  <div className="flex gap-1.5 shrink-0">
                    <div className="w-3 h-3 rounded-full bg-[#FF5F57] opacity-50" />
                    <div className="w-3 h-3 rounded-full bg-[#FFBD2E] opacity-50" />
                    <div className="w-3 h-3 rounded-full bg-[#28C840] opacity-50" />
                  </div>
                  <div className="flex-1 rounded-md px-3 py-1 flex items-center gap-2"
                    style={{ background: '#060B12', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div className="w-1.5 h-1.5 rounded-full bg-white/15 shrink-0" />
                    <span className="text-[10px] text-white/25 font-mono truncate">app.releasepoint.io/clips/jake-morrison</span>
                  </div>
                </div>

                {/* App nav strip */}
                <div className="flex items-center justify-between px-4 py-2 border-b" style={{ background: '#060B12', borderColor: 'rgba(255,255,255,0.07)' }}>
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/rp-icon.png" alt="RP" style={{ height: 14, width: 'auto', objectFit: 'contain' }} />
                    <span className="text-white/20 text-xs">/</span>
                    <span className="text-[10px] text-white/35" style={os}>Jake Morrison</span>
                    <span className="text-white/20 text-xs">/</span>
                    <span className="text-[10px] text-white/55" style={os}>Sep 14, 2026</span>
                  </div>
                  <span className="text-[9px] px-2 py-0.5 rounded" style={{ ...os, background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.4)' }}>Coach</span>
                </div>

                {/* Content */}
                <div className="grid" style={{ background: '#06090F', gridTemplateColumns: '1fr 190px' }}>
                  {/* Video area */}
                  <div className="border-r" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                    <div className="relative" style={{ paddingBottom: '56.25%' }}>
                      <div className="absolute inset-0 bg-[#020510]">
                        <div className="absolute inset-0 opacity-[0.03]" style={{
                          backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
                          backgroundSize: '30px 30px',
                        }} />
                        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 225" preserveAspectRatio="none">
                          <line x1="115" y1="192" x2="298" y2="52" stroke="#E8102A" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
                          <circle cx="115" cy="192" r="5.5" fill="#E8102A" opacity="0.9" />
                          <circle cx="298" cy="52" r="5.5" fill="#E8102A" opacity="0.9" />
                          <circle cx="255" cy="75" r="18" fill="none" stroke="#3B82F6" strokeWidth="2" opacity="0.85" />
                          <circle cx="255" cy="75" r="4" fill="#3B82F6" opacity="0.9" />
                          <line x1="72" y1="185" x2="188" y2="162" stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="5,3" strokeLinecap="round" opacity="0.75" />
                          <circle cx="72" cy="185" r="4" fill="#F59E0B" opacity="0.75" />
                        </svg>
                        <div className="absolute top-2 left-2">
                          <span className="text-[9px] bg-[#E8102A] text-white px-1.5 py-0.5 rounded font-mono">0:02.4</span>
                        </div>
                        <div className="absolute top-2 right-2">
                          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}>Early shoulder</span>
                        </div>
                      </div>
                    </div>
                    {/* Video controls */}
                    <div className="px-3 py-2.5 flex items-center gap-2.5 border-t" style={{ background: '#0A0F1A', borderColor: 'rgba(255,255,255,0.07)' }}>
                      <div className="w-6 h-6 rounded-full bg-[#E8102A] flex items-center justify-center shrink-0">
                        <span className="text-white text-[8px] ml-px">▶</span>
                      </div>
                      <div className="flex-1 h-px rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                        <div className="h-full w-1/5 bg-[#E8102A] rounded-full" />
                      </div>
                      <span className="text-[9px] text-white/30 font-mono shrink-0">0:02 / 0:11</span>
                    </div>
                  </div>

                  {/* Metrics panel */}
                  <div className="flex flex-col">
                    <div className="px-3 py-2.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                      <p className="text-[9px] tracking-[0.2em] text-[#E8102A]" style={os}>Pitch Metrics</p>
                      <p className="text-[9px] text-white/30 mt-0.5">4-Seam · Sep 14</p>
                    </div>
                    {[
                      { label: 'Velocity',  value: '87 mph',  pct: 78, color: '#E8102A' },
                      { label: 'Spin Rate', value: '2,347',   pct: 65, color: '#3B82F6' },
                      { label: 'V. Break',  value: '16.4"',   pct: 85, color: '#10B981' },
                      { label: 'H. Break',  value: '8.2"',    pct: 70, color: '#8B5CF6' },
                    ].map((m) => (
                      <div key={m.label} className="px-3 py-2.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                        <div className="flex justify-between mb-1.5">
                          <span className="text-[9px] text-white/35" style={os}>{m.label}</span>
                          <span className="text-[9px] font-mono text-white/80">{m.value}</span>
                        </div>
                        <div className="h-px rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                          <div className="h-full rounded-full" style={{ width: `${m.pct}%`, backgroundColor: m.color }} />
                        </div>
                      </div>
                    ))}
                    <div className="px-3 py-2 border-b flex justify-between" style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.07)' }}>
                      <span className="text-[9px] text-white/30" style={os}>16U</span>
                      <span className="text-[9px] text-[#E8102A]" style={os}>Elite ↑</span>
                    </div>
                    <div className="flex-1 p-3 space-y-2 overflow-hidden">
                      <p className="text-[9px] tracking-[0.15em] text-white/25 mb-2" style={os}>AI Coach</p>
                      <div className="bg-[#E8102A] rounded-xl rounded-br-none px-2 py-1.5 ml-2 text-[9px] text-white leading-snug">
                        Compare to 16U avg?
                      </div>
                      <div className="rounded-xl rounded-bl-none px-2 py-1.5 mr-2 text-[9px] leading-snug"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>
                        At 2,347rpm he&apos;s <span className="text-white">above avg</span>. Elite for his age.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll cue */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden md:flex flex-col items-center gap-2 opacity-25">
          <span className="text-[9px] text-white/50 tracking-[0.3em]" style={os}>Scroll</span>
          <div className="w-px h-8" style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.3), transparent)' }} />
        </div>
      </section>

      {/* ── Stats bar ── */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-3 divide-x" style={{ '--tw-divide-opacity': '1', borderColor: 'rgba(255,255,255,0.07)' } as React.CSSProperties}>
          {[
            { n: 'All Levels', l: 'Youth through professional' },
            { n: 'Rapsodo',    l: 'Native CSV import' },
            { n: 'AI',         l: 'Built-in coaching intelligence' },
          ].map((s) => (
            <div key={s.n} className="py-10 text-center px-4" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
              <p className="text-[clamp(22px,3.5vw,38px)] text-white leading-none mb-2 tracking-tight" style={os}>{s.n}</p>
              <p className="text-xs text-white/35">{s.l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bento Features ── */}
      <section className="max-w-7xl mx-auto px-6 py-28 md:py-40">
        <div className="mb-16 animate-fade-up">
          <p className="text-[10px] tracking-[0.35em] text-white/30 mb-4" style={os}>Platform Features</p>
          <h2 className="text-[clamp(36px,5vw,64px)] leading-[0.88] text-white tracking-tight" style={os}>
            Everything<br />in One Place.
          </h2>
        </div>

        {/* 3-col bento grid */}
        <div className="grid lg:grid-cols-3 gap-4">

          {/* Tall tile: Video Analysis */}
          <SpotlightCard
            className="lg:row-span-2 rounded-2xl flex flex-col overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <div className="p-8 flex-1 flex flex-col">
              <p className="text-[10px] tracking-[0.2em] text-[#E8102A] mb-5" style={os}>01 — Video Analysis</p>
              <h3 className="text-[clamp(28px,3.5vw,44px)] leading-[0.9] text-white mb-5 tracking-tight" style={os}>
                Annotate<br />Every<br />Frame.
              </h3>
              <p className="text-sm text-white/45 leading-[1.85] max-w-sm">
                Draw directly on video. Mark arm angles, hip rotation, and release points. Every annotation is timestamped and shared instantly.
              </p>
            </div>
            {/* Video mock */}
            <div className="mx-6 mb-6 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
              <div className="relative aspect-video bg-[#020510]">
                <div className="absolute inset-0 opacity-[0.03]" style={{ background: 'repeating-linear-gradient(135deg, #fff 0px, #fff 1px, transparent 1px, transparent 28px)' }} />
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 225" preserveAspectRatio="none">
                  <line x1="80" y1="180" x2="300" y2="60" stroke="#E8102A" strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx="80" cy="180" r="5" fill="#E8102A" opacity="0.9" />
                  <circle cx="300" cy="60" r="5" fill="#E8102A" opacity="0.9" />
                  <circle cx="210" cy="120" r="8" fill="none" stroke="#3B82F6" strokeWidth="2" />
                  <line x1="160" y1="140" x2="260" y2="90" stroke="#10B981" strokeWidth="1.5" strokeDasharray="4,3" strokeLinecap="round" />
                </svg>
              </div>
              <div className="px-4 py-3 flex items-center gap-3 border-t" style={{ background: '#0A0F1A', borderColor: 'rgba(255,255,255,0.07)' }}>
                <div className="w-6 h-6 rounded-full bg-[#E8102A] flex items-center justify-center shrink-0">
                  <span className="text-white text-[8px]">▶</span>
                </div>
                <div className="flex-1 h-px rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                  <div className="h-full w-1/3 bg-[#E8102A] rounded-full" />
                </div>
                <span className="text-[10px] text-white/30 font-mono shrink-0">0:34 / 1:47</span>
              </div>
            </div>
          </SpotlightCard>

          {/* Rapsodo tile */}
          <SpotlightCard
            className="rounded-2xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <div className="p-8">
              <p className="text-[10px] tracking-[0.2em] text-[#E8102A] mb-5" style={os}>02 — Rapsodo</p>
              <h3 className="text-[clamp(24px,3vw,36px)] leading-[0.9] text-white mb-4 tracking-tight" style={os}>
                Data That<br />Means<br />Something.
              </h3>
              <p className="text-sm text-white/45 leading-relaxed max-w-xs mb-6">
                Import your Rapsodo CSV. Every metric benchmarked against real data for your player&apos;s age group.
              </p>
              <div className="space-y-2.5">
                {[
                  { label: 'Velocity',  value: '87 mph',  pct: 78, color: '#E8102A' },
                  { label: 'Spin Rate', value: '2,347 rpm', pct: 65, color: '#3B82F6' },
                  { label: 'V. Break',  value: '16.4"',   pct: 85, color: '#10B981' },
                ].map((m) => (
                  <div key={m.label}>
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] text-white/40" style={os}>{m.label}</span>
                      <span className="text-[10px] font-mono text-white/70">{m.value}</span>
                    </div>
                    <div className="h-px rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <div className="h-full rounded-full" style={{ width: `${m.pct}%`, backgroundColor: m.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </SpotlightCard>

          {/* AI Coach tile */}
          <SpotlightCard
            className="rounded-2xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <div className="p-8">
              <p className="text-[10px] tracking-[0.2em] text-[#E8102A] mb-5" style={os}>03 — AI Coach</p>
              <h3 className="text-[clamp(24px,3vw,36px)] leading-[0.9] text-white mb-4 tracking-tight" style={os}>
                An Expert<br />In Every<br />Session.
              </h3>
              <div className="space-y-3">
                <div className="flex justify-end">
                  <div className="max-w-[85%] bg-[#E8102A] rounded-xl rounded-br-sm px-3.5 py-2.5 text-xs text-white leading-relaxed">
                    His curveball spin axis is 55°. What does that mean?
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="max-w-[90%] rounded-xl rounded-bl-sm px-3.5 py-3 text-xs leading-relaxed"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
                    At 55° you&apos;ll see a strong 1-to-7 shape. At 2,347 rpm for a 16U pitcher that&apos;s <span className="text-white">above average</span> — elite by most standards.
                  </div>
                </div>
              </div>
            </div>
          </SpotlightCard>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="max-w-5xl mx-auto px-6 py-24 md:py-36">
        <p className="text-[10px] tracking-[0.35em] text-white/25 mb-16 text-center" style={os}>How It Works</p>
        <div className="grid md:grid-cols-3 gap-12 md:gap-8">
          {[
            { n: '01', t: 'Build Your Program',   d: 'Create teams by age group. Invite players by email. Guardian consent handled automatically.' },
            { n: '02', t: 'Upload & Analyze',     d: 'Add clips, annotate mechanics, import Rapsodo CSVs. Everything linked to the player.' },
            { n: '03', t: 'Players Get It All',   d: 'Every annotation, metric, and AI insight is shared with the player instantly.' },
          ].map((s) => (
            <div key={s.n} className="relative pl-6" style={{ borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
              <p className="text-5xl text-[#E8102A] leading-none mb-5 tracking-tight" style={os}>{s.n}</p>
              <p className="text-base sm:text-lg text-white mb-2.5 tracking-tight" style={os}>{s.t}</p>
              <p className="text-sm sm:text-base text-white/40 leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Age groups ── */}
      <section className="max-w-4xl mx-auto px-6 py-20 text-center">
        <p className="text-[10px] tracking-[0.3em] text-white/25 mb-6" style={os}>All pitchers welcome · All levels</p>
        <div className="flex items-center justify-center flex-wrap gap-2">
          {['Youth', 'Middle School', 'High School', 'College', 'Professional', 'Pitching Coordinators', 'Pitching Coaches'].map((age) => (
            <span
              key={age}
              className="px-5 py-2 rounded-lg text-xs text-white/40 hover:text-white/70 transition-colors cursor-default"
              style={{ ...os, border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {age}
            </span>
          ))}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative overflow-hidden" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 100%, rgba(232,16,42,0.07) 0%, transparent 70%)' }} />
        <div className="relative max-w-4xl mx-auto px-6 py-36 md:py-52 text-center">
          <h2 className="text-[clamp(44px,8vw,88px)] leading-[0.88] text-white mb-8 tracking-tight" style={os}>
            Upgrade Your<br />Program<br /><span className="text-[#E8102A]">Today.</span>
          </h2>
          <Link
            href="/auth/signup"
            className="inline-block px-12 py-4 bg-[#E8102A] hover:bg-[#C80E24] active:scale-95 text-white text-sm rounded-lg transition-all hover:shadow-[0_0_40px_rgba(232,16,42,0.35)]"
            style={os}
          >
            Get Started Free
          </Link>
          <p className="text-xs text-white/25 mt-5">Free for coaches · No credit card required</p>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
