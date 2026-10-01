import Link from 'next/link'
import Logo from '@/components/Logo'
import SignOutForm from '@/components/sign-out-form'

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
        backgroundColor: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid #e2e8f0',
        viewTransitionName: 'site-header',
      }}
    >
      <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1">
        <Logo size="sm" href="/" className="shrink-0 max-sm:min-h-11" wordmarkClass="hidden md:inline" />
        {breadcrumbs?.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            <span className="text-slate-300 shrink-0">/</span>
            {crumb.href ? (
              <Link
                href={crumb.href}
                transitionTypes={['nav-back']}
                className="text-xs text-slate-400 hover:text-slate-700 transition-colors shrink-0 hidden sm:inline max-sm:min-h-11"
                style={oswald}
              >
                {crumb.label}
              </Link>
            ) : (
              <span className="text-xs text-slate-600 truncate" style={oswald}>
                {crumb.label}
              </span>
            )}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {right}
        {showSignOut && (
          <SignOutForm>
            <button
              type="submit"
              className="text-xs text-slate-400 hover:text-slate-700 transition-colors px-2 py-1 max-sm:min-h-11 max-sm:min-w-11"
              style={oswald}
            >
              Sign Out
            </button>
          </SignOutForm>
        )}
      </div>
    </header>
  )
}
