export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      {/* Header skeleton */}
      <div className="sticky top-0 z-50 h-14 bg-white border-b border-[#DDE4ED] flex items-center px-5 md:px-8 gap-3">
        <div className="w-24 h-5 bg-[#EEF2F7] rounded animate-pulse" />
        <div className="w-px h-4 bg-[#DDE4ED]" />
        <div className="w-20 h-4 bg-[#EEF2F7] rounded animate-pulse" />
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Hero card skeleton */}
        <div className="rounded-2xl overflow-hidden border border-[#1C3A5C] bg-[#0F1F33]">
          <div className="px-4 sm:px-7 py-6 sm:py-8 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
            <div className="w-16 h-16 rounded-xl bg-[#1C3A5C] animate-pulse shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="w-24 h-3 bg-[#1C3A5C] rounded animate-pulse" />
              <div className="w-48 h-6 bg-[#1C3A5C] rounded animate-pulse" />
              <div className="w-64 h-3 bg-[#1C3A5C] rounded animate-pulse" />
            </div>
          </div>
          <div className="border-t border-white/10 grid grid-cols-3 divide-x divide-white/10">
            {[1, 2, 3].map((i) => (
              <div key={i} className="px-5 py-4 text-center space-y-1">
                <div className="w-8 h-6 bg-[#1C3A5C] rounded animate-pulse mx-auto" />
                <div className="w-14 h-3 bg-[#1C3A5C] rounded animate-pulse mx-auto" />
              </div>
            ))}
          </div>
        </div>

        {/* Section label */}
        <div className="w-28 h-3 bg-[#DDE4ED] rounded animate-pulse" />

        {/* Card grid skeleton */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white border border-[#DDE4ED] rounded-xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-28 h-4 bg-[#EEF2F7] rounded animate-pulse" />
                <div className="w-16 h-3 bg-[#EEF2F7] rounded animate-pulse" />
              </div>
              <div className="w-full h-24 bg-[#EEF2F7] rounded-lg animate-pulse" />
              <div className="w-20 h-3 bg-[#EEF2F7] rounded animate-pulse" />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
