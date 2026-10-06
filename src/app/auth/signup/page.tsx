import Link from 'next/link'
import Logo from '@/components/Logo'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export const metadata = {
  title: 'Internal testing · Release Point',
  description: 'Release Point is in internal testing. Join the waitlist for early access.',
}

/**
 * Public signup is invite-only during internal testing. The old coach/player
 * forms stay in signup-form.tsx for invite/confirm flows and tests; this page
 * is the holding screen for anyone who lands on /auth/signup without an invite.
 */
export default function SignupPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="px-6 md:px-12 h-14 flex items-center justify-between border-b border-[#e2e8f0]">
        <Logo size="md" wordmarkClass="inline" href="/home" />
        <Link href="/auth/login" className="text-xs text-[#456080] hover:text-[#0F1F33] transition-colors max-sm:min-h-11 max-sm:inline-flex max-sm:items-center" style={os}>
          Sign in
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-md rounded-2xl p-8 text-center" style={{ background: '#F8FAFC', border: '1px solid #DDE4ED' }}>
          <h1 className="text-2xl sm:text-3xl text-[#0F1F33] mb-4" style={os}>
            Release Point is in internal testing
          </h1>
          <p className="text-[#456080] text-sm mb-8 leading-relaxed">
            New accounts are invite-only for now. Join the waitlist and we&apos;ll reach out when your spot is ready.
          </p>
          <Link
            href="/waitlist"
            className="inline-flex items-center justify-center w-full bg-[#C8102E] hover:bg-[#9E0E24] text-white py-3 rounded-lg text-sm transition-colors max-sm:min-h-11"
            style={os}
          >
            Join the waitlist
          </Link>
          <p className="text-[#456080] text-xs mt-6">
            Already testing?{' '}
            <Link href="/auth/login" className="underline underline-offset-2 hover:text-[#0F1F33]">Sign in</Link>
          </p>
        </div>
      </main>
    </div>
  )
}
