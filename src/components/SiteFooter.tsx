import Link from 'next/link'
import Logo from './Logo'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

interface Props {
  variant?: 'marketing' | 'app'
}

export default function SiteFooter({ variant = 'marketing' }: Props) {
  if (variant === 'app') {
    return (
      <footer className="border-t border-[#DDE4ED] px-5 md:px-8 py-5 mt-8">
        <p className="text-xs text-[#3D5166] text-center">
          Designed &amp; built by{' '}
          <a
            href="https://www.linkedin.com/in/nolangeorge12"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#1C3A5C] hover:text-[#C8102E] transition-colors hover:underline underline-offset-2"
          >
            Nolan George
          </a>
        </p>
      </footer>
    )
  }

  return (
    <footer className="border-t border-[#DDE4ED] bg-white">
      {/* Bio + links */}
      <div className="max-w-5xl mx-auto px-6 py-14 grid md:grid-cols-[1fr_auto] gap-12 items-start">
        <div>
          <Logo size="sm" wordmarkClass="inline" />
          <p className="mt-5 text-sm text-[#456080] leading-relaxed max-w-[420px]">
            Release Point was designed and built by <strong className="text-[#0F1F33] font-medium">Nolan George</strong> — a pitcher who competed at San Jose State University, the University of Nevada Las Vegas, and with the Boise Hawks. His career at the intersection of high-level amateur and independent baseball sparked a deep interest in AI and data-driven development, leading him to build a coaching platform he wishes had existed when he was coming up.
          </p>
          <a
            href="https://www.linkedin.com/in/nolangeorge12"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-5 text-xs text-[#1C3A5C] hover:text-[#C8102E] transition-colors font-medium"
            style={oswald}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
            Connect on LinkedIn
          </a>
        </div>

        <div className="flex flex-col gap-2.5">
          <p className="text-[10px] text-[#3D5166] tracking-widest mb-1" style={oswald}>Links</p>
          <Link href="/auth/signup" className="text-xs text-[#456080] hover:text-[#C8102E] transition-colors" style={oswald}>Coach Sign Up</Link>
          <Link href="/auth/login" className="text-xs text-[#456080] hover:text-[#C8102E] transition-colors" style={oswald}>Player Login</Link>
          <Link href="/about" className="text-xs text-[#456080] hover:text-[#C8102E] transition-colors" style={oswald}>About</Link>
          <Link href="/privacy" className="text-xs text-[#456080] hover:text-[#C8102E] transition-colors" style={oswald}>Privacy</Link>
          <Link href="/terms" className="text-xs text-[#456080] hover:text-[#C8102E] transition-colors" style={oswald}>Terms</Link>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-[#DDE4ED] px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
        <p className="text-xs text-[#3D5166]">
          &copy; {new Date().getFullYear()} Release Point &mdash; Designed &amp; built by Nolan George
        </p>
        <p className="text-xs text-[#3D5166]">Pitching &amp; hitting mechanics analyzer</p>
      </div>
    </footer>
  )
}
