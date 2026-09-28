'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createClip, getSignedUploadUrl } from '@/app/actions/clips'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

type Phase = 'idle' | 'preview' | 'recording' | 'naming' | 'uploading'

export default function RecordButton({
  playerId,
  playerName,
}: {
  playerId: string
  playerName: string
}) {
  const [phase, setPhase]     = useState<Phase>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError]     = useState<string | null>(null)
  const [title, setTitle]     = useState('')
  const videoRef     = useRef<HTMLVideoElement>(null)
  const streamRef    = useRef<MediaStream | null>(null)
  const recRef       = useRef<MediaRecorder | null>(null)
  const chunksRef    = useRef<Blob[]>([])
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const cancelledRef = useRef(false)
  const pendingMime  = useRef<string>('')
  const router    = useRouter()

  async function openCamera() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
      setPhase('preview')
    } catch {
      setError('Camera access denied — check browser permissions')
    }
  }

  function startRecording() {
    if (!streamRef.current) return
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm')
      ? 'video/webm'
      : 'video/mp4'
    const recorder = new MediaRecorder(streamRef.current, { mimeType })
    chunksRef.current = []
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    recorder.onstop = () => {
      if (cancelledRef.current) { cancelledRef.current = false; return }
      pendingMime.current = mimeType
      const today = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })
      setTitle(`${playerName} ${today}`)
      setPhase('naming')
    }
    recorder.start(250)
    recRef.current = recorder
    setElapsed(0)
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    setPhase('recording')
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current)
    recRef.current?.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    // phase transitions to 'naming' inside recorder.onstop
  }

  function cancel() {
    cancelledRef.current = true
    if (timerRef.current) clearInterval(timerRef.current)
    recRef.current?.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    recRef.current = null
    chunksRef.current = []
    setPhase('idle')
    setError(null)
  }

  async function uploadRecording(mimeType: string, clipTitle: string) {
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm'
    const storagePath = `${playerId}/${Date.now()}.${ext}`

    const urlResult = await getSignedUploadUrl(storagePath)
    if ('error' in urlResult) {
      setError(urlResult.error ?? 'Upload failed')
      setPhase('idle')
      return
    }

    const blob = new Blob(chunksRef.current, { type: mimeType })
    const file = new File([blob], `recording.${ext}`, { type: mimeType })

    const supabase = createClient()
    const { error: uploadError } = await supabase.storage
      .from('clips')
      .uploadToSignedUrl(urlResult.path, urlResult.token, file, { contentType: mimeType })

    if (uploadError) {
      setError(uploadError.message)
      setPhase('idle')
      return
    }

    const result = await createClip({
      player_id:    playerId,
      storage_path: storagePath,
      title:        clipTitle,
      session_date: null,
    })

    if (result?.error) {
      setError(result.error)
      setPhase('idle')
      return
    }

    setPhase('idle')
    router.refresh()
  }

  function fmtElapsed(s: number) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  // ── Naming overlay ─────────────────────────────────────────────────────────
  if (phase === 'naming') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="bg-white border border-[#DDE4ED] shadow-sm rounded-xl p-6 w-[22rem] space-y-4">
          <p className="text-[10px] tracking-[0.3em] text-[#C8102E]" style={oswald}>Name This Clip</p>
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && title.trim()) { setPhase('uploading'); uploadRecording(pendingMime.current, title.trim()) }
              if (e.key === 'Escape') { chunksRef.current = []; setPhase('idle') }
            }}
            placeholder="e.g. game changeup strikeout 9/27"
            className="w-full border border-[#DDE4ED] rounded-md px-3 py-2 text-sm text-[#0F1F33] placeholder:text-[#AAB8C8] focus:outline-none focus:border-[#456080]"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { chunksRef.current = []; setPhase('idle') }}
              className="text-xs text-[#456080] hover:text-[#0F1F33] px-3 py-1.5 rounded-md border border-[#DDE4ED] transition-colors"
              style={oswald}
            >
              Discard
            </button>
            <button
              onClick={() => { if (title.trim()) { setPhase('uploading'); uploadRecording(pendingMime.current, title.trim()) } }}
              disabled={!title.trim()}
              className="text-xs bg-[#1C3A5C] hover:bg-[#223F63] text-white px-3 py-1.5 rounded-md transition-colors disabled:opacity-40"
              style={oswald}
            >
              Upload
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Camera / recording overlay ──────────────────────────────────────────────
  if (phase === 'preview' || phase === 'recording' || phase === 'uploading') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black">
        {/* Camera preview */}
        <div className="flex-1 relative">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />

          {/* Recording indicator */}
          {phase === 'recording' && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 rounded-full px-4 py-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#C8102E] animate-pulse" />
              <span className="text-white text-sm font-mono">{fmtElapsed(elapsed)}</span>
            </div>
          )}

          {phase === 'uploading' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70">
              <div className="text-center">
                <div className="w-10 h-10 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-white text-sm" style={oswald}>Uploading…</p>
              </div>
            </div>
          )}
        </div>

        {/* Controls bar */}
        {phase !== 'uploading' && (
          <div className="bg-black px-6 py-5 flex items-center justify-between">
            <button
              onClick={cancel}
              className="text-white/60 hover:text-white text-sm transition-colors"
              style={oswald}
            >
              Cancel
            </button>

            <div className="flex items-center justify-center">
              {phase === 'preview' ? (
                <button
                  onClick={startRecording}
                  className="w-16 h-16 rounded-full bg-[#C8102E] hover:bg-[#9E0E24] flex items-center justify-center transition-colors shadow-lg"
                  title="Start recording"
                >
                  <span className="w-5 h-5 rounded-full bg-white" />
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="w-16 h-16 rounded-full bg-white flex items-center justify-center transition-colors shadow-lg"
                  title="Stop recording"
                >
                  <span className="w-5 h-5 rounded-sm bg-[#C8102E]" />
                </button>
              )}
            </div>

            <div className="w-16 text-right">
              {phase === 'preview' && <span className="text-white/40 text-xs" style={oswald}>Ready</span>}
              {phase === 'recording' && <span className="text-[#C8102E] text-xs animate-pulse" style={oswald}>REC</span>}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Idle trigger ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-end gap-1">
      {error && <p className="text-xs text-[#C8102E]">{error}</p>}
      <button
        onClick={openCamera}
        className="text-[10px] sm:text-xs bg-[#1C3A5C] hover:bg-[#223F63] text-white px-2 sm:px-3 py-1 sm:py-1.5 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5"
      >
        <span className="w-2 h-2 rounded-full bg-[#C8102E] shrink-0" />
        Record
      </button>
    </div>
  )
}
