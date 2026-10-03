'use client'

// Replays a timeline lesson (format 2): the coach's audio plays, and the
// ORIGINAL clip video (never re-encoded) plus the drawing canvas follow it.
// Sync rules live in src/lib/lesson-timeline/sync.ts (audio clock is master).
import { useEffect, useRef, useState } from 'react'
import type { Timeline } from '@/lib/lesson-timeline/schema'
import { cropTransform, TimelineCursor, visiblePoints, type ReplayState } from '@/lib/lesson-timeline/state'
import { ReplaySync, type Timers } from '@/lib/lesson-timeline/sync'
import { lessonTotalMs } from '@/lib/lesson-recording'

const INK_WIDTH = 7
const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }
const timers: Timers = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: h => window.clearTimeout(h as number),
}
const fmt = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

function draw(canvas: HTMLCanvasElement, s: ReplayState, t: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)
  ctx.lineWidth = INK_WIDTH; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  for (const p of s.shapes) {
    const pts = visiblePoints(p, t)
    if (!pts.length) continue
    const [ox, oy] = s.o[p.s.id] ?? [0, 0]
    const X = (x: number) => (x + ox) * W, Y = (y: number) => (y + oy) * H
    ctx.strokeStyle = p.s.color
    ctx.beginPath()
    if (p.s.kind === 'freehand' || p.s.kind === 'line') {
      pts.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)))
      ctx.stroke()
    } else if (pts.length === 2) {
      const [[x1, y1], [x2, y2]] = pts
      if (p.s.kind === 'rect') ctx.strokeRect(Math.min(X(x1), X(x2)), Math.min(Y(y1), Y(y2)), Math.abs(X(x2) - X(x1)), Math.abs(Y(y2) - Y(y1)))
      else { ctx.ellipse((X(x1) + X(x2)) / 2, (Y(y1) + Y(y2)) / 2, Math.abs(X(x2) - X(x1)) / 2, Math.abs(Y(y2) - Y(y1)) / 2, 0, 0, Math.PI * 2); ctx.stroke() }
    }
  }
}

export default function LessonReplay({ timeline, audioUrl, videoUrl, durationMs }: { timeline: Timeline; audioUrl: string; videoUrl: string; durationMs: number | null }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const syncRef = useRef<ReplaySync | null>(null)
  const scrubbingRef = useRef<{ wasPlaying: boolean } | null>(null)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [audioMs, setAudioMs] = useState<number | null>(null)
  // MediaRecorder webm often reports duration = Infinity, so use the stored
  // length, then the timeline's, then the audio's once it is known (QA-005/007).
  const total = lessonTotalMs(durationMs, timeline.durationMs, audioMs) ?? 0
  const portrait = timeline.clip.w < timeline.clip.h

  useEffect(() => {
    const audio = audioRef.current, video = videoRef.current, canvas = canvasRef.current
    if (!audio || !video || !canvas) return
    canvas.width = timeline.clip.w; canvas.height = timeline.clip.h
    const cursor = new TimelineCursor(timeline)
    const sync = new ReplaySync(audio, video, cursor, timers, timeline.clip.durMs)
    syncRef.current = sync
    let raf = 0
    const frame = () => {
      const t = audio.currentTime * 1000
      const s = cursor.at(t)
      draw(canvas, s, t)
      const inner = innerRef.current, stage = stageRef.current
      if (inner && stage) {
        const tf = cropTransform(s.crop, stage.offsetWidth, stage.offsetHeight)
        const css = tf ?? ''
        if (inner.style.transform !== css) inner.style.transform = css
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    const iv = window.setInterval(() => {
      if (!scrubbingRef.current) { sync.tick(); setPos(audio.currentTime * 1000) }
      setWaiting(sync.busy && sync.playing)
    }, 250)
    const onEnded = () => { sync.pause(); setPlaying(false) }
    const onAudioError = () => setError('Could not play the lesson audio. Try again.')
    const onVideoError = () => setError('Could not load the clip video for this lesson.')
    const onAudioDuration = () => { if (Number.isFinite(audio.duration) && audio.duration > 0) setAudioMs(audio.duration * 1000) }
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('loadedmetadata', onAudioDuration)
    audio.addEventListener('durationchange', onAudioDuration)
    audio.addEventListener('error', onAudioError)
    video.addEventListener('error', onVideoError)
    // First frame + marks before anyone presses play.
    sync.tick()
    return () => {
      cancelAnimationFrame(raf); window.clearInterval(iv)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('loadedmetadata', onAudioDuration)
      audio.removeEventListener('durationchange', onAudioDuration)
      audio.removeEventListener('error', onAudioError)
      video.removeEventListener('error', onVideoError)
      sync.pause()
      syncRef.current = null
    }
  }, [timeline])

  function toggle() {
    const sync = syncRef.current
    if (!sync) return
    if (sync.playing) { sync.pause(); setPlaying(false); return }
    const audio = audioRef.current!
    if (audio.currentTime * 1000 >= total - 50) sync.scrubTo(0)
    // Called straight from the tap: iOS only lets audio start from a user gesture.
    const p = sync.play()
    setPlaying(true)
    Promise.resolve(p).catch(() => { sync.pause(); setPlaying(false); setError('Tap play again to start the lesson audio.') })
  }

  function onScrubStart() {
    const sync = syncRef.current
    if (!sync || scrubbingRef.current) return
    scrubbingRef.current = { wasPlaying: sync.playing }
    if (sync.playing) sync.pause()
  }
  function onScrub(e: React.ChangeEvent<HTMLInputElement>) {
    const t = Number(e.target.value)
    setPos(t)
    syncRef.current?.scrubTo(t)
  }
  function onScrubEnd() {
    const sync = syncRef.current, s = scrubbingRef.current
    scrubbingRef.current = null
    if (sync && s?.wasPlaying) { void sync.play(); setPlaying(true) }
  }

  return (
    <div className="mt-2">
      <div
        ref={stageRef}
        className="relative bg-black rounded-md overflow-hidden mx-auto"
        style={{ lineHeight: 0, ...(portrait ? { maxWidth: `min(100%, calc(60vh * ${(timeline.clip.w / timeline.clip.h).toFixed(4)}))` } : {}) }}
      >
        <div ref={innerRef} style={{ transformOrigin: 'center center', lineHeight: 0 }}>
          {/* The original clip, muted and inline (iOS autoplay/inline rules); the audio carries the sound. */}
          <video ref={videoRef} src={videoUrl} muted playsInline preload="auto" className="w-full block" style={portrait ? { maxHeight: '60vh' } : {}} />
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
        </div>
        {waiting && <span className="absolute top-2 right-2 text-[10px] text-white/80 bg-black/50 px-2 py-0.5 rounded" style={oswald}>Loading…</span>}
      </div>
      <audio ref={audioRef} src={audioUrl} preload="auto" />
      <div className="flex items-center gap-3 mt-2">
        <button onClick={toggle} className="text-xs text-[#1C3A5C] hover:text-[#C8102E] transition-colors shrink-0" style={oswald}>
          {playing ? '❚❚ Pause' : '▶ Play'}
        </button>
        <input
          type="range" min={0} max={Math.max(1, total)} step={10} value={Math.min(pos, Math.max(1, total))} disabled={total <= 0}
          onPointerDown={onScrubStart} onKeyDown={onScrubStart} onChange={onScrub}
          onPointerUp={onScrubEnd} onKeyUp={onScrubEnd} onBlur={onScrubEnd}
          aria-label="Lesson position"
          className="flex-1 accent-[#C8102E] cursor-pointer h-1"
        />
        <span className="text-xs text-[#8096AE] font-mono tabular-nums shrink-0">{fmt(pos)} / {total > 0 ? fmt(total) : '–:––'}</span>
      </div>
      {error && <p role="alert" className="text-xs text-[#C8102E] mt-1">{error}</p>}
    </div>
  )
}
