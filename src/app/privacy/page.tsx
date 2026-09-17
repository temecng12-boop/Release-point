import Link from 'next/link'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#060F1A] text-[#E8EDF5]">
      <header className="bg-[#0B1E36] border-b border-[#1C3A5C] px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span>⚾</span>
          <span className="text-sm tracking-widest" style={oswald}>Release Point</span>
        </Link>
        <Link href="/" className="text-xs text-[#9FB3CC] hover:text-white transition-colors">← Home</Link>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16 space-y-10">
        <div>
          <p className="text-xs text-[#C8102E] tracking-widest mb-2" style={oswald}>Legal</p>
          <h1 className="text-4xl text-[#E8EDF5] mb-2" style={oswald}>Privacy Policy</h1>
          <p className="text-xs text-[#4A6880]">Last updated: September 2026</p>
        </div>

        <div className="bg-[#0B1E36] border border-[#1C3A5C] rounded-lg p-5">
          <p className="text-xs text-[#9FB3CC] leading-relaxed">
            <strong className="text-[#E8EDF5]">Note:</strong> This Privacy Policy is provided as a good-faith effort to explain how Release Point handles data. It does not constitute legal advice. If you have specific compliance requirements, consult a licensed attorney.
          </p>
        </div>

        {[
          {
            title: '1. Who We Are',
            body: `Release Point ("we," "us," or "our") is a baseball and softball mechanics analysis platform designed for coaches and players. This Privacy Policy explains how we collect, use, and protect information when you use our service at releasepoint.app.`,
          },
          {
            title: '2. Information We Collect',
            body: `We collect:

**Account information** — When you sign up, we collect your name, email address, and password (hashed — never stored in plain text).

**Profile data** — Role (coach or player), team name, age group, position.

**Video and media files** — Clips you upload, voice recordings attached to clips, and any annotations made on those clips.

**Performance metrics** — Pitch data imported from Rapsodo CSV exports (velocity, spin rate, spin axis, break measurements).

**Usage data** — Timestamps, clip notes, and coaching feedback entered into the platform.

**Technical data** — Browser type, device type, IP address, and standard server logs collected automatically.`,
          },
          {
            title: '3. How We Use Your Information',
            body: `We use your data to:

- Provide and operate the Release Point platform
- Enable coaches to share video analysis and feedback with their players
- Power AI-assisted coaching analysis using your metrics and clip context
- Send authentication emails (magic links, password resets)
- Improve platform performance and fix bugs

We do not sell your data to third parties. We do not use your data for advertising.`,
          },
          {
            title: '4. Third-Party Services',
            body: `We use the following third-party services to operate the platform:

**Supabase** (supabase.com) — Database, authentication, and file storage. Your data is stored on Supabase's infrastructure. See supabase.com/privacy.

**Anthropic** (anthropic.com) — Powers the AI Coach feature. When you use AI Coach, the conversation content and player context (name, age group, position, metrics) are sent to Anthropic's API. Anthropic does not train on API data by default. See anthropic.com/privacy.

We do not share data with any other third parties.`,
          },
          {
            title: '5. Children\'s Privacy (COPPA)',
            body: `Release Point is used to analyze youth athletes, including players under the age of 13. We do not knowingly create accounts for children under 13. Player accounts are created by their coaches (adults) via invitation — players do not self-register.

Coaches are responsible for obtaining appropriate consent from the parents or guardians of any players under 13 before adding them to the platform or uploading video of them.

If you believe a child under 13 has been added to the platform without proper parental consent, contact us immediately at the email below and we will remove the data.`,
          },
          {
            title: '6. Video and Performance Data',
            body: `Videos, voice recordings, and Rapsodo metrics uploaded to Release Point are stored securely in Supabase Storage and are accessible only to:

- The coach who uploaded the content
- The player the content is associated with

Videos are served via time-limited signed URLs. Files are not publicly accessible by default.`,
          },
          {
            title: '7. Data Retention',
            body: `We retain your data for as long as your account is active. If you delete your account, we will delete your personal data and associated media files within 30 days, except where retention is required by law.

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
            body: `We implement industry-standard security measures including encrypted connections (HTTPS), hashed passwords, and row-level security policies on our database. No method of transmission over the internet is 100% secure — we cannot guarantee absolute security, but we take reasonable steps to protect your data.`,
          },
          {
            title: '10. Changes to This Policy',
            body: `We may update this Privacy Policy from time to time. We will notify users of material changes via email or a notice in the platform. Continued use of the platform after changes constitutes acceptance of the updated policy.`,
          },
          {
            title: '11. Contact',
            body: `For privacy questions, data requests, or concerns about a minor's data:\n\nEmail: privacy@releasepoint.app\n\nWe aim to respond to all requests within 5 business days.`,
          },
        ].map((section) => (
          <div key={section.title}>
            <h2 className="text-sm text-[#E8EDF5] mb-3" style={oswald}>{section.title}</h2>
            <div className="text-sm text-[#9FB3CC] leading-relaxed whitespace-pre-line">
              {section.body.split('\n').map((line, i) => {
                if (line.startsWith('**') && line.endsWith('**')) {
                  return <p key={i} className="font-semibold text-[#E8EDF5] mt-3 mb-1">{line.replace(/\*\*/g, '')}</p>
                }
                if (line.startsWith('**')) {
                  const parts = line.split('**')
                  return (
                    <p key={i} className="mb-1">
                      <strong className="text-[#E8EDF5]">{parts[1]}</strong>{parts[2]}
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

      <footer className="border-t border-[#1C3A5C] px-6 py-6 text-center">
        <div className="flex items-center justify-center gap-6 text-xs text-[#4A6880]">
          <Link href="/privacy" className="hover:text-[#9FB3CC] transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-[#9FB3CC] transition-colors">Terms of Service</Link>
          <Link href="/" className="hover:text-[#9FB3CC] transition-colors">Home</Link>
        </div>
      </footer>
    </div>
  )
}
