'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

function fmtTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = String((s % 60).toFixed(1)).padStart(4, '0')
  return `${m}:${sec}`
}

type TSNote = { id: string; time_seconds: number; text: string }

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

  function seekTo(t: number) {
    const v = document.querySelector('video')
    if (v) { v.pause(); v.currentTime = t }
  }

  async function addNote() {
    if (!draft.trim()) return
    const v = document.querySelector('video')
    const t = v?.currentTime ?? 0
    setAdding(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not signed in'); setAdding(false); return }

    const { data, error: dbError } = await supabase
      .from('timestamp_notes')
      .insert({ clip_id: clipId, created_by: user.id, time_seconds: t, text: draft.trim() })
      .select('id, time_seconds, text')
      .single()

    if (dbError) {
      setError(dbError.message)
    } else if (data) {
      setNotes(prev => [...prev, data].sort((a, b) => a.time_seconds - b.time_seconds))
      setDraft('')
    }
    setAdding(false)
  }

  async function deleteNote(id: string) {
    const { error: dbError } = await createClient().from('timestamp_notes').delete().eq('id', id)
    if (!dbError) setNotes(prev => prev.filter(n => n.id !== id))
  }

  return (
    <div className="bg-[#0B1E36] rounded-md border border-[#1C3A5C] p-4">
      <p className="text-xs text-[#4A6880] mb-3 tracking-widest" style={oswald}>
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
              className="flex-1 text-sm bg-[#060F1A] border border-[#1C3A5C] rounded-md px-3 py-1.5 text-[#E8EDF5] placeholder:text-[#4A6880] focus:outline-none focus:border-[#9FB3CC]"
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
        <p className="text-sm text-[#4A6880]">
          {isCoach
            ? 'Pause the video, type a note, and click Add.'
            : 'No timestamp notes from your coach yet.'}
        </p>
      ) : (
        <ul className="divide-y divide-[#1C3A5C]">
          {notes.map(n => (
            <li key={n.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
              <button
                onClick={() => seekTo(n.time_seconds)}
                className="shrink-0 text-xs font-mono bg-[#1C3A5C] text-[#9FB3CC] hover:text-white px-2 py-0.5 rounded-md transition-colors"
              >
                {fmtTime(n.time_seconds)}
              </button>
              <span className="text-sm text-[#E8EDF5] flex-1">{n.text}</span>
              {isCoach && (
                <button
                  onClick={() => deleteNote(n.id)}
                  className="text-[#4A6880] hover:text-[#C8102E] transition-colors shrink-0 text-xs leading-none"
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
