import Link from 'next/link'
import Logo from '@/components/Logo'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col">
      <header
        className="flex items-center px-5 h-14 border-b border-[#DDE4ED]"
        style={{ backgroundColor: 'rgba(255,255,255,0.97)' }}
      >
        <Logo size="sm" href="/" />
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-[11px] text-[#C8102E] tracking-[0.3em] mb-3" style={oswald}>404</p>
        <h1 className="text-5xl text-[#0F1F33] mb-4 leading-none" style={oswald}>Page Not Found</h1>
        <p className="text-sm text-[#3D5166] mb-8 max-w-xs">
          That page doesn't exist. Head back to the dashboard.
        </p>
        <Link
          href="/dashboard"
          className="bg-[#C8102E] hover:bg-[#9E0E24] text-white px-6 py-3 rounded-lg text-sm transition-colors"
          style={oswald}
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
