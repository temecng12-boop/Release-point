import Link from 'next/link'
import { signOut } from '@/app/actions/auth'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

interface Props {
  backHref?: string
  backLabel?: string
  right?: React.ReactNode
  showSignOut?: boolean
}

export default function AppHeader({ backHref, backLabel, right, showSignOut }: Props) {
  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between px-5 md:px-8 h-14"
      style={{
        backgroundColor: 'rgba(255,255,255,0.97)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid #DDE4ED',
      }}
    >
      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
          <span className="text-base">⚾</span>
          <span className="text-sm tracking-widest text-[#1C2E4A] hidden sm:block" style={oswald}>
            Release Point
          </span>
        </Link>
        {backHref && (
          <>
            <span className="text-[#DDE4ED]">/</span>
            <Link
              href={backHref}
              className="text-xs text-[#7A92A8] hover:text-[#456080] transition-colors"
              style={oswald}
            >
              {backLabel ?? 'Back'}
            </Link>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        {right}
        {showSignOut && (
          <form action={signOut}>
            <button
              type="submit"
              className="text-xs text-[#7A92A8] hover:text-[#456080] transition-colors px-2 py-1"
              style={oswald}
            >
              Sign Out
            </button>
          </form>
        )}
      </div>
    </header>
  )
}
