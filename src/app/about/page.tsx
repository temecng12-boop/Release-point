import Link from 'next/link'
import type { ResolvingMetadata } from 'next'
import Logo from '@/components/Logo'
import SiteFooter from '@/components/SiteFooter'
import { pageMetadata } from '@/lib/site-meta'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export function generateMetadata(_props: unknown, parent: ResolvingMetadata) {
  return pageMetadata('/about', parent, {
    title: 'About',
    description: 'The purpose, technology, and people behind Release Point AI.',
  })
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-[#DDE4ED]" style={{ backgroundColor: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(8px)' }}>
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/home"><Logo size="sm" /></Link>
          <nav className="flex items-center gap-6">
            <Link href="/home" className="text-xs text-[#456080] hover:text-[#0F1F33] transition-colors" style={os}>Home</Link>
            <Link href="/auth/login" className="text-xs text-[#456080] hover:text-[#0F1F33] transition-colors max-sm:min-h-11 max-sm:inline-flex max-sm:items-center" style={os}>Sign in</Link>
            <Link
              href="/waitlist"
              className="text-xs text-white px-4 py-2 rounded-md transition-colors max-sm:min-h-11 max-sm:inline-flex max-sm:items-center"
              style={{ ...os, backgroundColor: '#C8102E' }}
            >
              Join the waitlist
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-20">

        {/* Hero */}
        <div className="mb-20">
          <p className="text-xs text-[#C8102E] tracking-[0.3em] mb-4" style={os}>About Release Point AI</p>
          <h1 className="text-5xl sm:text-6xl text-[#0F1F33] leading-[0.95] mb-6" style={os}>
            Built for the way<br />baseball actually works
          </h1>
          <p className="text-lg text-[#456080] max-w-2xl leading-relaxed">
            Release Point AI is a player development platform that connects film, metrics, and coaching feedback in one place, so nothing falls through the cracks and players actually get better.
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
              { title: 'Metrics in a text thread', body: 'Spin rate, exit velocity, launch angle. Coaches collect this from pitch- and swing-tracking sessions, then send raw numbers over text. It means nothing without context.' },
              { title: 'Notes that disappear', body: 'Coaching cues from a Tuesday bullpen session. A swing adjustment from a cage visit. A note about arm path on the 3-2 changeup. Gone by the following week.' },
              { title: 'No feedback loop', body: "Players practice, games happen, data is collected. But the line between what a player does and what a coach observes is never closed. Development becomes guesswork." },
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
            One platform.<br />Film, metrics, and coaching, connected.
          </h2>
          <p className="text-[#456080] leading-relaxed mb-10 max-w-2xl">
            Release Point AI gives coaches a structured place to upload film, add pitching and hitting metrics, and leave timestamped feedback. Players get a single place to receive all of it. Every clip, every data point, every coaching note lives in the same record.
          </p>
          <div className="space-y-4">
            {[
              {
                label: 'Upload & Review',
                desc: 'Coaches upload game film, bullpen clips, and cage sessions directly from their phone or browser. Players can upload their own clips for review.',
              },
              {
                label: 'Mechanics Breakdown',
                desc: 'Every clip gets a phase-by-phase checklist: 7 delivery phases for pitchers (windup through follow through), 7 swing phases for hitters (stance through extension). Each phase gets a rating and a coaching note.',
              },
              {
                label: 'Session Metrics',
                desc: 'Coaches enter session-level data directly in the platform: velocity, spin rate, spin axis, break, extension, and VAA for pitchers; exit velocity, launch angle, barrel rate, bat speed, and attack angle for hitters. Players see their numbers in context.',
              },
              {
                label: 'Timestamped Feedback',
                desc: 'Coaches can drop notes at exact moments in a clip, like the 0:04 mark where the elbow drops or the 0:11 mark where hip rotation fires early. Players scrub to those moments directly.',
              },
              {
                label: 'Voice Notes',
                desc: 'Sometimes text is not enough. Coaches can record a voice note on any clip and attach it to the record. Players hear the feedback in the coach\'s own voice.',
              },
              {
                label: 'Crop & Reframe',
                desc: 'Not every angle is clean. The crop tool lets coaches isolate the relevant part of a clip, focus on the hip rotation, cut out the crowd, frame the release point, before sharing.',
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
            Release Point AI has two AI coaching agents, one for pitching and one for hitting. Both run on Anthropic's Claude, set up with baseball biomechanics and pitching and hitting metric frameworks, and given the full context of each clip. They are not generic sports chatbots. They know what a four-seam fastball at, for example, 2400 RPM with a 1:00 spin axis means at the high school level versus the professional level.
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
                      <span className="text-[#C8102E] shrink-0 mt-0.5">·</span>
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
                      <span className="text-[#1C3A5C] shrink-0 mt-0.5">·</span>
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
            Release Point AI is built on a modern full-stack architecture that lets coaches and players work from the same film, with security and data privacy as a first-class concern.
          </p>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                label: 'Secure Video Storage',
                desc: 'Clips are kept in cloud storage and played through signed links that expire after an hour. A player\'s video can be seen by the player, the player\'s direct coach, and the other coaches on teams the player is on.',
              },
              {
                label: 'Shared Feedback',
                desc: 'Coach annotations, metrics, and notes are saved with the clip. The player sees them the next time they open or refresh the clip, on any device.',
              },
              {
                label: 'Built on Claude',
                desc: 'Both AI agents run on Anthropic\'s Claude, streaming responses in real time. Context from the clip, including metrics, checklist, and coach notes, is sent with every conversation.',
              },
              {
                label: 'Access Checks',
                desc: 'The app checks your access on every request before it shows or changes a player\'s data, and database rules add a second layer of protection on direct access. A coach can see their own players and the players on teams they coach. A player can only see their own data.',
              },
              {
                label: 'Cross-Device',
                desc: 'Fully responsive on desktop and mobile. Coaches can upload from their phone after a bullpen session and players can review on the bus.',
              },
              {
                label: 'Metrics With Film',
                desc: 'Pitching and hitting metrics are entered directly into the platform and stored alongside the film that produced it, keeping the full picture in one record.',
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

        {/* Company */}
        <section className="mb-20">
          <p className="text-xs text-[#C8102E] tracking-[0.3em] mb-4" style={os}>Who We Are</p>
          <h2 className="text-3xl text-[#0F1F33] mb-6 leading-tight" style={os}>
            A startup built at the intersection of baseball and software.
          </h2>
          <div className="space-y-5 max-w-2xl">
            <p className="text-[#456080] leading-relaxed">
              Release Point AI is an early-stage company with one focus: closing the gap between the analytics that exist in baseball and the development that actually happens on the field. The data has never been the problem. Pitch tracking, swing tracking, and high-speed video have made it possible to measure almost everything. The problem is that most of that information never reaches the player in a useful form.
            </p>
            <p className="text-[#456080] leading-relaxed">
              We are building the software layer that connects coaches, players, and data, so that a spin rate from a Tuesday bullpen session ends up in the same place as the film from that session, the coach&apos;s notes from that session, and the AI that can put all of it in context. That feedback loop is what development actually looks like when it works.
            </p>
            <p className="text-[#456080] leading-relaxed">
              Release Point AI was founded by Nolan George, a pitcher with a lifetime on the mound, who competed at the University of Nevada Las Vegas, San Jose State University, and professionally with the Boise Hawks in the Pioneer League. After playing, he built the technical side from scratch. The platform reflects firsthand experience with what coaches have, what players need, and where the current tools fall short.
            </p>
          </div>
        </section>

        <div className="w-full h-px bg-[#DDE4ED] mb-20" />

        {/* CTA */}
        <section className="text-center">
          <h2 className="text-4xl text-[#0F1F33] mb-4" style={os}>Join the waitlist</h2>
          <p className="text-[#456080] mb-8">We&apos;re in internal testing, so new coaches start on the waitlist.</p>
          <Link
            href="/waitlist"
            className="inline-block text-sm text-white px-10 py-4 rounded-lg transition-colors max-sm:min-h-11"
            style={{ ...os, backgroundColor: '#C8102E' }}
          >
            Join the waitlist
          </Link>
        </section>

      </main>

      <SiteFooter />
    </div>
  )
}
