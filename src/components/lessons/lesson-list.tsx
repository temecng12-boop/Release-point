'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { getLessonSignedUrl, deleteLesson } from '@/app/actions/clips'
import { lessonRowDuration, type LessonItem } from '@/lib/lessons'
import { watchMediaDuration } from '@/lib/media-duration'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** One lesson: date, coach, duration; opens and replays in place. */
function LessonRowItem({ lesson, canManage }: { lesson: LessonItem; canManage: boolean }) {
  const router = useRouter()
  const [url, setUrl] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [mediaSec, setMediaSec] = useState<number | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const duration = lessonRowDuration(lesson.duration_ms, mediaSec, open && !!url)

  // MediaRecorder webm files report duration = Infinity, so the bar can't be
  // dragged (QA-005). watchMediaDuration seeks far past the end once so the
  // browser works out the real length, goes back, and gives up after 5 s. Its
  // length is shown only for older lessons without duration_ms.
  useEffect(() => {
    const v = videoRef.current
    if (!v || !open || !url) return
    const stop = watchMediaDuration(v, setMediaSec)
    return () => { stop(); setMediaSec(null) }
  }, [open, url])

  function toggle() {
    setError(null)
    if (open) { setOpen(false); return }
    setOpen(true)
    if (url) return
    startTransition(async () => {
      // Signed playback URLs go through the storage ownership check.
      const r = await getLessonSignedUrl(lesson.media_path)
      if ('signedUrl' in r && r.signedUrl) setUrl(r.signedUrl)
      else { setError('error' in r && r.error ? r.error : 'Could not load this lesson.'); setOpen(false) }
    })
  }

  function remove() {
    if (!confirm('Delete this lesson recording? This cannot be undone.')) return
    setError(null)
    startTransition(async () => {
      const r = await deleteLesson(lesson.id)
      if ('error' in r) setError(r.error ?? 'Could not delete this lesson.')
      else router.refresh()
    })
  }

  return (
    <li className="py-2">
      <div className="flex items-center gap-3">
        <button onClick={toggle} disabled={pending} className="text-xs text-[#1C3A5C] hover:text-[#C8102E] transition-colors disabled:opacity-50 shrink-0 max-sm:min-h-11 max-sm:min-w-11" style={oswald}>
          {open ? '■ Close' : '▶ Play'}
        </button>
        <span className="text-xs text-[#0F1F33]">{fmtDateTime(lesson.created_at)}</span>
        <span className="text-xs text-[#3D5166] truncate">{lesson.coach_name ?? 'Coach'}</span>
        {duration && <span className="text-xs text-[#8096AE] font-mono">{duration}</span>}
        {canManage && (
          <button onClick={remove} disabled={pending} className="ml-auto text-[10px] text-[#456080] hover:text-[#C8102E] transition-colors disabled:opacity-50 max-sm:min-h-11 max-sm:min-w-11" style={oswald}>
            Delete
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-[#C8102E] mt-1">{error}</p>}
      {open && url && (
        <video ref={videoRef} src={url} controls autoPlay playsInline className="w-full rounded-lg mt-2" style={{ maxHeight: 300, background: '#000' }} />
      )}
    </li>
  )
}

export default function LessonList({ lessons, canManage = false }: { lessons: LessonItem[]; canManage?: boolean }) {
  if (lessons.length === 0) return null
  return (
    <ul className="divide-y divide-[#EEF2F7]">
      {lessons.map(l => <LessonRowItem key={l.id} lesson={l} canManage={canManage} />)}
    </ul>
  )
}
