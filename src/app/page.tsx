import Image from 'next/image'
import Link from 'next/link'
import Logo from '@/components/Logo'
import SiteFooter from '@/components/SiteFooter'
import SpotlightCard from '@/components/spotlight-card'
import MagneticButton from '@/components/magnetic-button'
import LiveStats from '@/components/live-stats'
import PhotoGallery from '@/components/photo-gallery'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-slate-950 overflow-x-hidden">

      {/* ── Nav ── */}
      <header
        className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 md:px-12 h-14"
        style={{
          backgroundColor: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <Logo size="md" wordmarkClass="inline" />
        <nav className="flex items-center gap-1">
          <Link href="/auth/login" className="text-xs text-slate-500 hover:text-slate-900 transition-colors px-4 py-2" style={os}>
            Sign In
          </Link>
          <Link href="/auth/signup" className="text-xs bg-[#E8102A] hover:bg-[#C80E24] active:scale-95 text-white px-5 py-2 rounded-lg transition-all" style={os}>
            Get Started
          </Link>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section className="grain relative min-h-screen flex items-center pt-14">
        {/* Background — clean dot pattern, no grid */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-60 -left-60 w-[900px] h-[900px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(232,16,42,0.05) 0%, transparent 60%)' }} />
          <div className="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.04) 0%, transparent 60%)' }} />
          {/* Dot pattern */}
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            opacity: 0.5,
          }} />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 w-full py-24 lg:py-0 lg:min-h-screen lg:flex lg:items-center">
          <div className="grid lg:grid-cols-[1fr,1.05fr] gap-16 lg:gap-20 items-center w-full">

            {/* Left */}
            <div className="animate-fade-up">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 mb-8"
                style={{ background: 'rgba(232,16,42,0.07)', border: '1px solid rgba(232,16,42,0.18)' }}>
                <div className="w-1.5 h-1.5 rounded-full bg-[#E8102A] animate-pulse shrink-0" />
                <span className="text-[10px] text-[#E8102A] tracking-[0.3em]" style={os}>Created by Pitchers · Trusted by Coaches</span>
              </div>

              <h1 className="text-[clamp(48px,8vw,88px)] leading-[0.86] mb-8 text-slate-950 tracking-tight" style={os}>
                See Every<br />Pitch<br /><span className="text-[#E8102A]">Differently.</span>
              </h1>

              {/* Live data counters */}
              <div className="mb-10 py-6 border-y border-slate-100">
                <p className="text-[9px] text-slate-400 tracking-[0.3em] mb-4" style={os}>Live from the platform</p>
                <LiveStats />
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mb-8">
                <MagneticButton>
                  <Link
                    href="/auth/signup"
                    className="block px-8 py-4 bg-[#E8102A] hover:bg-[#C80E24] text-white text-sm rounded-xl transition-all text-center shadow-[0_4px_24px_rgba(232,16,42,0.25)] hover:shadow-[0_8px_32px_rgba(232,16,42,0.35)]"
                    style={os}
                  >
                    Start Free — Coaches
                  </Link>
                </MagneticButton>
                <MagneticButton>
                  <Link
                    href="/auth/login"
                    className="block px-8 py-4 text-sm rounded-xl transition-all text-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200"
                    style={os}
                  >
                    Player Login
                  </Link>
                </MagneticButton>
              </div>

              <div className="flex items-center gap-5 flex-wrap">
                {['Free for coaches', 'No credit card', 'All levels'].map((t) => (
                  <div key={t} className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-[#E8102A]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-xs text-slate-500">{t}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: product mockup */}
            <div className="hidden lg:block relative animate-fade-up-2">
              {/* Glow behind mockup */}
              <div className="absolute -inset-8 rounded-3xl pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(232,16,42,0.06), transparent 70%)' }} />

              <div className="relative rounded-2xl overflow-hidden"
                style={{
                  border: '1px solid rgba(0,0,0,0.1)',
                  boxShadow: '0 40px 100px rgba(0,0,0,0.15), 0 8px 32px rgba(0,0,0,0.08)',
                }}>
                {/* Browser chrome */}
                <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ background: '#0A0E16', borderColor: 'rgba(255,255,255,0.07)' }}>
                  <div className="flex gap-1.5 shrink-0">
                    <div className="w-3 h-3 rounded-full bg-[#FF5F57] opacity-70" />
                    <div className="w-3 h-3 rounded-full bg-[#FFBD2E] opacity-70" />
                    <div className="w-3 h-3 rounded-full bg-[#28C840] opacity-70" />
                  </div>
                  <div className="flex-1 rounded-md px-3 py-1 flex items-center gap-2"
                    style={{ background: '#060B12', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div className="w-1.5 h-1.5 rounded-full bg-white/20 shrink-0" />
                    <span className="text-[10px] text-white/30 font-mono truncate">releasepointai.com/clips/nolan-george</span>
                  </div>
                </div>

                {/* App nav strip */}
                <div className="flex items-center justify-between px-4 py-2 border-b" style={{ background: '#060B12', borderColor: 'rgba(255,255,255,0.07)' }}>
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/rp-icon.png" alt="RP" style={{ height: 14, width: 'auto', objectFit: 'contain' }} />
                    <span className="text-white/20 text-xs">/</span>
                    <span className="text-[10px] text-white/40" style={os}>Nolan George</span>
                    <span className="text-white/20 text-xs">/</span>
                    <span className="text-[10px] text-white/60" style={os}>Sep 14, 2026</span>
                  </div>
                  <span className="text-[9px] px-2 py-0.5 rounded" style={{ ...os, background: 'rgba(232,16,42,0.2)', color: '#E8102A' }}>Coach</span>
                </div>

                {/* Content */}
                <div className="grid" style={{ background: '#06090F', gridTemplateColumns: '1fr 185px' }}>
                  {/* Video — real pitch clip */}
                  <div className="border-r" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                    <div className="relative overflow-hidden" style={{ paddingBottom: '56.25%' }}>
                    <Image
                      src="/media/nolan-windup.jpg"
                      alt="Pitch clip"
                      fill
                      className="object-cover"
                      style={{ objectPosition: '50% 40%', filter: 'brightness(1.05)' }}
                      sizes="400px"
                      priority
                    />
                    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 225" preserveAspectRatio="xMidYMid slice">
                      {/* Lead knee — peak of leg kick / balance point */}
                      <circle cx="169" cy="116" r="16" fill="none" stroke="#E8102A" strokeWidth="2.2" opacity="0.92" />
                      <circle cx="169" cy="116" r="4" fill="#E8102A" opacity="0.92" />
                      {/* Short vertical tick at knee showing height of leg drive */}
                      <line x1="169" y1="100" x2="169" y2="132" stroke="#E8102A" strokeWidth="1.4" strokeDasharray="4,3" strokeLinecap="round" opacity="0.60" />
                      {/* Glove — front-side arm tucked at chest */}
                      <circle cx="169" cy="66" r="13" fill="none" stroke="#3B82F6" strokeWidth="1.8" opacity="0.88" />
                    </svg>
                    <div className="absolute top-2 left-2">
                      <span className="text-[9px] bg-[#E8102A] text-white px-1.5 py-0.5 rounded font-mono">0:01.2</span>
                    </div>
                    <div className="absolute top-2 right-2">
                      <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.15)' }}>Balance pt</span>
                    </div>
                  </div>
                    <div className="px-3 py-2.5 flex items-center gap-2.5 border-t" style={{ background: '#0A0F1A', borderColor: 'rgba(255,255,255,0.07)' }}>
                      <div className="w-6 h-6 rounded-full bg-[#E8102A] flex items-center justify-center shrink-0">
                        <span className="text-white text-[8px] ml-px">▶</span>
                      </div>
                      <div className="flex-1 h-px rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                        <div className="h-full w-[18%] bg-[#E8102A] rounded-full" />
                      </div>
                      <span className="text-[9px] text-white/30 font-mono shrink-0">0:01 / 0:09</span>
                    </div>
                  </div>

                  {/* Metrics — Nolan's real Trackman numbers */}
                  <div className="flex flex-col">
                    <div className="px-3 py-2.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                      <p className="text-[9px] tracking-[0.2em] text-[#E8102A]" style={os}>Pitch Metrics</p>
                      <p className="text-[9px] text-white/30 mt-0.5">4-Seam · Jan 22</p>
                    </div>
                    {[
                      { label: 'Velocity',  value: '89 mph',  pct: 80, color: '#E8102A' },
                      { label: 'Spin Rate', value: '2,248',   pct: 68, color: '#3B82F6' },
                      { label: 'IVB',       value: '+18.7"',  pct: 88, color: '#10B981' },
                      { label: 'H. Break',  value: '+8.1"',   pct: 62, color: '#8B5CF6' },
                    ].map((m) => (
                      <div key={m.label} className="px-3 py-2.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                        <div className="flex justify-between mb-1.5">
                          <span className="text-[9px] text-white/35" style={os}>{m.label}</span>
                          <span className="text-[9px] font-mono text-white/80">{m.value}</span>
                        </div>
                        <div className="h-px rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${m.pct}%`, backgroundColor: m.color }} />
                        </div>
                      </div>
                    ))}
                    <div className="px-3 py-2 border-b flex justify-between items-center" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)' }}>
                      <span className="text-[9px] text-white/30" style={os}>College</span>
                      <span className="text-[9px] font-medium" style={{ ...os, color: '#10B981' }}>Elite ↑</span>
                    </div>
                    <div className="flex-1 p-3 space-y-2 overflow-hidden">
                      <p className="text-[9px] tracking-[0.15em] text-white/25 mb-2" style={os}>AI Coach</p>
                      <div className="bg-[#E8102A] rounded-xl rounded-br-none px-2 py-1.5 ml-2 text-[9px] text-white leading-snug">
                        Is his IVB elite?
                      </div>
                      <div className="rounded-xl rounded-bl-none px-2 py-1.5 mr-2 text-[9px] leading-snug"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>
                        +18.7" puts him <span className="text-white font-medium">top 10%</span> at college level.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Scoreboard strip ── */}
      <div className="border-y border-slate-100">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-3 divide-x divide-slate-100">
          {[
            { n: 'All Levels', sub: 'Youth → Pro',          color: '#E8102A' },
            { n: 'Any Device', sub: 'CSV & PDF import',       color: '#3B82F6' },
            { n: 'AI Coach',   sub: 'Age-group benchmarks',  color: '#10B981' },
          ].map((s) => (
            <div key={s.n} className="py-8 text-center px-4 group cursor-default">
              <p className="text-[clamp(20px,3vw,32px)] text-slate-950 leading-none mb-1.5 tracking-tight transition-colors group-hover:text-[color:var(--c)]" style={{ ...os, '--c': s.color } as React.CSSProperties}>{s.n}</p>
              <p className="text-xs text-slate-400">{s.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Features ── */}
      <section className="max-w-7xl mx-auto px-6 py-28 md:py-40">
        <div className="mb-16 animate-fade-up">
          <p className="text-[10px] tracking-[0.35em] text-slate-400 mb-4" style={os}>Platform Features</p>
          <h2 className="text-[clamp(36px,5vw,64px)] leading-[0.88] text-slate-950 tracking-tight" style={os}>
            Everything<br />in One Place.
          </h2>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">

          {/* Video Analysis */}
          <SpotlightCard
            className="rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
            style={{ background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
          >
            <div className="p-8">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-6" style={{ background: 'rgba(232,16,42,0.08)' }}>
                <svg className="w-5 h-5 text-[#E8102A]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.868v6.264a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                </svg>
              </div>
              <p className="text-[10px] tracking-[0.2em] text-[#E8102A] mb-4" style={os}>01 — Video Analysis</p>
              <h3 className="text-[clamp(22px,3vw,32px)] leading-[0.9] text-slate-950 mb-4 tracking-tight" style={os}>
                Annotate<br />Every<br />Frame.
              </h3>
              <p className="text-sm text-slate-500 leading-[1.85]">
                Draw directly on video. Mark arm angles, hip rotation, and release points. Every annotation timestamped and shared instantly.
              </p>
              <div className="mt-6 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.08)' }}>
                <div className="relative overflow-hidden" style={{ paddingBottom: '66.67%' }}>
                  <Image
                    src="/media/nolan-finish.jpg"
                    alt="Pitch delivery"
                    fill
                    className="object-cover"
                    sizes="400px"
                  />
                  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 267" preserveAspectRatio="xMidYMid slice">
                    {/* Glove tuck after release */}
                    <circle cx="230" cy="107" r="15" fill="none" stroke="#E8102A" strokeWidth="2.2" opacity="0.95" />
                    <circle cx="230" cy="107" r="4" fill="#E8102A" opacity="0.95" />
                    {/* Trail leg shoe — raised behind in follow-through */}
                    <circle cx="110" cy="72" r="14" fill="none" stroke="#3B82F6" strokeWidth="1.8" opacity="0.88" />
                  </svg>
                  <div className="absolute top-2 left-2">
                    <span className="text-[9px] bg-[#E8102A] text-white px-1.5 py-0.5 rounded font-mono">0:06.4</span>
                  </div>
                  <div className="absolute top-2 right-2">
                    <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.15)' }}>Follow-through</span>
                  </div>
                </div>
                <div className="px-4 py-2.5 flex items-center gap-3 border-t" style={{ background: '#0A0F1A', borderColor: 'rgba(255,255,255,0.07)' }}>
                  <div className="w-5 h-5 rounded-full bg-[#E8102A] flex items-center justify-center shrink-0">
                    <span className="text-white text-[7px]">▶</span>
                  </div>
                  <div className="flex-1 h-px rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                    <div className="h-full w-[72%] bg-[#E8102A] rounded-full" />
                  </div>
                  <span className="text-[10px] text-white/30 font-mono shrink-0">0:06 / 0:09</span>
                </div>
              </div>
            </div>
          </SpotlightCard>

          {/* Rapsodo */}
          <SpotlightCard
            className="rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
            style={{ background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
          >
            <div className="p-8">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-6" style={{ background: 'rgba(59,130,246,0.08)' }}>
                <svg className="w-5 h-5 text-[#3B82F6]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p className="text-[10px] tracking-[0.2em] text-[#3B82F6] mb-4" style={os}>02 — Pitch Analytics</p>
              <h3 className="text-[clamp(22px,3vw,32px)] leading-[0.9] text-slate-950 mb-2 tracking-tight" style={os}>
                Data That<br />Means<br />Something.
              </h3>
              <p className="text-[10px] text-slate-400 mb-5">TrackMan · Rapsodo · Hawk-Eye · CSV · PDF</p>
              <div className="space-y-2.5 mt-2">
                {[
                  { label: 'Velocity',   value: '89 mph',    pct: 80, color: '#E8102A' },
                  { label: 'Spin Rate',  value: '2,248 rpm', pct: 68, color: '#3B82F6' },
                  { label: 'IVB',        value: '+18.7"',    pct: 88, color: '#10B981' },
                  { label: 'H-Break',    value: '+8.1"',     pct: 62, color: '#8B5CF6' },
                  { label: 'Spin Axis',  value: '1:00',      pct: 55, color: '#F59E0B' },
                  { label: 'Extension',  value: '6.4 ft',    pct: 74, color: '#06B6D4' },
                  { label: 'VAA',        value: '-4.2°',     pct: 70, color: '#EC4899' },
                ].map((m) => (
                  <div key={m.label}>
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] text-slate-500" style={os}>{m.label}</span>
                      <span className="text-[10px] font-mono text-slate-700 font-medium">{m.value}</span>
                    </div>
                    <div className="h-1 rounded-full overflow-hidden bg-slate-100">
                      <div className="h-full rounded-full" style={{ width: `${m.pct}%`, backgroundColor: m.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </SpotlightCard>

          {/* AI Coach */}
          <SpotlightCard
            className="rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
            style={{ background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
          >
            <div className="p-8">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-6" style={{ background: 'rgba(16,185,129,0.08)' }}>
                <svg className="w-5 h-5 text-[#10B981]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
              </div>
              <p className="text-[10px] tracking-[0.2em] text-[#10B981] mb-4" style={os}>03 — AI Coach</p>
              <h3 className="text-[clamp(22px,3vw,32px)] leading-[0.9] text-slate-950 mb-5 tracking-tight" style={os}>
                An Expert<br />In Every<br />Session.
              </h3>
              <div className="space-y-2.5">
                <div className="flex justify-end">
                  <div className="max-w-[88%] bg-[#E8102A] rounded-xl rounded-br-sm px-3 py-2 text-xs text-white leading-relaxed">
                    His curveball movement has been all over the place lately.
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="max-w-[96%] rounded-xl rounded-bl-sm px-3 py-2.5 text-xs leading-relaxed bg-slate-50 border border-slate-200 text-slate-600 space-y-1.5">
                    <p>Spin rate is consistent — <span className="text-slate-900 font-semibold">2,340–2,380 rpm across all 4 sessions.</span> That&apos;s not the problem.</p>
                    <p>His spin axis is drifting <span className="text-slate-900 font-semibold">from 6:30 to 8:00</span> rep to rep. When it&apos;s at 6:30 the break is tight. When it climbs toward 8, the ball flattens out and rolls instead of biting.</p>
                    <p className="text-slate-900 font-semibold">He&apos;s got two different releases on what he thinks is one pitch.</p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <div className="max-w-[88%] bg-[#E8102A] rounded-xl rounded-br-sm px-3 py-2 text-xs text-white leading-relaxed">
                    How do I get him to feel the difference?
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="max-w-[96%] rounded-xl rounded-bl-sm px-3 py-2.5 text-xs leading-relaxed bg-slate-50 border border-slate-200 text-slate-600">
                    Cue him to feel his middle finger <span className="text-slate-900 font-semibold">pulling straight down the 12 o&apos;clock seam</span> — not around it. One focused pen, 10–12 reps at full intent. Watch the axis lock in.
                  </div>
                </div>
              </div>
            </div>
          </SpotlightCard>

        </div>
      </section>

      {/* ── How It Works ── */}
      <section style={{ borderTop: '1px solid #e2e8f0', background: '#fafafa' }}>
        <div className="max-w-5xl mx-auto px-6 py-24 md:py-36">
          <p className="text-[10px] tracking-[0.35em] text-slate-400 mb-16 text-center" style={os}>How It Works</p>
          <div className="grid md:grid-cols-3 gap-10">
            {[
              { n: '01', t: 'Build Your Program',   d: 'Create teams by age group. Invite players by email. Guardian consent handled automatically.' },
              { n: '02', t: 'Upload & Analyze',     d: 'Add clips, annotate mechanics, import pitch data files. Everything linked to the player.' },
              { n: '03', t: 'Players Get It All',   d: 'Every annotation, metric, and AI insight is shared with the player instantly.' },
            ].map((s, i) => (
              <div key={s.n} className="group">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-6 transition-all duration-300 group-hover:scale-110"
                  style={{ background: 'rgba(232,16,42,0.08)', border: '1px solid rgba(232,16,42,0.12)' }}>
                  <p className="text-lg text-[#E8102A] leading-none tracking-tight font-bold" style={os}>{String(i + 1).padStart(2, '0')}</p>
                </div>
                <p className="text-lg text-slate-950 mb-2.5 tracking-tight font-semibold" style={os}>{s.t}</p>
                <p className="text-sm text-slate-500 leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Age groups ── */}
      <section className="max-w-4xl mx-auto px-6 py-20 text-center">
        <p className="text-[10px] tracking-[0.3em] text-slate-400 mb-6" style={os}>All pitchers welcome · All levels</p>
        <div className="flex items-center justify-center flex-wrap gap-2">
          {['Youth', 'Middle School', 'High School', 'College', 'Professional', 'Pitching Coordinators', 'Pitching Coaches'].map((age) => (
            <span key={age}
              className="px-5 py-2 rounded-lg text-xs text-slate-500 hover:text-[#E8102A] hover:border-[#E8102A]/30 hover:bg-red-50 transition-all cursor-default"
              style={{ ...os, border: '1px solid #e2e8f0' }}
            >
              {age}
            </span>
          ))}
        </div>
      </section>

      {/* ── Founder ── */}
      <section style={{ borderTop: '1px solid #e2e8f0', background: '#fff' }}>
        <div className="max-w-5xl mx-auto px-6 py-24 md:py-36">
          <div className="grid md:grid-cols-2 gap-16 md:gap-24 items-start">

            {/* Story */}
            <div className="space-y-6 md:sticky md:top-24">
              <p className="text-[10px] tracking-[0.35em] text-[#E8102A]" style={os}>Built by a pitcher</p>
              <h2 className="text-[clamp(32px,4vw,52px)] leading-[0.92] text-slate-950 tracking-tight" style={os}>
                This tool didn&apos;t exist.<br />
                <span className="text-[#E8102A]">So I built it.</span>
              </h2>
              <p className="text-base text-slate-500 leading-relaxed">
                I spent years on the mound collecting data — velocity readings, spin numbers, video from bullpens — and none of it was connected. Coaches couldn&apos;t share it easily. Players couldn&apos;t access it. Every insight lived in someone&apos;s notes app or a spreadsheet no one could find.
              </p>
              <p className="text-base text-slate-500 leading-relaxed">
                Release Point is everything I wished existed when I was playing. One place for coaches to upload, annotate, and analyze — and for players to actually receive what their coach sees in real time.
              </p>

              {/* Career stats — longevity & control */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                {[
                  { label: 'Innings Pitched', val: '71.0 IP', sub: '2025 season · 21 appearances' },
                  { label: 'Command', val: '3.11 K/BB', sub: '56 K · 18 BB' },
                  { label: 'Strikeouts', val: '56 K', sub: 'San Jose State Spartans' },
                  { label: 'Control', val: '18 BB', sub: 'in 71 innings pitched' },
                ].map(s => (
                  <div key={s.label} className="rounded-xl p-3 border border-[#DDE4ED]">
                    <p className="text-[10px] text-[#C8102E] tracking-widest mb-1" style={os}>{s.label}</p>
                    <p className="text-sm font-semibold text-slate-900">{s.val}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{s.sub}</p>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-4 pt-2">
                <div className="w-10 h-10 rounded-full overflow-hidden relative shrink-0 border-2 border-[#E8102A]/20">
                  <Image src="/media/nolan-followthrough.jpg" alt="Nolan George" fill className="object-cover object-top" sizes="40px" />
                </div>
                <div>
                  <p className="text-sm text-slate-950 font-semibold" style={os}>Nolan George</p>
                  <p className="text-xs text-slate-400">Founder · Former Professional Pitcher</p>
                </div>
              </div>
            </div>

            {/* Interactive photo gallery */}
            <div>
              <PhotoGallery />
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative overflow-hidden bg-slate-950">
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 110%, rgba(232,16,42,0.15) 0%, transparent 65%)' }} />
        <div className="relative max-w-4xl mx-auto px-6 py-36 md:py-52 text-center">
          <p className="text-[10px] tracking-[0.35em] text-white/30 mb-6" style={os}>Join the platform</p>
          <h2 className="text-[clamp(44px,8vw,88px)] leading-[0.88] text-white mb-10 tracking-tight" style={os}>
            Upgrade Your<br />Program<br /><span className="text-[#E8102A]">Today.</span>
          </h2>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/auth/signup"
              className="inline-block px-12 py-4 bg-[#E8102A] hover:bg-[#C80E24] active:scale-95 text-white text-sm rounded-xl transition-all shadow-[0_4px_24px_rgba(232,16,42,0.3)] hover:shadow-[0_8px_40px_rgba(232,16,42,0.4)]"
              style={os}
            >
              Start Free — Coaches
            </Link>
            <Link
              href="/auth/login"
              className="inline-block px-12 py-4 text-sm rounded-xl transition-all text-white/60 hover:text-white border border-white/10 hover:border-white/20 hover:bg-white/5"
              style={os}
            >
              Player Login
            </Link>
          </div>
          <p className="text-xs text-white/20 mt-6">Free for coaches · No credit card required</p>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
