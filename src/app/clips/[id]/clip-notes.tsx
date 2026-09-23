'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

export default function ClipNotes({
  clipId,
  playerId,
  role,
  initialNotes,
  initialVoiceUrl,
}: {
  clipId: string
  playerId: string
  role: 'coach' | 'player'
  initialNotes: string | null
  initialVoiceUrl: string | null
}) {
  const isCoach = role === 'coach'
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [saveStatus, setSaveStatus] = useState<'saved' | 'pending' | 'saving'>('saved')
  const [voiceUrl, setVoiceUrl] = useState<string | null>(initialVoiceUrl)
  const [recording, setRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [recordError, setRecordError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notesRef = useRef(notes)
  notesRef.current = notes

  async function persistNotes(text: string) {
    setSaveStatus('saving')
    await createClient().from('clips').update({ notes: text }).eq('id', clipId)
    setSaveStatus('saved')
    window.dispatchEvent(new CustomEvent('clip-notes-saved'))
  }

  function onNotesChange(text: string) {
    setNotes(text)
    setSaveStatus('pending')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => persistNotes(text), 1800)
  }

  function onNotesBlur() {
    if (saveStatus === 'pending') {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      persistNotes(notesRef.current)
    }
  }

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

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
      await supabase.from('clips').update({ voice_path: path }).eq('id', clipId)
      const { data: signed } = await supabase.storage.from('clips').createSignedUrl(path, 3600)
      if (signed?.signedUrl) setVoiceUrl(signed.signedUrl)
    }
    setUploading(false)
  }

  return (
    <div className="mt-5 space-y-4">
      {/* Voice note */}
      <div className="bg-white rounded-xl border border-[#DCE1E7] p-5">
        <h2 className="text-sm text-[#0F1F33] mb-3" style={oswald}>Coach Voice Note</h2>

        {isCoach && (
          <div className="flex items-center gap-3 mb-3">
            {recording ? (
              <button
                onClick={stopRecording}
                className="flex items-center gap-2 text-xs bg-[#1C3A5C] text-white px-3 py-1.5 rounded-lg animate-pulse"
              >
                <span className="w-2 h-2 rounded bg-[#C8102E] inline-block" />
                Stop Recording
              </button>
            ) : (
              <button
                onClick={startRecording}
                disabled={uploading}
                className="flex items-center gap-2 text-xs bg-[#C8102E] hover:bg-red-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
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

      {/* Text notes */}
      <div className="bg-white rounded-xl border border-[#DCE1E7] p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm text-[#0F1F33]" style={oswald}>Coach Notes</h2>
          {isCoach && (
            <span className="text-xs text-[#3D5166]">
              {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'pending' ? 'Unsaved' : 'Saved ✓'}
            </span>
          )}
        </div>

        {isCoach ? (
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            onBlur={onNotesBlur}
            placeholder="Type coaching notes here…"
            rows={4}
            className="w-full text-sm text-[#0F1F33] border border-[#DDE4ED] rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-[#1C3A5C]/30 placeholder:text-[#3D5166]"
          />
        ) : (
          notes
            ? <p className="text-sm text-[#16202E] whitespace-pre-wrap">{notes}</p>
            : <p className="text-sm text-[#3D5166]">No notes from coach yet.</p>
        )}
      </div>
    </div>
  )
}
