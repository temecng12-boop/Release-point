'use client'

import { useEffect, useRef, useState } from 'react'
import { saveTimestampNote, deleteTimestampNote, getSignedUploadUrl, getClipsSignedUrl } from '@/app/actions/clips'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

const VOICE_PREFIX = '__voice__:'

function fmtTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = String((s % 60).toFixed(1)).padStart(4, '0')
  return `${m}:${sec}`
}

function fmtSecs(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

type StampShape = {
  type: string
  color: string
  points?: { x: number; y: number }[]
  start?: { x: number; y: number }
  end?: { x: number; y: number }
}

type TSNote = { id: string; time_seconds: number; body: string; drawing_data?: unknown[] | null }

function AudioNotePlayer({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    getClipsSignedUrl(path).then(r => {
      if ('signedUrl' in r) setUrl(r.signedUrl ?? null)
      else setErr(true)
    })
  }, [path])

  if (err) return <span className="text-xs text-[#C8102E]">Audio unavailable</span>
  if (!url) return <span className="text-xs text-[#8096AE]">Loading…</span>
  return <audio controls src={url} className="h-8 w-full max-w-[220px]" />
}

export default function TimestampNotes({
  clipId,
  playerId,
  role,
  initialNotes,
}: {
  clipId: string
  playerId: string
  role: 'coach' | 'player'
  initialNotes: TSNote[]
}) {
  const isCoach = role === 'coach'
  const [notes, setNotes]         = useState<TSNote[]>(initialNotes)
  const [draft, setDraft]         = useState('')
  const [adding, setAdding]       = useState(false)
  const [error, setError]         = useState<string | null>(null)

  // voice recording state
  const [voicePhase, setVoicePhase] = useState<'idle' | 'recording' | 'uploading'>('idle')
  const [voiceSecs, setVoiceSecs]   = useState(0)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const recorderRef   = useRef<MediaRecorder | null>(null)
  const chunksRef     = useRef<Blob[]>([])
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    function onStampCreated(e: Event) {
      const note = (e as CustomEvent).detail as TSNote
      setNotes(prev => [...prev, note].sort((a, b) => a.time_seconds - b.time_seconds))
    }
    window.addEventListener('rp:stamp-created', onStampCreated)
    return () => window.removeEventListener('rp:stamp-created', onStampCreated)
  }, [])

  function seekAndShow(n: TSNote) {
    const v = document.querySelector('video')
    if (v) { v.pause(); v.currentTime = n.time_seconds }
    if (n.drawing_data?.length) {
      window.dispatchEvent(new CustomEvent('rp:show-stamp', {
        detail: { shapes: n.drawing_data as StampShape[], time: n.time_seconds }
      }))
    }
  }

  async function addNote() {
    if (!draft.trim()) return
    const v = document.querySelector('video')
    const t = v?.currentTime ?? 0
    setAdding(true)
    setError(null)

    try {
      const result = await saveTimestampNote({ clip_id: clipId, time_seconds: t, body: draft.trim() })
      if (result?.note) {
        setNotes(prev => [...prev, result.note!].sort((a, b) => a.time_seconds - b.time_seconds))
        setDraft('')
      } else {
        setError(result?.error ?? 'Could not save this note. Please try again.')
      }
    } catch (err) {
      console.error('[addNote] request failed', err)
      setError('Could not save this note. Check your connection and try again.')
    } finally {
      setAdding(false)
    }
  }

  async function startVoice() {
    setVoiceError(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setVoiceError('Microphone access denied.')
      return
    }

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'

    const recorder = new MediaRecorder(stream, { mimeType })
    chunksRef.current = []
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }

    const capturedTime = document.querySelector('video') ? (document.querySelector('video') as HTMLVideoElement).currentTime : 0

    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop())
      if (timerRef.current) clearInterval(timerRef.current)
      setVoicePhase('uploading')

      const ext = mimeType.includes('mp4') ? 'm4a' : 'webm'
      const uid = Math.random().toString(36).slice(2, 8)
      const storagePath = `${playerId}/${clipId}/ts_voice/${uid}.${ext}`
      const baseMime = mimeType.split(';')[0].trim()
      const blob = new Blob(chunksRef.current, { type: baseMime })

      const urlResult = await getSignedUploadUrl(storagePath)
      if ('error' in urlResult) { setVoiceError('Upload failed.'); setVoicePhase('idle'); return }

      const res = await fetch(urlResult.signedUrl, {
        method: 'PUT', body: blob, headers: { 'Content-Type': baseMime },
      })
      if (!res.ok) { setVoiceError('Upload failed. Try again.'); setVoicePhase('idle'); return }

      const result = await saveTimestampNote({
        clip_id: clipId,
        time_seconds: capturedTime,
        body: `${VOICE_PREFIX}${storagePath}`,
      })
      if (result?.error) { setVoiceError(result.error); setVoicePhase('idle'); return }
      if (result?.note) {
        setNotes(prev => [...prev, result.note!].sort((a, b) => a.time_seconds - b.time_seconds))
      }
      setVoiceSecs(0)
      setVoicePhase('idle')
    }

    recorder.start(250)
    recorderRef.current = recorder
    setVoiceSecs(0)
    setVoicePhase('recording')
    timerRef.current = setInterval(() => setVoiceSecs(s => s + 1), 1000)
  }

  function stopVoice() {
    recorderRef.current?.stop()
  }

  async function removeNote(id: string) {
    setError(null)
    const result = await deleteTimestampNote(id)
    if (result?.error) setError(result.error)
    else {
      setNotes(prev => prev.filter(n => n.id !== id))
      if (result && 'warning' in result && result.warning) setError(result.warning)
    }
  }

  return (
    <div className="bg-white rounded-md border border-[#DDE4ED] shadow-sm p-4">
      <p className="text-[13px] text-[#3D5166] mb-3 tracking-wider" style={oswald}>
        Timestamp Notes
      </p>

      {isCoach && (
        <div className="mb-4 space-y-2">
          {/* Text note row */}
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={e => { setDraft(e.target.value); setError(null) }}
              onKeyDown={e => { if (e.key === 'Enter') addNote() }}
              placeholder="Pause video, type a note, click Add…"
              disabled={voicePhase !== 'idle'}
              className="flex-1 text-sm bg-white border border-[#DDE4ED] rounded-md px-3 py-1.5 text-[#0F1F33] placeholder:text-[#3D5166] focus:outline-none focus:border-[#456080] disabled:opacity-40"
            />
            <button
              onClick={addNote}
              disabled={adding || !draft.trim() || voicePhase !== 'idle'}
              className="text-xs bg-[#C8102E] hover:bg-[#9E0E24] text-white px-3 py-1.5 rounded-md transition-colors disabled:opacity-40 whitespace-nowrap"
              style={oswald}
            >
              {adding ? 'Saving…' : '+ Add'}
            </button>
          </div>

          {/* Voice note row */}
          <div className="flex items-center gap-2">
            {voicePhase === 'idle' && (
              <button
                onClick={startVoice}
                className="flex items-center gap-1.5 text-xs border border-[#DDE4ED] hover:border-[#C8102E] text-[#3D5166] hover:text-[#C8102E] px-3 py-1.5 rounded-md transition-colors"
                style={oswald}
              >
                <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-1 17.93V21H9v2h6v-2h-2v-2.07A8 8 0 0 0 20 11h-2a6 6 0 0 1-12 0H4a8 8 0 0 0 7 7.93z"/>
                </svg>
                Voice note at current time
              </button>
            )}

            {voicePhase === 'recording' && (
              <>
                <span className="flex items-center gap-1.5 text-xs text-[#C8102E]" style={oswald}>
                  <span className="w-2 h-2 rounded-full bg-[#C8102E] animate-pulse inline-block" />
                  {fmtSecs(voiceSecs)}
                </span>
                <button
                  onClick={stopVoice}
                  className="text-xs bg-[#0F1F33] text-white px-3 py-1.5 rounded-md"
                  style={oswald}
                >
                  Stop & Save
                </button>
              </>
            )}

            {voicePhase === 'uploading' && (
              <span className="text-xs text-[#8096AE]" style={oswald}>Saving voice note…</span>
            )}

            {voiceError && (
              <span className="text-xs text-[#C8102E]">{voiceError}</span>
            )}
          </div>

          {error && (
            <p role="alert" className="text-xs text-[#C8102E]">Save failed: {error}</p>
          )}
        </div>
      )}

      {notes.length === 0 ? (
        <p className="text-sm text-[#3D5166]">
          {isCoach
            ? 'Pause the video, draw on the frame, then press Stamp — or type a note or record your voice above.'
            : 'No timestamp notes from your coach yet.'}
        </p>
      ) : (
        <ul className="divide-y divide-[#DDE4ED]">
          {notes.map(n => {
            const isVoice = n.body.startsWith(VOICE_PREFIX)
            const voicePath = isVoice ? n.body.slice(VOICE_PREFIX.length) : null
            return (
              <li key={n.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                <button
                  onClick={() => seekAndShow(n)}
                  className="shrink-0 flex items-center gap-1 text-xs font-mono bg-[#EEF2F7] text-[#456080] hover:text-[#0F1F33] px-2 py-0.5 rounded-md transition-colors border border-[#DDE4ED]"
                >
                  {n.drawing_data?.length ? (
                    <svg className="w-3 h-3 text-[#C8102E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  ) : isVoice ? (
                    <svg className="w-3 h-3 text-[#C8102E]" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-1 17.93V21H9v2h6v-2h-2v-2.07A8 8 0 0 0 20 11h-2a6 6 0 0 1-12 0H4a8 8 0 0 0 7 7.93z"/>
                    </svg>
                  ) : null}
                  {fmtTime(n.time_seconds)}
                </button>

                <div className="flex-1 min-w-0">
                  {isVoice && voicePath
                    ? <AudioNotePlayer path={voicePath} />
                    : <span className="text-sm text-[#0F1F33]">{n.body}</span>
                  }
                </div>

                {isCoach && (
                  <button
                    onClick={() => removeNote(n.id)}
                    className="text-[#3D5166] hover:text-[#C8102E] transition-colors shrink-0 text-xs leading-none"
                  >
                    ✕
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
