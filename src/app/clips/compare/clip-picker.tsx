'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

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
  const [ytUrl, setYtUrl]     = useState('')
  const [ytError, setYtError] = useState('')

  function handleYouTube() {
    const id = extractYouTubeId(ytUrl.trim())
    if (!id) { setYtError('Paste a valid YouTube URL (youtube.com/watch or youtu.be)'); return }
    router.push(`/clips/compare?a=${sourceClipId}&b=yt:${id}`)
  }

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
        <div className="h-1 bg-[#C8102E]" />
        <div className="p-5">
          <p className="text-[10px] tracking-[0.3em] text-[#C8102E] mb-1" style={oswald}>Comparing with</p>
          <p className="text-sm text-[#0F1F33] font-medium" style={oswald}>{sourceClipTitle}</p>
        </div>
      </div>

      {/* YouTube URL option */}
      <div className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-[#C8102E] shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
            <p className="text-xs text-[#0F1F33] tracking-[0.15em]" style={oswald}>Compare with YouTube</p>
          </div>
          <div className="flex gap-2">
            <input
              type="url"
              value={ytUrl}
              onChange={e => { setYtUrl(e.target.value); setYtError('') }}
              onKeyDown={e => { if (e.key === 'Enter') handleYouTube() }}
              placeholder="Paste a YouTube URL…"
              className="flex-1 text-sm bg-white border border-[#DDE4ED] rounded-lg px-3 py-2 text-[#0F1F33] placeholder:text-[#AAB8C8] focus:outline-none focus:border-[#456080]"
            />
            <button
              onClick={handleYouTube}
              className="text-xs bg-[#C8102E] hover:bg-[#9E0E24] text-white px-4 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0"
              style={oswald}
            >
              Use
            </button>
          </div>
          {ytError && <p className="text-xs text-[#C8102E]">{ytError}</p>}
        </div>
      </div>

      <div>
        <p className="text-xs text-[#3D5166] tracking-[0.2em] mb-3" style={oswald}>
          Or select a clip to compare against
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
