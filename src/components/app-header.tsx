import Link from 'next/link'
import Logo from '@/components/Logo'
import { signOut } from '@/app/actions/auth'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

interface BreadcrumbItem {
  href?: string
  label: string
}

interface Props {
  breadcrumbs?: BreadcrumbItem[]
  right?: React.ReactNode
  showSignOut?: boolean
}

export default function AppHeader({ breadcrumbs, right, showSignOut }: Props) {
  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between px-5 md:px-8 h-14"
      style={{
        backgroundColor: 'rgba(255,255,255,0.97)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid #DDE4ED',
        viewTransitionName: 'site-header',
      }}
    >
      <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1">
        <Logo size="sm" href="/dashboard" className="shrink-0" />
        {breadcrumbs?.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            <span className="text-[#DDE4ED] shrink-0">/</span>
            {crumb.href ? (
              <Link
                href={crumb.href}
                transitionTypes={['nav-back']}
                className="text-xs text-[#3D5166] hover:text-[#456080] transition-colors shrink-0 hidden sm:inline"
                style={oswald}
              >
                {crumb.label}
              </Link>
            ) : (
              <span className="text-xs text-[#456080] truncate" style={oswald}>
                {crumb.label}
              </span>
            )}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {right}
        {showSignOut && (
          <form action={signOut}>
            <button
              type="submit"
              className="text-xs text-[#3D5166] hover:text-[#456080] transition-colors px-2 py-1"
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
