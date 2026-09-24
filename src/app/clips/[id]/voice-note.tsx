'use client'

import { useRef, useState } from 'react'
import { getSignedUploadUrl, saveVoicePath } from '@/app/actions/clips'
import { createClient } from '@/lib/supabase/client'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export default function VoiceNote({
  clipId,
  playerId,
  role,
  initialVoiceUrl,
}: {
  clipId: string
  playerId: string
  role: 'coach' | 'player'
  initialVoiceUrl: string | null
}) {
  const isCoach = role === 'coach'
  const [voiceUrl, setVoiceUrl] = useState<string | null>(initialVoiceUrl)
  const [recording, setRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [recordError, setRecordError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  async function startRecording() {
    setRecordError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4'
      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm'
        await uploadVoice(ext, mimeType)
      }
      recorder.start(250)
      recorderRef.current = recorder
      setRecording(true)
    } catch {
      setRecordError('Microphone access denied — check browser permissions')
    }
  }

  function stopRecording() {
    recorderRef.current?.stop()
    setRecording(false)
  }

  async function uploadVoice(ext: string, mimeType: string) {
    setUploading(true)
    setRecordError(null)

    const storagePath = `${playerId}/${clipId}/voice.${ext}`

    // Get a signed upload URL from the server (bypasses RLS)
    const urlResult = await getSignedUploadUrl(storagePath)
    if (urlResult.error || !urlResult.signedUrl) {
      setRecordError('Failed to prepare upload — please try again.')
      setUploading(false)
      return
    }

    const blob = new Blob(chunksRef.current, { type: mimeType })

    // Upload directly to the signed URL
    const uploadRes = await fetch(urlResult.signedUrl, {
      method: 'PUT',
      body: blob,
      headers: { 'Content-Type': mimeType },
    })

    if (!uploadRes.ok) {
      setRecordError('Upload failed — please try again.')
      setUploading(false)
      return
    }

    // Save the path to the clip record
    const saveResult = await saveVoicePath(clipId, storagePath)
    if (saveResult?.error) {
      setRecordError('Saved but failed to link — refresh and try again.')
      setUploading(false)
      return
    }

    // Create a signed playback URL
    const supabase = createClient()
    const { data: signed } = await supabase.storage.from('clips').createSignedUrl(storagePath, 3600)
    if (signed?.signedUrl) setVoiceUrl(signed.signedUrl)

    setUploading(false)
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <p className="text-[12px] text-slate-500 tracking-[0.2em]" style={oswald}>
        Coach Voice Note
      </p>

      {isCoach && (
        <div className="flex items-center gap-3">
          {recording ? (
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 text-xs bg-slate-950 text-white px-4 py-2 rounded-lg transition-all"
              style={oswald}
            >
              <span className="w-2 h-2 rounded-full bg-[#E8102A] animate-pulse inline-block" />
              Stop Recording
            </button>
          ) : (
            <button
              onClick={startRecording}
              disabled={uploading}
              className="flex items-center gap-2 text-xs bg-[#E8102A] hover:bg-[#C80E24] text-white px-4 py-2 rounded-lg transition-all disabled:opacity-50"
              style={oswald}
            >
              <span className="w-2 h-2 rounded-full bg-white inline-block" />
              {uploading ? 'Saving…' : voiceUrl ? 'Re-record' : 'Record'}
            </button>
          )}
          {!recording && !uploading && voiceUrl && (
            <span className="text-xs text-slate-400">Re-record to overwrite</span>
          )}
        </div>
      )}

      {recordError && (
        <p className="text-xs text-[#E8102A]">{recordError}</p>
      )}

      {voiceUrl ? (
        <audio controls src={voiceUrl} className="w-full" style={{ height: 40 }} />
      ) : (
        <p className="text-sm text-slate-400">
          {isCoach ? 'No voice note yet — hit Record above.' : 'No voice note from your coach yet.'}
        </p>
      )}
    </div>
  )
}
