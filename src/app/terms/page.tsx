import Link from 'next/link'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#F5F7FA] text-[#0F1F33]">
      <header className="bg-white border-b border-[#DDE4ED] px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span>⚾</span>
          <span className="text-sm tracking-widest text-[#1C2E4A]" style={oswald}>Release Point</span>
        </Link>
        <Link href="/" className="text-xs text-[#456080] hover:text-[#0F1F33] transition-colors">← Home</Link>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16 space-y-10">
        <div>
          <p className="text-xs text-[#C8102E] tracking-widest mb-2" style={oswald}>Legal</p>
          <h1 className="text-4xl text-[#0F1F33] mb-2" style={oswald}>Terms of Service</h1>
          <p className="text-xs text-[#3D5166]">Last updated: September 2026</p>
        </div>

        <div className="bg-white border border-[#DDE4ED] rounded-lg p-5 shadow-sm">
          <p className="text-xs text-[#456080] leading-relaxed">
            <strong className="text-[#0F1F33]">Note:</strong> These Terms of Service are provided in good faith. They do not constitute legal advice. For compliance requirements specific to your organization, consult a licensed attorney.
          </p>
        </div>

        {[
          {
            title: '1. Agreement to Terms',
            body: `By creating an account or using Release Point, you agree to these Terms of Service. If you are using Release Point on behalf of an organization (a team, program, or academy), you agree on behalf of that organization.

If you do not agree to these terms, do not use the platform.`,
          },
          {
            title: '2. Who Can Use Release Point',
            body: `**Coaches** — Any adult (18+) who coaches a baseball or softball program may create a coach account. You are responsible for the players you add to your account and any content you upload.

**Players** — Players join by invitation from their coach. Players under 18 must have parental or guardian consent to use the platform. By accepting an invitation, you confirm that appropriate consent has been obtained.

**Age restriction** — Direct account creation is limited to adults (18+). Players under 13 may not create their own accounts. Coaches creating accounts for players under 13 are responsible for obtaining verifiable parental consent (COPPA compliance).`,
          },
          {
            title: '3. Acceptable Use',
            body: `You agree not to:

- Upload content you do not own or have rights to use
- Upload video of minors without appropriate consent from parents or guardians
- Share your account credentials with others
- Use the platform for any purpose other than legitimate athletic coaching and analysis
- Attempt to reverse engineer, scrape, or otherwise misuse the platform
- Upload content that is abusive, harassing, discriminatory, or illegal
- Use the AI Coach feature to generate content that is harmful, misleading, or off-topic

We reserve the right to suspend or terminate accounts that violate these terms.`,
          },
          {
            title: '4. Your Content',
            body: `You own the videos, metrics, notes, and other content you upload to Release Point. By uploading content, you grant us a limited license to store and process that content to provide the platform's services.

We do not claim ownership of your content. We do not share your content with third parties except as described in our Privacy Policy (Supabase for storage, Anthropic for AI processing).

You are solely responsible for the content you upload and for obtaining any necessary rights, permissions, or consents — including from athletes and their parents.`,
          },
          {
            title: '5. AI Coach Disclaimer',
            body: `The AI Coach feature is powered by Anthropic's Claude AI and is provided for informational and coaching-support purposes only. AI-generated responses:

- Are not a substitute for professional coaching, medical, or biomechanical advice
- May contain errors or inaccuracies — always verify important information
- Should be used as a tool to support, not replace, coach judgment
- Are based on the data and context you provide

We are not liable for any decisions made based solely on AI Coach responses.`,
          },
          {
            title: '6. Video and Player Data',
            body: `Coaches are responsible for:

- Ensuring they have the right to upload any video they submit
- Obtaining written permission from parents or guardians before uploading video of minors
- Complying with any league, school, or organizational policies regarding video recording and sharing
- Not sharing player performance data without appropriate consent

Release Point provides tools for coaches to manage their content but is not responsible for how coaches use those tools.`,
          },
          {
            title: '7. Availability and Changes',
            body: `We aim to keep Release Point available and reliable, but we do not guarantee uninterrupted access. We may:

- Update or change features with or without notice
- Temporarily suspend the platform for maintenance
- Discontinue the platform with reasonable advance notice

We reserve the right to modify these Terms at any time. Continued use after changes means you accept the updated Terms.`,
          },
          {
            title: '8. Limitation of Liability',
            body: `To the maximum extent permitted by law, Release Point and its operators are not liable for:

- Loss of data, revenue, or profits
- Decisions made based on AI Coach responses
- Injuries or outcomes resulting from coaching advice
- Service interruptions or data loss
- Unauthorized access to your account if caused by your failure to secure your credentials

Our total liability for any claim arising from use of the platform is limited to the amount you paid us in the 12 months preceding the claim (or $0 if you used the platform for free).`,
          },
          {
            title: '9. Termination',
            body: `You may delete your account at any time. We may suspend or terminate your account if you violate these Terms.

Upon termination, your content will be deleted within 30 days unless we are required by law to retain it.`,
          },
          {
            title: '10. Governing Law',
            body: `These Terms are governed by the laws of the United States. Any disputes will be resolved through binding arbitration rather than in court, except for claims that qualify for small claims court.`,
          },
          {
            title: '11. Contact',
            body: `Questions about these Terms:\n\nEmail: legal@releasepoint.app\n\nWe respond to legal inquiries within 5 business days.`,
          },
        ].map((section) => (
          <div key={section.title}>
            <h2 className="text-sm text-[#0F1F33] mb-3" style={oswald}>{section.title}</h2>
            <div className="text-sm text-[#456080] leading-relaxed">
              {section.body.split('\n').map((line, i) => {
                if (line.startsWith('**') && line.endsWith('**')) {
                  return <p key={i} className="font-semibold text-[#0F1F33] mt-3 mb-1">{line.replace(/\*\*/g, '')}</p>
                }
                if (line.startsWith('**')) {
                  const parts = line.split('**')
                  return (
                    <p key={i} className="mb-2">
                      <strong className="text-[#0F1F33]">{parts[1]}</strong>{parts[2]}
                    </p>
                  )
                }
                if (line.startsWith('- ')) {
                  return <p key={i} className="flex gap-2 mb-1"><span className="text-[#C8102E] shrink-0">–</span>{line.slice(2)}</p>
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
          <Link href="/" className="hover:text-[#456080] transition-colors">Home</Link>
        </div>
      </footer>
    </div>
  )
}
