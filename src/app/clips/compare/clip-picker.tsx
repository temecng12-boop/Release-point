'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

interface Clip {
  id: string
  title: string
  playerName: string
  sessionDate: string
}

interface Props {
  sourceClipId: string
  sourceClipTitle: string
  clips: Clip[]
}

export default function ClipPicker({ sourceClipId, sourceClipTitle, clips }: Props) {
  const router = useRouter()

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
        <div className="h-1 bg-[#C8102E]" />
        <div className="p-5">
          <p className="text-[10px] tracking-[0.3em] text-[#C8102E] mb-1" style={oswald}>Comparing with</p>
          <p className="text-sm text-[#0F1F33] font-medium" style={oswald}>{sourceClipTitle}</p>
        </div>
      </div>

      <div>
        <p className="text-xs text-[#3D5166] tracking-[0.2em] mb-3" style={oswald}>
          Select a clip to compare against
        </p>

        {clips.length === 0 ? (
          <div className="bg-white border border-[#DDE4ED] rounded-xl px-6 py-12 text-center shadow-sm">
            <p className="text-sm text-[#3D5166]">No other clips available to compare.</p>
          </div>
        ) : (
          <div className="bg-white border border-[#DDE4ED] rounded-xl divide-y divide-[#DDE4ED] overflow-hidden shadow-sm">
            {clips.map(clip => (
              <button
                key={clip.id}
                onClick={() => router.push(`/clips/compare?a=${sourceClipId}&b=${clip.id}`)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-[#F0F4F8] transition-colors group text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm text-[#0F1F33] truncate group-hover:text-[#C8102E] transition-colors">{clip.title}</p>
                  <p className="text-xs text-[#3D5166] mt-0.5">{clip.playerName} · {clip.sessionDate}</p>
                </div>
                <svg className="w-4 h-4 text-[#DDE4ED] group-hover:text-[#C8102E] transition-colors shrink-0 ml-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="text-center">
        <Link href={`/clips/${sourceClipId}`} className="text-xs text-[#3D5166] hover:text-[#456080] transition-colors" style={oswald}>
          ← Back to clip
        </Link>
      </div>
    </div>
  )
}
