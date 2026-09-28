import Link from 'next/link'
import Logo from '@/components/Logo'
import SiteFooter from '@/components/SiteFooter'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export const metadata = {
  title: 'About — Release Point',
  description: 'The purpose, technology, and people behind Release Point.',
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-[#DDE4ED]" style={{ backgroundColor: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(8px)' }}>
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/"><Logo size="sm" /></Link>
          <nav className="flex items-center gap-6">
            <Link href="/" className="text-xs text-[#456080] hover:text-[#0F1F33] transition-colors" style={os}>Home</Link>
            <Link href="/auth/login" className="text-xs text-[#456080] hover:text-[#0F1F33] transition-colors" style={os}>Log In</Link>
            <Link
              href="/auth/signup"
              className="text-xs text-white px-4 py-2 rounded-md transition-colors"
              style={{ ...os, backgroundColor: '#C8102E' }}
            >
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-20">

        {/* Hero */}
        <div className="mb-20">
          <p className="text-xs text-[#C8102E] tracking-[0.3em] mb-4" style={os}>About Release Point</p>
          <h1 className="text-5xl sm:text-6xl text-[#0F1F33] leading-[0.95] mb-6" style={os}>
            Built for the way<br />baseball actually works
          </h1>
          <p className="text-lg text-[#456080] max-w-2xl leading-relaxed">
            Release Point is a player development platform that connects film, metrics, and coaching feedback in one place — so nothing falls through the cracks and players actually get better.
          </p>
        </div>

        <div className="w-full h-px bg-[#DDE4ED] mb-20" />

        {/* The Problem */}
        <section className="mb-20">
          <p className="text-xs text-[#C8102E] tracking-[0.3em] mb-4" style={os}>The Problem</p>
          <h2 className="text-3xl text-[#0F1F33] mb-6 leading-tight" style={os}>
            The data was always there.<br />It just never made it to the player.
          </h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {[
              { title: 'Film on a phone', body: 'Coaches record bullpen sessions, at-bats, and live games on their phones. The clips sit there. Players never see them with any context attached.' },
              { title: 'Metrics in a text thread', body: 'Spin rate, exit velocity, launch angle — coaches collect this from Rapsodo and Trackman sessions, then send raw numbers over text. It means nothing without context.' },
              { title: 'Notes that disappear', body: 'Coaching cues from a Tuesday bullpen session. A swing adjustment from a cage visit. A note about arm path on the 3-2 changeup. Gone by the following week.' },
              { title: 'No feedback loop', body: "Players practice, games happen, data is collected — but the line between what a player does and what a coach observes is never closed. Development becomes guesswork." },
            ].map(item => (
              <div key={item.title} className="bg-white rounded-xl border border-[#DDE4ED] p-6">
                <p className="text-sm font-semibold text-[#0F1F33] mb-2" style={os}>{item.title}</p>
                <p className="text-sm text-[#456080] leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="w-full h-px bg-[#DDE4ED] mb-20" />

        {/* The Solution */}
        <section className="mb-20">
          <p className="text-xs text-[#C8102E] tracking-[0.3em] mb-4" style={os}>The Solution</p>
          <h2 className="text-3xl text-[#0F1F33] mb-6 leading-tight" style={os}>
            One platform.<br />Film, metrics, and coaching — connected.
          </h2>
          <p className="text-[#456080] leading-relaxed mb-10 max-w-2xl">
            Release Point gives coaches a structured place to upload film, attach Rapsodo and Trackman data, and leave timestamped feedback — and gives players a single place to receive all of it. Every clip, every data point, every coaching note lives in the same record.
          </p>
          <div className="space-y-4">
            {[
              {
                label: 'Upload & Review',
                desc: 'Coaches upload game film, bullpen clips, and cage sessions directly from their phone or browser. Players can upload their own clips for review.',
              },
              {
                label: 'Mechanics Breakdown',
                desc: 'Every clip gets a phase-by-phase checklist — 7 delivery phases for pitchers (windup through follow through), 7 swing phases for hitters (stance through extension). Each phase gets a rating and a coaching note.',
              },
              {
                label: 'Rapsodo & Trackman Metrics',
                desc: 'Coaches enter session-level data directly in the platform — velocity, spin rate, spin axis, break, extension, and VAA for pitchers; exit velocity, launch angle, barrel rate, bat speed, and attack angle for hitters. Players see their numbers in context.',
              },
              {
                label: 'Timestamped Feedback',
                desc: 'Coaches can drop notes at exact moments in a clip — the 0:04 mark where the elbow drops, the 0:11 mark where hip rotation fires early. Players scrub to those moments directly.',
              },
              {
                label: 'Voice Notes',
                desc: 'Sometimes text is not enough. Coaches can record a voice note on any clip and attach it to the record. Players hear the feedback in the coach\'s own voice.',
              },
              {
                label: 'Crop & Reframe',
                desc: 'Not every angle is clean. The crop tool lets coaches isolate the relevant part of a clip — focus on the hip rotation, cut out the crowd, frame the release point — before sharing.',
              },
            ].map((item, i) => (
              <div key={item.label} className="flex gap-5 bg-white rounded-xl border border-[#DDE4ED] p-5">
                <span className="text-xs text-[#C8102E] shrink-0 mt-0.5 w-5" style={os}>{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <p className="text-sm font-semibold text-[#0F1F33] mb-1" style={os}>{item.label}</p>
                  <p className="text-sm text-[#456080] leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="w-full h-px bg-[#DDE4ED] mb-20" />

        {/* AI */}
        <section className="mb-20">
          <p className="text-xs text-[#C8102E] tracking-[0.3em] mb-4" style={os}>AI Coaching</p>
          <h2 className="text-3xl text-[#0F1F33] mb-6 leading-tight" style={os}>
            Randy and Barry.<br />Two agents, built for baseball.
          </h2>
          <p className="text-[#456080] leading-relaxed mb-10 max-w-2xl">
            Release Point has two AI coaching agents — one for pitching, one for hitting. Both are built on large language models trained with deep baseball biomechanics knowledge and Rapsodo/Trackman metric frameworks. They are not generic sports chatbots. They know what a 2400 RPM four-seam with 1:00 spin axis means at the high school level versus the professional level.
          </p>
          <div className="grid sm:grid-cols-2 gap-5">
            <div className="bg-white rounded-xl overflow-hidden border border-[#DDE4ED]">
              <div className="h-1 bg-[#C8102E]" />
              <div className="p-6">
                <p className="text-xl text-[#0F1F33] mb-1" style={os}>Randy</p>
                <p className="text-xs text-[#456080] mb-4" style={os}>Pitching AI</p>
                <ul className="space-y-2">
                  {[
                    'Pitch design and spin rate interpretation',
                    'Mechanical root cause analysis',
                    'Velocity and movement benchmarks by age level',
                    'Arm health and workload context',
                    'VAA, extension, and release point optimization',
                  ].map(pt => (
                    <li key={pt} className="flex items-start gap-2 text-sm text-[#456080]">
                      <span className="text-[#C8102E] shrink-0 mt-0.5">—</span>
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="bg-white rounded-xl overflow-hidden border border-[#DDE4ED]">
              <div className="h-1 bg-[#1C3A5C]" />
              <div className="p-6">
                <p className="text-xl text-[#0F1F33] mb-1" style={os}>Barry</p>
                <p className="text-xs text-[#456080] mb-4" style={os}>Hitting AI</p>
                <ul className="space-y-2">
                  {[
                    'Exit velocity and launch angle optimization',
                    'Swing path and attack angle analysis',
                    'Barrel rate and sweet spot interpretation',
                    'Hip-shoulder separation and rotation sequence',
                    'Bat speed benchmarks and contact consistency',
                  ].map(pt => (
                    <li key={pt} className="flex items-start gap-2 text-sm text-[#456080]">
                      <span className="text-[#1C3A5C] shrink-0 mt-0.5">—</span>
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <div className="w-full h-px bg-[#DDE4ED] mb-20" />

        {/* Tech */}
        <section className="mb-20">
          <p className="text-xs text-[#C8102E] tracking-[0.3em] mb-4" style={os}>The Technology</p>
          <h2 className="text-3xl text-[#0F1F33] mb-6 leading-tight" style={os}>
            Purpose-built infrastructure<br />for player development data.
          </h2>
          <p className="text-[#456080] leading-relaxed mb-10 max-w-2xl">
            Release Point is built on a modern full-stack architecture designed for real-time collaboration between coaches and players — with security and data privacy as a first-class concern.
          </p>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                label: 'Secure Video Storage',
                desc: 'Every clip is stored in private cloud buckets with signed, time-limited access URLs. A player\'s video is only accessible to that player and their assigned coach.',
              },
              {
                label: 'Real-Time Data',
                desc: 'Coach annotations, metrics, and notes update instantly across devices. The player sees feedback the moment a coach saves it.',
              },
              {
                label: 'AI at the Edge',
                desc: 'Both AI agents run on Anthropic\'s Claude, streaming responses in real time. Context from the clip — metrics, checklist, coach notes — is sent with every conversation.',
              },
              {
                label: 'Row-Level Security',
                desc: 'Every database query enforces access at the row level. A coach can only query their own players. A player can only see their own data.',
              },
              {
                label: 'Cross-Device',
                desc: 'Fully responsive on desktop and mobile. Coaches can upload from their phone after a bullpen session and players can review on the bus.',
              },
              {
                label: 'Metric Integrations',
                desc: 'Rapsodo and Trackman data is entered directly into the platform and stored alongside the film that produced it — keeping the full picture in one record.',
              },
            ].map(item => (
              <div key={item.label} className="bg-white rounded-xl border border-[#DDE4ED] p-5">
                <p className="text-xs font-semibold text-[#0F1F33] mb-2" style={os}>{item.label}</p>
                <p className="text-xs text-[#456080] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="w-full h-px bg-[#DDE4ED] mb-20" />

        {/* CTA */}
        <section className="text-center">
          <h2 className="text-4xl text-[#0F1F33] mb-4" style={os}>Ready to get started?</h2>
          <p className="text-[#456080] mb-8">Free to try. No credit card required.</p>
          <Link
            href="/auth/signup"
            className="inline-block text-sm text-white px-10 py-4 rounded-lg transition-colors"
            style={{ ...os, backgroundColor: '#C8102E' }}
          >
            Create a Coach Account
          </Link>
        </section>

      </main>

      <SiteFooter />
    </div>
  )
}
