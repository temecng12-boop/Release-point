export default function ClipLoading() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-50 h-14 flex items-center px-5 md:px-8 gap-3"
        style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(20px)', borderBottom: '1px solid #e2e8f0' }}>
        <div className="w-24 h-4 rounded shimmer" />
        <div className="w-px h-4 bg-slate-200" />
        <div className="w-20 h-3 rounded shimmer" />
        <div className="w-px h-4 bg-slate-200" />
        <div className="w-36 h-3 rounded shimmer" />
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-24 space-y-4">
        {/* Video player */}
        <div className="w-full aspect-video rounded-2xl shimmer" />

        {/* Tab bar */}
        <div className="flex gap-0.5" style={{ borderBottom: '1px solid #e2e8f0' }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="flex-1 h-9 rounded-t"
              style={{ background: i === 1 ? '#f1f5f9' : '#f8fafc' }}
            />
          ))}
        </div>

        {/* Tab content */}
        <div className="space-y-3 mt-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl p-4 space-y-3"
              style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-4 rounded shimmer" />
                <div className="flex-1 h-3.5 rounded shimmer" />
              </div>
              <div className="w-3/4 h-3 rounded shimmer" />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
