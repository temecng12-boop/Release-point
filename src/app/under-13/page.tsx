import AgeStopNotice from '@/components/age-stop-notice'
import Logo from '@/components/Logo'
import { SIGN_OUT_ROUTE } from '@/lib/under13-gate'

export const dynamic = 'force-dynamic'

// The stop screen for a frozen under-13 account. The middleware shows it in
// place of every player page (src/lib/under13-gate.ts).
export default async function Under13Page({ searchParams }: { searchParams: Promise<{ signout?: string }> }) {
  const { signout } = await searchParams
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8"><Logo size="sm" /></div>
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm space-y-4">
          <AgeStopNotice />
          {signout === 'failed' && <p role="alert" className="text-xs text-red-700">We couldn&apos;t sign you out. Please try again.</p>}
          <form action={SIGN_OUT_ROUTE} method="post">
            <button type="submit" className="w-full min-h-11 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 hover:bg-slate-50">Sign out</button>
          </form>
        </div>
      </div>
    </div>
  )
}
