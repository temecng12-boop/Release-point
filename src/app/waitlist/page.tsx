import Link from 'next/link'
import type { ResolvingMetadata } from 'next'
import WaitlistForm from './waitlist-form'
import Logo from '@/components/Logo'
import { pageMetadata } from '@/lib/site-meta'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export function generateMetadata(_props: unknown, parent: ResolvingMetadata) {
  return pageMetadata('/waitlist', parent, {
    title: 'Join the waitlist',
    description:
      'Pitching and hitting video annotation and AI Coach insights for coaches, shared with your players. Now in internal testing.',
  })
}

const FEATURES = [
  'Frame-by-frame video markup for pitching and hitting',
  'AI Coach as a second opinion',
  'Shared with every player',
  'Youth through pro',
]

export default async function WaitlistPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const reason = (await searchParams).reason
  const inviteOnly = reason === 'invite_only'
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-6 md:px-12 h-14 flex items-center justify-between border-b border-[#e2e8f0]">
        <Logo size="md" wordmarkClass="inline" href="/home" />
        <Link href="/auth/login" className="text-xs text-[#456080] hover:text-[#0F1F33] transition-colors max-sm:min-h-11 max-sm:inline-flex max-sm:items-center" style={os}>
          Sign in
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div
          className="inline-flex items-center gap-2 mb-8 px-3 py-1.5 rounded-full border text-[10px] tracking-[0.25em]"
          style={{ ...os, borderColor: 'rgba(200,16,46,0.4)', color: '#C8102E', background: 'rgba(200,16,46,0.06)' }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#C8102E] animate-pulse" />
          In internal testing
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl text-[#0F1F33] text-center leading-tight mb-4 max-w-2xl" style={os}>
          Join the waitlist
        </h1>

        {inviteOnly && (
          <p role="status" className="text-sm text-[#0F1F33] text-center max-w-md mb-4 leading-relaxed rounded-lg px-4 py-3" style={{ background: '#F0F4F8', border: '1px solid #DDE4ED' }}>
            Release Point is invite-only right now, so that account wasn&apos;t created. Join the waitlist below and we&apos;ll reach out when your spot is ready.
          </p>
        )}

        <p className="text-[#456080] text-sm sm:text-base text-center max-w-md mb-8 leading-relaxed">
          Release Point is a web app for coaches to upload and annotate pitching and hitting video frame by frame,
          get AI Coach insights, and share it all with their players, from youth to pro.
        </p>

        <ul className="text-[#456080] text-sm max-w-md mb-6 space-y-2 w-full">
          {FEATURES.map(f => (
            <li key={f} className="flex gap-2 items-start">
              <svg className="w-4 h-4 text-[#C8102E] shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span>{f}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap justify-center gap-2 mb-12">
          {['Pitching and hitting', 'Youth through pro'].map(f => (
            <span
              key={f}
              className="text-[10px] tracking-wider px-3 py-1 rounded-full"
              style={{ ...os, background: '#F0F4F8', color: '#456080', border: '1px solid #DDE4ED' }}
            >
              {f}
            </span>
          ))}
        </div>

        <div className="w-full max-w-md rounded-2xl p-8" style={{ background: '#F8FAFC', border: '1px solid #DDE4ED' }}>
          <p className="text-[#0F1F33] text-sm font-medium mb-1" style={os}>Get early access</p>
          <p className="text-[#456080] text-xs mb-6">
            We&apos;re testing with a small group right now. We&apos;ll reach out when your spot is ready.
          </p>
          <WaitlistForm />
        </div>
      </main>

      <footer className="px-6 py-5 text-center border-t border-[#e2e8f0]">
        <p className="text-[#8096AE] text-xs">&copy; {new Date().getFullYear()} Release Point AI. All rights reserved.</p>
      </footer>
    </div>
  )
}
