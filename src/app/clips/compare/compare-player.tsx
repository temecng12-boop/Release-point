'use client'

import { useRef, useState, useCallback } from 'react'
import Link from 'next/link'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

interface ClipData {
  id: string
  title: string
  videoUrl: string
  playerName: string
  sessionDate: string
}

interface Props {
  clipA: ClipData
  clipB: ClipData
}

export default function ComparePlayer({ clipA, clipB }: Props) {
  const aRef = useRef<HTMLVideoElement>(null)
  const bRef = useRef<HTMLVideoElement>(null)
  const [synced, setSynced] = useState(true)
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
    if (synced) {
      aRef.current?.play()
      bRef.current?.play()
    }
  }, [synced])

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
    if (playing) {
      handlePause()
    } else {
      handlePlay()
    }
  }

  return (
    <div className="space-y-4">
      {/* Sync toggle */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#3D5166]" style={oswald}>Side-by-Side Comparison</p>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs text-[#3D5166]" style={oswald}>Sync playback</span>
          <div
            onClick={() => setSynced(s => !s)}
            className={`w-9 h-5 rounded-full transition-colors relative ${synced ? 'bg-[#C8102E]' : 'bg-[#DDE4ED]'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${synced ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
        </label>
      </div>

      {/* Video panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {([['a', clipA, aRef, aProgress, setAProgress], ['b', clipB, bRef, bProgress, setBProgress]] as const).map(
          ([side, clip, ref, progress, setProgress]) => (
            <div key={side} className="bg-white border border-[#DDE4ED] rounded-xl overflow-hidden shadow-sm">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#DDE4ED] bg-[#F8FAFC]">
                <div className="min-w-0">
                  <p className="text-xs text-[#0F1F33] truncate font-medium">{clip.title}</p>
                  <p className="text-[11px] text-[#3D5166] mt-0.5">{clip.playerName} · {clip.sessionDate}</p>
                </div>
                <Link
                  href={`/clips/${clip.id}`}
                  className="text-[10px] text-[#456080] hover:text-[#1C3A5C] transition-colors shrink-0 ml-3"
                  style={oswald}
                >
                  Open →
                </Link>
              </div>

              {/* Video */}
              <div className="relative bg-black aspect-video">
                <video
                  ref={ref}
                  src={clip.videoUrl}
                  className="w-full h-full object-contain"
                  playsInline
                  preload="metadata"
                  onTimeUpdate={() => {
                    const v = ref.current
                    if (!v || !v.duration) return
                    setProgress(v.currentTime / v.duration)
                    if (synced) syncOther(side as 'a' | 'b', v.currentTime)
                  }}
                  onEnded={() => setPlaying(false)}
                />
              </div>

              {/* Progress bar */}
              <div className="px-4 py-3">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.001}
                  value={progress}
                  onChange={(e) => handleSeek(side as 'a' | 'b', parseFloat(e.target.value) * (ref.current?.duration ?? 0))}
                  className="w-full accent-[#C8102E] h-1"
                />
              </div>
            </div>
          )
        )}
      </div>

      {/* Shared controls */}
      <div className="flex items-center justify-center gap-4 bg-white border border-[#DDE4ED] rounded-xl px-6 py-4 shadow-sm">
        {/* Rewind */}
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

        {/* Play/pause */}
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

        {/* Forward */}
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
    </div>
  )
}
