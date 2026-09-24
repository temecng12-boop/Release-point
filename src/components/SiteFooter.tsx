import Link from 'next/link'
import Logo from './Logo'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

interface Props {
  variant?: 'marketing' | 'app'
}

export default function SiteFooter({ variant = 'marketing' }: Props) {
  if (variant === 'app') {
    return (
      <footer className="px-5 md:px-8 py-6 mt-8" style={{ borderTop: '1px solid #e2e8f0' }}>
        <p className="text-xs text-slate-400 text-center">
          Designed &amp; built by{' '}
          <a
            href="https://www.linkedin.com/in/nolangeorge12"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-500 hover:text-slate-700 transition-colors hover:underline underline-offset-2"
          >
            Nolan George
          </a>
        </p>
      </footer>
    )
  }

  return (
    <footer style={{ borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
      <div className="max-w-5xl mx-auto px-6 py-14 grid md:grid-cols-[1fr_auto] gap-12 items-start">
        <div>
          <Logo size="sm" wordmarkClass="inline" />
          <p className="mt-5 text-sm text-slate-500 leading-relaxed max-w-[420px]">
            Release Point was designed and built by <strong className="text-slate-700 font-medium">Nolan George</strong> — a pitcher who competed at San Jose State University, the University of Nevada Las Vegas, and with the Boise Hawks. His career at the intersection of high-level amateur and independent baseball sparked a deep interest in AI and data-driven development.
          </p>
          <a
            href="https://www.linkedin.com/in/nolangeorge12"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-5 text-xs text-slate-500 hover:text-slate-800 transition-colors font-medium"
            style={os}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
            Connect on LinkedIn
          </a>
        </div>

        <div className="flex flex-col gap-2.5">
          <p className="text-[10px] text-slate-400 tracking-widest mb-1" style={os}>Links</p>
          {[
            { href: '/auth/signup', label: 'Coach Sign Up' },
            { href: '/auth/login',  label: 'Player Login'  },
            { href: '/about',       label: 'About'          },
            { href: '/privacy',     label: 'Privacy'        },
            { href: '/terms',       label: 'Terms'          },
          ].map(l => (
            <Link key={l.href} href={l.href} className="text-xs text-slate-500 hover:text-slate-800 transition-colors" style={os}>
              {l.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2" style={{ borderTop: '1px solid #e2e8f0' }}>
        <p className="text-xs text-slate-400">
          &copy; {new Date().getFullYear()} Release Point &mdash; Designed &amp; built by Nolan George
        </p>
        <p className="text-xs text-slate-300">Pitching &amp; hitting mechanics analyzer</p>
      </div>
    </footer>
  )
}
