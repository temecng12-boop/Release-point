import { redirect } from 'next/navigation'
import { forbidden } from '@/lib/http-forbidden'
import { loadAdminWaitlistPage } from '@/lib/admin-waitlist'
import AppHeader from '@/components/app-header'
import ApproveButton from './approve-button'

const os = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function AdminWaitlistPage() {
  const result = await loadAdminWaitlistPage()
  if (!result.ok && result.status === 401) redirect('/auth/login')
  if (!result.ok) forbidden()

  const pending  = result.entries.filter(e => !e.approved_at)
  const approved = result.entries.filter(e =>  e.approved_at)

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <AppHeader
        breadcrumbs={[{ href: '/dashboard', label: 'Dashboard' }, { label: 'Waitlist' }]}
        showSignOut
      />

      <main className="max-w-4xl mx-auto px-5 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] tracking-[0.3em] text-[#C8102E] mb-1" style={os}>Admin</p>
            <h1 className="text-2xl text-[#0F1F33] tracking-tight" style={os}>Waitlist</h1>
          </div>
          <div className="flex gap-6 text-center">
            <div>
              <p className="text-2xl text-[#0F1F33] leading-none" style={os}>{pending.length}</p>
              <p className="text-[10px] text-slate-400 mt-1" style={os}>Pending</p>
            </div>
            <div>
              <p className="text-2xl text-[#16a34a] leading-none" style={os}>{approved.length}</p>
              <p className="text-[10px] text-slate-400 mt-1" style={os}>Approved</p>
            </div>
          </div>
        </div>

        {/* Pending */}
        <div>
          <p className="text-[10px] tracking-[0.25em] text-[#C8102E] mb-3" style={os}>
            Pending — {pending.length} waiting
          </p>

          {pending.length === 0 ? (
            <div className="bg-white border border-[#DDE4ED] rounded-xl px-6 py-10 text-center">
              <p className="text-sm text-slate-500">Nobody waiting right now.</p>
            </div>
          ) : (
            <div className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden">
              {pending.map((entry, i) => (
                <div
                  key={entry.id}
                  className="px-5 py-4 flex items-start justify-between gap-4"
                  style={{ borderBottom: i < pending.length - 1 ? '1px solid #f1f5f9' : undefined }}
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-[#0F1F33]" style={os}>
                        {entry.name || '—'}
                      </p>
                      {entry.role && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ ...os, background: '#F0F4F8', color: '#456080', border: '1px solid #DDE4ED' }}>
                          {entry.role}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#456080]">{entry.email}</p>
                    <div className="flex gap-3 flex-wrap">
                      {entry.program_name && (
                        <p className="text-[11px] text-slate-400">{entry.program_name}</p>
                      )}
                      {entry.athlete_count && (
                        <p className="text-[11px] text-slate-400">{entry.athlete_count} athletes</p>
                      )}
                      {entry.referral && (
                        <p className="text-[11px] text-slate-400">via {entry.referral}</p>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-300">{fmtDate(entry.created_at)}</p>
                  </div>

                  <div className="shrink-0 pt-0.5">
                    <ApproveButton id={entry.id} email={entry.email} name={entry.name} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Approved */}
        {approved.length > 0 && (
          <div>
            <p className="text-[10px] tracking-[0.25em] text-[#16a34a] mb-3" style={os}>
              Approved — {approved.length} coaches
            </p>
            <div className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden">
              {approved.map((entry, i) => (
                <div
                  key={entry.id}
                  className="px-5 py-3.5 flex items-center justify-between gap-4"
                  style={{ borderBottom: i < approved.length - 1 ? '1px solid #f1f5f9' : undefined }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#0F1F33]" style={os}>{entry.name || '—'}</p>
                    <p className="text-xs text-slate-400">{entry.email}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] text-[#16a34a]" style={os}>Approved</p>
                    <p className="text-[10px] text-slate-300">{entry.approved_at ? fmtDate(entry.approved_at) : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
