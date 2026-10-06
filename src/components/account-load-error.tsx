import Logo from '@/components/Logo'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

// Shown when a page couldn't read the signed-in account (a failed or missing
// profile or player read). Never a redirect: two pages that each redirect on
// a failed read can send the person back and forth. Plain link and form, so
// it works even where server actions are refused.
export default function AccountLoadError({ retryHref }: { retryHref: string }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8"><Logo size="sm" /></div>
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm space-y-4" role="alert" data-testid="account-load-error">
          <h1 className="text-lg text-slate-950 tracking-tight" style={os}>Something Went Wrong</h1>
          <p className="text-sm text-slate-600">We couldn&apos;t load your account right now. Please try again in a moment.</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <a href={retryHref} className="flex-1 inline-flex items-center justify-center min-h-11 rounded-lg bg-slate-950 hover:bg-slate-800 text-white text-sm" style={os}>Try Again</a>
            <form action="/auth/signout" method="post" className="flex-1">
              <button type="submit" className="w-full min-h-11 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm" style={os}>Sign Out</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
