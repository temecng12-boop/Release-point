export default function ClipLoading() {
  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      {/* Header skeleton */}
      <div className="sticky top-0 z-50 h-14 bg-white border-b border-[#DDE4ED] flex items-center px-5 md:px-8 gap-3">
        <div className="w-24 h-5 bg-[#EEF2F7] rounded animate-pulse" />
        <div className="w-px h-4 bg-[#DDE4ED]" />
        <div className="w-20 h-4 bg-[#EEF2F7] rounded animate-pulse" />
        <div className="w-px h-4 bg-[#DDE4ED]" />
        <div className="w-32 h-4 bg-[#EEF2F7] rounded animate-pulse" />
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-24 space-y-4">
        {/* Video player skeleton */}
        <div className="w-full aspect-video bg-[#0F1F33] rounded-xl animate-pulse flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-[#1C3A5C] animate-pulse" />
        </div>

        {/* Tab bar skeleton */}
        <div className="flex border-b border-[#DDE4ED] gap-1">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className={`flex-1 h-9 rounded-t ${i === 1 ? 'bg-[#EEF2F7]' : 'bg-[#F8FAFC]'} animate-pulse`}
            />
          ))}
        </div>

        {/* Tab content skeleton */}
        <div className="space-y-3 mt-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white border border-[#DDE4ED] rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-12 h-5 bg-[#EEF2F7] rounded animate-pulse" />
                <div className="flex-1 h-4 bg-[#EEF2F7] rounded animate-pulse" />
              </div>
              <div className="w-3/4 h-3 bg-[#EEF2F7] rounded animate-pulse" />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
