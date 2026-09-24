export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-50 h-14 flex items-center px-5 md:px-8 gap-3"
        style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(20px)', borderBottom: '1px solid #e2e8f0' }}>
        <div className="w-24 h-4 rounded shimmer" />
        <div className="w-px h-4 bg-slate-200" />
        <div className="w-20 h-3 rounded shimmer" />
      </div>

      <main className="max-w-4xl mx-auto px-5 py-8 space-y-6">
        {/* Hero card */}
        <div className="rounded-2xl overflow-hidden" style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
          <div className="h-px bg-[#E8102A]" />
          <div className="px-7 py-7 flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="w-16 h-16 rounded-xl shimmer shrink-0" />
            <div className="flex-1 space-y-2.5">
              <div className="w-20 h-2.5 rounded shimmer" />
              <div className="w-44 h-5 rounded shimmer" />
              <div className="w-32 h-2.5 rounded shimmer" />
            </div>
            <div className="flex gap-6 shrink-0">
              {[1, 2, 3].map(i => (
                <div key={i} className="text-center space-y-1.5">
                  <div className="w-8 h-5 rounded shimmer mx-auto" />
                  <div className="w-12 h-2 rounded shimmer" />
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-slate-100" style={{ borderTop: '1px solid #e2e8f0' }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="px-5 py-4 text-center space-y-1.5">
                <div className="w-8 h-5 rounded shimmer mx-auto" />
                <div className="w-14 h-2 rounded shimmer mx-auto" />
              </div>
            ))}
          </div>
        </div>

        {/* Content grid */}
        <div className="grid md:grid-cols-[1fr_1.6fr] gap-4">
          {/* Teams column */}
          <div className="space-y-2">
            <div className="flex justify-between mb-3">
              <div className="w-20 h-2.5 rounded shimmer" />
              <div className="w-10 h-2.5 rounded shimmer" />
            </div>
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-xl px-4 py-4 flex items-center gap-4"
                style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
                <div className="flex-1 space-y-2">
                  <div className="w-32 h-3.5 rounded shimmer" />
                  <div className="w-20 h-2.5 rounded shimmer" />
                </div>
                <div className="w-4 h-4 rounded shimmer" />
              </div>
            ))}
          </div>

          {/* Clips column */}
          <div className="space-y-2">
            <div className="flex justify-between mb-3">
              <div className="w-24 h-2.5 rounded shimmer" />
              <div className="w-10 h-2.5 rounded shimmer" />
            </div>
            <div className="rounded-xl overflow-hidden" style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
              {[1, 2, 3, 4, 5].map((i, idx, arr) => (
                <div key={i} className="flex items-center gap-4 px-5 py-3.5"
                  style={{ borderBottom: idx < arr.length - 1 ? '1px solid #f1f5f9' : undefined }}>
                  <div className="w-9 h-9 rounded-lg shrink-0 shimmer" />
                  <div className="flex-1 space-y-1.5">
                    <div className="w-40 h-3.5 rounded shimmer" />
                    <div className="w-28 h-2.5 rounded shimmer" />
                  </div>
                  <div className="w-3.5 h-3.5 rounded shimmer" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
