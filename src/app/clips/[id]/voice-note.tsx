'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { saveVoicePath } from '@/app/actions/clips'

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
        await uploadVoice(mimeType.includes('mp4') ? 'mp4' : 'webm', mimeType)
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
    const supabase = createClient()
    const path = `${playerId}/${clipId}/voice.${ext}`
    const blob = new Blob(chunksRef.current, { type: mimeType })
    await supabase.storage.from('clips').remove([path])
    const { error } = await supabase.storage.from('clips').upload(path, blob, { contentType: mimeType })
    if (!error) {
      await saveVoicePath(clipId, path)
      const { data: signed } = await supabase.storage.from('clips').createSignedUrl(path, 3600)
      if (signed?.signedUrl) setVoiceUrl(signed.signedUrl)
    }
    setUploading(false)
  }

  return (
    <div className="bg-white rounded-md border border-[#DDE4ED] shadow-sm p-4">
      <p className="text-[13px] text-[#3D5166] mb-3 tracking-wider" style={oswald}>
        Coach Voice Note
      </p>

      {isCoach && (
        <div className="flex items-center gap-3 mb-3">
          {recording ? (
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 text-xs bg-[#1C3A5C] text-white px-3 py-1.5 rounded-md animate-pulse border border-[#DDE4ED]"
            >
              <span className="w-2 h-2 rounded-full bg-[#C8102E] inline-block" />
              Stop Recording
            </button>
          ) : (
            <button
              onClick={startRecording}
              disabled={uploading}
              className="flex items-center gap-2 text-xs bg-[#C8102E] hover:bg-red-700 text-white px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
            >
              <span className="w-2 h-2 rounded-full bg-white inline-block" />
              {uploading ? 'Saving…' : voiceUrl ? 'Re-record' : 'Record'}
            </button>
          )}
          {!recording && !uploading && voiceUrl && (
            <span className="text-xs text-[#3D5166]">Re-record to overwrite</span>
          )}
        </div>
      )}

      {recordError && <p className="text-xs text-[#C8102E] mb-2">{recordError}</p>}

      {voiceUrl ? (
        <audio controls src={voiceUrl} className="w-full" style={{ height: 36 }} />
      ) : (
        <p className="text-sm text-[#3D5166]">
          {isCoach ? 'No voice note yet — hit Record above.' : 'No voice note from coach yet.'}
        </p>
      )}
    </div>
  )
}
