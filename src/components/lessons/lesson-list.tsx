'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { getLessonReplay, deleteLesson } from '@/app/actions/clips'
import { validateTimeline, type Timeline } from '@/lib/lesson-timeline/schema'
import LessonReplay from './lesson-replay'
import { lessonRowDuration, type LessonItem } from '@/lib/lessons'
import { watchMediaDuration } from '@/lib/media-duration'

const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** One lesson: date, coach, duration; opens and replays in place. */
function LessonRowItem({ lesson, canManage }: { lesson: LessonItem; canManage: boolean }) {
  const router = useRouter()
  // Format 1: a video file. Format 2: audio + timeline replayed over the original clip.
  const [media, setMedia] = useState<{ format: 1; url: string } | { format: 2; audioUrl: string; videoUrl: string; timeline: Timeline; durationMs: number | null } | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [mediaSec, setMediaSec] = useState<number | null>(null)
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const fileUrl = media?.format === 1 ? media.url : null
  const duration = lessonRowDuration(lesson.duration_ms, mediaSec, open && !!fileUrl)

  // Format 1 files from MediaRecorder report duration = Infinity, so the bar
  // can't be dragged (QA-005). watchMediaDuration seeks far past the end once
  // so the browser works out the real length, goes back, and gives up after
  // 5 s. Its length is shown only for older lessons without duration_ms.
  useEffect(() => {
    const el = mediaRef.current
    if (!el || !open || !fileUrl) return
    const stop = watchMediaDuration(el, setMediaSec)
    return () => { stop(); setMediaSec(null) }
  }, [open, fileUrl])

  function toggle() {
    setError(null)
    if (open) { setOpen(false); return }
    setOpen(true)
    if (media) return
    startTransition(async () => {
      // Signed playback URLs go through the storage ownership check.
      const r = await getLessonReplay(lesson.id)
      if ('error' in r) { setError(r.error ?? 'Could not load this lesson.'); setOpen(false); return }
      if (r.format === 1) { setMedia({ format: 1, url: r.mediaUrl }); return }
      const checked = validateTimeline(r.timeline)
      if (!checked.ok) { setError('This lesson replay is damaged and cannot be played.'); setOpen(false); return }
      setMedia({ format: 2, audioUrl: r.mediaUrl, videoUrl: r.videoUrl, timeline: checked.timeline, durationMs: r.durationMs })
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
      {open && media?.format === 1 && (lesson.mime?.startsWith('audio/')
        ? <audio ref={el => { mediaRef.current = el }} src={media.url} controls autoPlay className="w-full mt-2" />
        : <video ref={el => { mediaRef.current = el }} src={media.url} controls autoPlay playsInline className="w-full rounded-lg mt-2" style={{ maxHeight: 300, background: '#000' }} />
      )}
      {open && media?.format === 2 && (
        <LessonReplay timeline={media.timeline} audioUrl={media.audioUrl} videoUrl={media.videoUrl} durationMs={media.durationMs} />
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
