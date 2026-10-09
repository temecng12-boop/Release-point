import Link from 'next/link'
import type { ResolvingMetadata } from 'next'
import Logo from '@/components/Logo'
import { LEGAL_ENTITY_PLACEHOLDER, pageMetadata } from '@/lib/site-meta'
import { CHILDREN_AND_TEENS_BODY, CHILDREN_AND_TEENS_TITLE } from '@/lib/privacy-children'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export function generateMetadata(_props: unknown, parent: ResolvingMetadata) {
  return pageMetadata('/privacy', parent, {
    title: 'Privacy Policy',
    description: 'How Release Point AI collects, uses, and protects your information.',
  })
}

// Inline **bold** inside bullet lines (the Children and Teens section uses
// "- **Label** rest" bullets); other lines keep the block patterns below.
function renderInlineBold(text: string, keyPrefix: string) {
  const parts = text.split('**')
  if (parts.length === 1) return text
  return parts.map((part, j) =>
    j % 2 === 1 ? <strong key={`${keyPrefix}-${j}`} className="text-[#0F1F33]">{part}</strong> : <span key={`${keyPrefix}-${j}`}>{part}</span>,
  )
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#F5F7FA] text-[#0F1F33]">
      <header className="bg-white border-b border-[#DDE4ED] px-6 py-4 flex items-center justify-between">
        <Logo size="sm" href="/home" />
        <Link href="/home" className="text-xs text-[#456080] hover:text-[#0F1F33] transition-colors">← Home</Link>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16 space-y-10">
        <div>
          <p className="text-xs text-[#C8102E] tracking-widest mb-2" style={oswald}>Legal</p>
          <h1 className="text-4xl text-[#0F1F33] mb-2" style={oswald}>Privacy Policy</h1>
          <p className="text-xs text-[#3D5166]">Last updated: [EFFECTIVE_DATE]</p>
        </div>

        {[
          {
            title: '1. Who We Are',
            body: `Release Point AI ("Release Point AI," "we," "us," or "our") is a baseball pitching and hitting development app used by coaches and players. Release Point AI is operated by Nolan George (${LEGAL_ENTITY_PLACEHOLDER}, a Nevada LLC, once formed). This Privacy Policy explains how we collect, use, and protect information when you use our service at releasepointai.com.`,
          },
          {
            title: '2. Information We Collect',
            body: `We collect:

**Account information:** When you sign up, we collect your name, email address, birth month and year, and password (hashed, never stored in plain text). Your birth month and year are used once to confirm your age band and are never stored.

**Sign-in with Google or Apple:** If you sign in with Google (or Apple, where offered), we receive your name, email address, and an account ID from that provider.

**Parent or guardian accounts:** We don't have parent or guardian accounts yet, so we don't collect a parent's name, email, relationship, or a signed permission form.

**Profile data:** Role (coach or player), team name, age group, position.

**Video and media files:** Clips you upload, voice recordings attached to clips, and any annotations made on those clips.

**Performance metrics:** Pitching and hitting metrics entered or imported into the platform, including CSV and PDF imports (for example velocity, spin rate, exit velocity, and launch angle).

**Usage data:** Timestamps, clip notes, and coaching feedback entered into the platform.

**Problem reports:** If you report a problem, we collect your message plus device, browser, and viewport details, and a screenshot if you attach one.

**Technical data:** Browser type, device type, IP address, and standard server logs collected automatically.`,
          },
          {
            title: '3. How We Use Your Information',
            body: `We use your data to:

- Provide and operate the Release Point AI platform
- Enable coaches to share video analysis and feedback with their players
- Power AI-assisted coaching analysis using your metrics and clip context
- Send authentication emails (magic links, password resets)
- Improve platform performance and fix bugs

We do not sell your data to third parties. We do not use your data for advertising.`,
          },
          {
            title: '4. Third-Party Services',
            body: `We use the following third-party services to operate the platform:

**Supabase** (supabase.com): Database, authentication, and file storage. Your data is stored on Supabase's infrastructure. See supabase.com/privacy.

**Anthropic** (anthropic.com): AI Coach runs on Anthropic's Claude. Each conversation sends your message plus the player's name, age group, position, session pitch and hitting metrics, mechanics checklist, coach notes, and clip details such as titles and dates. Clip analysis also sends still frames from a clip to Anthropic. Anthropic does not train models on customer content sent through its API (see anthropic.com/legal/commercial-terms).

**Google and Apple** (sign-in only): If you choose to sign in with Google (or Apple, where offered), that provider confirms your sign-in and shares your name, email address, and an account ID with us.

**YouTube Data API** (Google): The clip compare search sends only the search query text you type to Google's YouTube Data API (youtube/v3/search). We don't send your name, email, or video files. If you paste a YouTube URL to compare, the browser loads that video from youtube.com by its video id.

**Vercel** (vercel.com): Hosts the Release Point AI website and collects anonymous performance analytics. See vercel.com/privacy.

**Resend** (resend.com): Sends our emails (sign-in links, invites, password resets) from notifications@releasepointai.com. See resend.com/privacy.

**unpkg** (unpkg.com): When a coach compresses a large upload in the browser, the browser downloads @ffmpeg/core (the ffmpeg web files) from unpkg.com. That download sends no user content. The video file stays in the browser.

We don't sell your data, and we don't share it with anyone except the service providers listed here.`,
          },
          {
            title: CHILDREN_AND_TEENS_TITLE,
            body: CHILDREN_AND_TEENS_BODY,
          },
          {
            title: '6. Video and Performance Data',
            body: `Videos, voice recordings, and pitching and hitting metrics uploaded to Release Point AI are stored in Supabase Storage. A player's video can be seen by the player, the player's direct coach, the other coaches on teams the player is on (including assistant coaches), and the player's linked guardian. A player's video can be uploaded by the player's direct coach, the coaches on teams the player is on (including assistant coaches), and the player.

Videos are served via time-limited signed URLs. Files are not publicly accessible by default.`,
          },
          {
            title: '7. Data Retention',
            body: `We retain your data for as long as your account is active. If you delete your account, we delete your personal data and associated media files, except where retention is required by law.

You may request deletion of specific clips or your entire account at any time by contacting us.`,
          },
          {
            title: '8. Your Rights',
            body: `Depending on your location, you may have the right to:

- Access the personal data we hold about you
- Correct inaccurate data
- Delete your data
- Export your data
- Withdraw consent for AI processing

To exercise any of these rights, contact us at the address below.`,
          },
          {
            title: '9. Security',
            body: `We implement industry-standard security measures including encrypted connections (HTTPS), hashed passwords, and row-level security policies on our database. No method of transmission over the internet is 100% secure. We cannot guarantee absolute security, but we take reasonable steps to protect your data.`,
          },
          {
            title: '10. Changes to This Policy',
            body: `We may update this Privacy Policy from time to time. We will notify users of material changes via email or a notice in the platform. Continued use of the platform after changes constitutes acceptance of the updated policy. This policy is governed by the laws of the State of Nevada and applicable U.S. federal law.`,
          },
          {
            title: '11. Contact',
            body: `For privacy questions, data requests, or concerns about a minor's data:\n\nEmail: privacy@releasepointai.com\n\nWe'll reply as soon as we can.`,
          },
        ].map((section) => (
          <div key={section.title}>
            <h2 className="text-sm text-[#0F1F33] mb-3" style={oswald}>{section.title}</h2>
            <div className="text-sm text-[#456080] leading-relaxed whitespace-pre-line">
              {section.body.split('\n').map((line, i) => {
                if (line.startsWith('**') && line.endsWith('**')) {
                  return <p key={i} className="font-semibold text-[#0F1F33] mt-3 mb-1">{line.replace(/\*\*/g, '')}</p>
                }
                if (line.startsWith('**')) {
                  const parts = line.split('**')
                  return (
                    <p key={i} className="mb-1">
                      <strong className="text-[#0F1F33]">{parts[1]}</strong>{parts[2]}
                    </p>
                  )
                }
                if (line.startsWith('- ')) {
                  return <p key={i} className="flex gap-2 mb-1"><span className="text-[#C8102E] shrink-0">–</span><span>{renderInlineBold(line.slice(2), `s5-${i}`)}</span></p>
                }
                if (line === '') return <br key={i} />
                return <p key={i} className="mb-2">{line}</p>
              })}
            </div>
          </div>
        ))}
      </main>

      <footer className="border-t border-[#DDE4ED] px-6 py-6 text-center">
        <div className="flex items-center justify-center gap-6 text-xs text-[#3D5166]">
          <Link href="/privacy" className="hover:text-[#456080] transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-[#456080] transition-colors">Terms of Service</Link>
          <Link href="/home" className="hover:text-[#456080] transition-colors">Home</Link>
        </div>
      </footer>
    </div>
  )
}
