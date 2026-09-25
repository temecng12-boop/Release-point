'use client'

import { useEffect, useState } from 'react'
import { saveTimestampNote, deleteTimestampNote } from '@/app/actions/clips'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

function fmtTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = String((s % 60).toFixed(1)).padStart(4, '0')
  return `${m}:${sec}`
}

type StampShape = {
  type: string
  color: string
  points?: { x: number; y: number }[]
  start?: { x: number; y: number }
  end?: { x: number; y: number }
}

type TSNote = { id: string; time_seconds: number; body: string; drawing_data?: unknown[] | null }

export default function TimestampNotes({
  clipId,
  role,
  initialNotes,
}: {
  clipId: string
  role: 'coach' | 'player'
  initialNotes: TSNote[]
}) {
  const isCoach = role === 'coach'
  const [notes, setNotes]   = useState<TSNote[]>(initialNotes)
  const [draft, setDraft]   = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  // Listen for stamps saved by the video player (coach side)
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

    const result = await saveTimestampNote({ clip_id: clipId, time_seconds: t, body: draft.trim() })

    if (result?.error) {
      setError(result.error)
    } else if (result?.note) {
      setNotes(prev => [...prev, result.note!].sort((a, b) => a.time_seconds - b.time_seconds))
      setDraft('')
    }
    setAdding(false)
  }

  async function removeNote(id: string) {
    const result = await deleteTimestampNote(id)
    if (!result?.error) setNotes(prev => prev.filter(n => n.id !== id))
  }

  return (
    <div className="bg-white rounded-md border border-[#DDE4ED] shadow-sm p-4">
      <p className="text-[13px] text-[#3D5166] mb-3 tracking-wider" style={oswald}>
        Timestamp Notes
      </p>

      {isCoach && (
        <div className="mb-3 space-y-2">
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={e => { setDraft(e.target.value); setError(null) }}
              onKeyDown={e => { if (e.key === 'Enter') addNote() }}
              placeholder="Pause video at a moment, then type a note and click Add…"
              className="flex-1 text-sm bg-white border border-[#DDE4ED] rounded-md px-3 py-1.5 text-[#0F1F33] placeholder:text-[#3D5166] focus:outline-none focus:border-[#456080]"
            />
            <button
              onClick={addNote}
              disabled={adding || !draft.trim()}
              className="text-xs bg-[#C8102E] hover:bg-[#9E0E24] text-white px-3 py-1.5 rounded-md transition-colors disabled:opacity-40 whitespace-nowrap"
            >
              {adding ? 'Saving…' : '+ Add'}
            </button>
          </div>
          {error && (
            <p className="text-xs text-[#C8102E]">Save failed: {error}</p>
          )}
        </div>
      )}

      {notes.length === 0 ? (
        <p className="text-sm text-[#3D5166]">
          {isCoach
            ? 'Pause the video, draw on the frame, then press Stamp — or type a note above.'
            : 'No timestamp notes from your coach yet.'}
        </p>
      ) : (
        <ul className="divide-y divide-[#DDE4ED]">
          {notes.map(n => (
            <li key={n.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
              <button
                onClick={() => seekAndShow(n)}
                className="shrink-0 flex items-center gap-1 text-xs font-mono bg-[#EEF2F7] text-[#456080] hover:text-[#0F1F33] px-2 py-0.5 rounded-md transition-colors border border-[#DDE4ED]"
              >
                {n.drawing_data?.length ? (
                  <svg className="w-3 h-3 text-[#C8102E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                ) : null}
                {fmtTime(n.time_seconds)}
              </button>
              <span className="text-sm text-[#0F1F33] flex-1">{n.body}</span>
              {isCoach && (
                <button
                  onClick={() => removeNote(n.id)}
                  className="text-[#3D5166] hover:text-[#C8102E] transition-colors shrink-0 text-xs leading-none"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
