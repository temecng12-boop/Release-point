'use client'

import { useRef, useState, useCallback } from 'react'
import Link from 'next/link'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export interface ClipData {
  id: string
  title: string
  videoUrl: string
  playerName: string
  sessionDate: string
  youtubeId?: string
}

interface Props {
  clipA: ClipData
  clipB: ClipData
}

export default function ComparePlayer({ clipA, clipB }: Props) {
  const aRef = useRef<HTMLVideoElement>(null)
  const bRef = useRef<HTMLVideoElement>(null)
  const hasYoutube = !!(clipA.youtubeId || clipB.youtubeId)
  const [synced, setSynced] = useState(!hasYoutube)
  const [playing, setPlaying] = useState(false)
  const [aProgress, setAProgress] = useState(0)
  const [bProgress, setBProgress] = useState(0)
  const syncingRef = useRef(false)

  function syncOther(source: 'a' | 'b', time: number) {
    if (!synced || syncingRef.current) return
    syncingRef.current = true
    const target = source === 'a' ? bRef.current : aRef.current
    if (target) target.currentTime = time
    syncingRef.current = false
  }

  const handlePlay = useCallback(() => {
    setPlaying(true)
    if (!hasYoutube) {
      aRef.current?.play()
      bRef.current?.play()
    }
  }, [hasYoutube])

  const handlePause = useCallback(() => {
    setPlaying(false)
    aRef.current?.pause()
    bRef.current?.pause()
  }, [])

  const handleSeek = useCallback((target: 'a' | 'b', val: number) => {
    const vid = target === 'a' ? aRef.current : bRef.current
    if (vid) vid.currentTime = val
    if (synced) syncOther(target, val)
  }, [synced]) // eslint-disable-line react-hooks/exhaustive-deps

  function togglePlayPause() {
    playing ? handlePause() : handlePlay()
  }

  function renderPanel(side: 'a' | 'b', clip: ClipData, vidRef: React.RefObject<HTMLVideoElement | null>, progress: number, setProgress: (v: number) => void) {
    if (clip.youtubeId) {
      return (
        <div className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#DDE4ED] bg-[#F8FAFC]">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <svg className="w-3 h-3 text-[#C8102E] shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
                <p className="text-xs text-[#0F1F33] font-medium truncate">{clip.title}</p>
              </div>
              <p className="text-[11px] text-[#3D5166] mt-0.5">YouTube · use controls inside video</p>
            </div>
          </div>
          <div className="relative bg-black aspect-video">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${clip.youtubeId}?rel=0`}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )
    }

    return (
      <div className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#DDE4ED] bg-[#F8FAFC]">
          <div className="min-w-0">
            <p className="text-xs text-[#0F1F33] truncate font-medium">{clip.title}</p>
            <p className="text-[11px] text-[#3D5166] mt-0.5">{clip.playerName} · {clip.sessionDate}</p>
          </div>
          {clip.id && (
            <Link
              href={`/clips/${clip.id}`}
              className="text-[10px] text-[#456080] hover:text-[#1C3A5C] transition-colors shrink-0 ml-3"
              style={oswald}
            >
              Open →
            </Link>
          )}
        </div>
        <div className="relative bg-black aspect-video">
          <video
            ref={vidRef as React.RefObject<HTMLVideoElement>}
            src={clip.videoUrl}
            className="w-full h-full object-contain"
            playsInline
            preload="metadata"
            onTimeUpdate={() => {
              const v = vidRef.current
              if (!v || !v.duration) return
              setProgress(v.currentTime / v.duration)
              if (synced) syncOther(side, v.currentTime)
            }}
            onEnded={() => setPlaying(false)}
          />
        </div>
        <div className="px-4 py-3">
          <input
            type="range" min={0} max={1} step={0.001} value={progress}
            onChange={e => handleSeek(side, parseFloat(e.target.value) * (vidRef.current?.duration ?? 0))}
            className="w-full accent-[#C8102E] h-1"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#3D5166]" style={oswald}>Side-by-Side Comparison</p>
        {!hasYoutube && (
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-[#3D5166]" style={oswald}>Sync playback</span>
            <div
              onClick={() => setSynced(s => !s)}
              className={`w-9 h-5 rounded-full transition-colors relative ${synced ? 'bg-[#C8102E]' : 'bg-[#DDE4ED]'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${synced ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
          </label>
        )}
        {hasYoutube && (
          <p className="text-[11px] text-[#AAB8C8]" style={oswald}>YouTube plays independently</p>
        )}
      </div>

      {/* Video panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {renderPanel('a', clipA, aRef, aProgress, setAProgress)}
        {renderPanel('b', clipB, bRef, bProgress, setBProgress)}
      </div>

      {/* Shared controls — only for non-YouTube pairs */}
      {!hasYoutube && (
        <div className="flex items-center justify-center gap-4 bg-white border border-[#DDE4ED] rounded-xl px-6 py-4 shadow-sm">
          <button
            onClick={() => {
              if (aRef.current) aRef.current.currentTime = Math.max(0, aRef.current.currentTime - 5)
              if (bRef.current) bRef.current.currentTime = Math.max(0, bRef.current.currentTime - 5)
            }}
            className="w-9 h-9 rounded-lg bg-[#EEF2F7] hover:bg-[#DDE4ED] flex items-center justify-center transition-colors"
            title="−5 seconds"
          >
            <svg className="w-4 h-4 text-[#456080]" fill="currentColor" viewBox="0 0 20 20">
              <path d="M8.445 14.832A1 1 0 0010 14v-2.798l5.445 3.63A1 1 0 0017 14V6a1 1 0 00-1.555-.832L10 8.798V6a1 1 0 00-1.555-.832l-6 4a1 1 0 000 1.664l6 4z" />
            </svg>
          </button>

          <button
            onClick={togglePlayPause}
            className="w-12 h-12 rounded-full bg-[#C8102E] hover:bg-[#9E0E24] flex items-center justify-center transition-colors shadow-md"
          >
            {playing ? (
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
            )}
          </button>

          <button
            onClick={() => {
              if (aRef.current) aRef.current.currentTime = Math.min(aRef.current.duration || 0, aRef.current.currentTime + 5)
              if (bRef.current) bRef.current.currentTime = Math.min(bRef.current.duration || 0, bRef.current.currentTime + 5)
            }}
            className="w-9 h-9 rounded-lg bg-[#EEF2F7] hover:bg-[#DDE4ED] flex items-center justify-center transition-colors"
            title="+5 seconds"
          >
            <svg className="w-4 h-4 text-[#456080]" fill="currentColor" viewBox="0 0 20 20">
              <path d="M4.555 5.168A1 1 0 003 6v8a1 1 0 001.555.832L10 11.202V14a1 1 0 001.555.832l6-4a1 1 0 000-1.664l-6-4A1 1 0 0010 6v2.798L4.555 5.168z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
