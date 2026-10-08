import Link from 'next/link'
import Logo from '@/components/Logo'
import { PARENT_CONSENT_UNAVAILABLE } from '@/lib/under13-mode'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

// Parent consent isn't available in the app yet (compliance spec: under 13 is
// a hard stop until the admin-reviewed flow ships). Old consent links land
// here and get a clear message; nothing is read or written.
export default function ConsentPage() {
  return (
    <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="flex justify-center mb-10">
          <Logo size="sm" />
        </div>
        <div className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
          <div className="h-1 bg-[#C8102E]" />
          <div className="p-8">
            <p className="text-[10px] tracking-[0.3em] text-[#C8102E] mb-4" style={oswald}>Parent Permission</p>
            <h1 className="text-2xl text-[#0F1F33] mb-4" style={oswald}>Coming Soon</h1>
            <p role="status" className="text-sm text-[#3D5166] leading-relaxed mb-6">{PARENT_CONSENT_UNAVAILABLE}</p>
            <p className="text-sm text-[#3D5166] leading-relaxed mb-8">
              Until then, nothing about players under 13 is collected, and video can&apos;t be added for them.
            </p>
            <Link href="/" className="inline-flex items-center min-h-11 text-sm text-[#0F1F33] hover:underline">Back to Release Point AI</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
