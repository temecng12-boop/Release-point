import Link from 'next/link'
import Logo from '@/components/Logo'
import SignOutForm from '@/components/sign-out-form'
import ReportProblemButton from '@/components/report-problem'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

interface BreadcrumbItem {
  href?: string
  label: string
}

interface Props {
  breadcrumbs?: BreadcrumbItem[]
  right?: React.ReactNode
  showSignOut?: boolean
  /** Optional back control (e.g. the clip viewer links back to /dashboard). */
  backHref?: string
  /** Full label for the back control; also its accessible name. */
  backLabel?: string
  /** Mobile-only drawer trigger + panel (rendered as the last item in the right group). */
  mobileNav?: React.ReactNode
}

export default function AppHeader({ breadcrumbs, right, showSignOut, backHref, backLabel, mobileNav }: Props) {
  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between gap-2 px-5 md:px-8 min-h-14"
      style={{
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        viewTransitionName: 'site-header',
        // The header sits at the very top, so stretch it over the notch /
        // home-indicator safe areas (0 in mobile Safari, >0 standalone).
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1">
        <Logo size="sm" href="/" className="shrink-0 max-sm:min-h-11" wordmarkClass="hidden min-[480px]:inline whitespace-nowrap" />
        {backHref && (
          <Link
            href={backHref}
            transitionTypes={['nav-back']}
            aria-label={backLabel ?? 'Back to dashboard'}
            className="inline-flex shrink-0 items-center gap-1.5 min-h-11 px-4 rounded-lg bg-white border-2 border-[#DDE4ED] text-xs whitespace-nowrap transition-colors hover:border-[color:var(--rp-navy,#023167)] hover:bg-[var(--rp-navy-50)] focus-visible:border-[color:var(--rp-navy,#023167)] focus-visible:bg-[var(--rp-navy-50)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rp-navy)] focus-visible:ring-offset-2"
            style={{ ...oswald, color: 'var(--rp-navy, #023167)', letterSpacing: '0.08em' }}
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M15 19l-7-7 7-7" />
            </svg>
            {/* header's unlayered display rule beats sm:hidden, so swap the
                labels with sr-only like the Report button does. */}
            <span aria-hidden="true" className="sr-only sm:not-sr-only">{backLabel ?? 'Back to dashboard'}</span>
            <span aria-hidden="true" className="not-sr-only sm:sr-only">Dashboard</span>
          </Link>
        )}
        {breadcrumbs?.map((crumb, i) => (
          // A linked crumb is hidden on phones together with its "/". When a
          // back button is shown, the current-page crumb hides on phones too
          // so the header never wraps at 375px next to Report / Sign Out.
          <span key={i} className={`${crumb.href || backHref ? 'hidden sm:inline-flex' : 'flex'} items-center gap-1.5 sm:gap-2.5 min-w-0`}>
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
        {/* Signed-in pages pass showSignOut; the header is sticky, so this is
            always reachable and never over the video controls. */}
        {showSignOut && !mobileNav && <ReportProblemButton />}
        {showSignOut && !mobileNav && (
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
        {/* On desktop the sign-out / report buttons render above; the mobile
            nav drawer contains its own copies and shows only on sm:. */}
        {mobileNav}
        {/* Desktop-only sign-out when a mobileNav drawer is present */}
        {mobileNav && showSignOut && (
          <>
            <div className="hidden sm:flex items-center gap-3">
              <ReportProblemButton />
              <SignOutForm>
                <button
                  type="submit"
                  className="text-xs text-slate-400 hover:text-slate-700 transition-colors px-2 py-1"
                  style={oswald}
                >
                  Sign Out
                </button>
              </SignOutForm>
            </div>
          </>
        )}
      </div>
    </header>
  )
}
