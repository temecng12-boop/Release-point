'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { newLessonPath } from '@/lib/lesson-path'
import { browserRecordingEnv, micErrorMessage, recordedDurationMs, recordingSupportError } from '@/lib/lesson-recording'
import { useRouter } from 'next/navigation'
import { formatSeconds, watchMediaDuration } from '@/lib/media-duration'
import { runAction } from '@/lib/action-result'
import { marksAfterClear } from '@/lib/mark-clear'
import { saveAnnotation, deleteAnnotation, clearAnnotations, saveTimestampNote, getSignedUploadUrl, saveLessonPath, saveReframe } from '@/app/actions/clips'

// ── playback ───────────────────────────────────────────────────────────────
const FRAME = 1 / 30

// ── tracker constants ──────────────────────────────────────────────────────
const PATCH        = 14   // NCC patch radius (fallback search)
const PATCH_PIXELS = (2 * PATCH + 1) * (2 * PATCH + 1) * 3
const MIN_NCC      = 0.55 // NCC confidence floor
const LK_WIN       = 8    // Lucas-Kanade window radius
const LK_ITERS     = 5    // LK refinement iterations per pyramid level
const LK_LEVELS    = 3    // pyramid levels (each halves resolution; handles larger motions)
const LK_MIN_Q     = 8    // minimum eigenvalue to consider a point trackable
const SMOOTH       = 0.85 // position smoothing
const LEARN        = 0.06 // template adaptation rate (for NCC fallback)

// ── drawing ────────────────────────────────────────────────────────────────
const INK_WIDTH = 7

type Point = { x: number; y: number }
type ShapeType = 'freehand' | 'line' | 'rect' | 'circle'
type Shape = {
  id?: string
  type: ShapeType
  color: string
  points?: Point[]
  start?: Point
  end?: Point
  anchor?: Point
  currentAnchor?: Point
  originTime?: number
  lastTrackedTime?: number
  template?: Float64Array
}

export type DbAnnotation = {
  id: string
  type: string
  color: string
  points: Point[] | null
  start_pt: Point | null
  end_pt: Point | null
  origin_time: number
}

export type StampShape = {
  type: string
  color: string
  points?: Point[]
  start?: Point
  end?: Point
}

// ── tracker functions ──────────────────────────────────────────────────────

// Clamped grayscale pixel read (nearest neighbour)
function getGray(d: Uint8ClampedArray, x: number, y: number, w: number, h: number): number {
  const px = Math.min(w - 1, Math.max(0, x | 0))
  const py = Math.min(h - 1, Math.max(0, y | 0))
  const i  = (py * w + px) * 4
  return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
}

// Bilinear interpolated grayscale (needed for sub-pixel LK)
function bilinearGray(d: Uint8ClampedArray, x: number, y: number, w: number, h: number): number {
  const x0 = Math.min(w - 2, Math.max(0, x | 0))
  const y0 = Math.min(h - 2, Math.max(0, y | 0))
  const fx = x - x0, fy = y - y0
  const i00 = (y0 * w + x0) * 4, i10 = i00 + 4
  const i01 = ((y0 + 1) * w + x0) * 4, i11 = i01 + 4
  const g   = (i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
  return (1 - fx) * (1 - fy) * g(i00) + fx * (1 - fy) * g(i10) +
         (1 - fx) * fy       * g(i01) + fx * fy       * g(i11)
}

// 2×2 box-filter downsample for pyramid
function downsample(src: ImageData): ImageData {
  const w = src.width >> 1, h = src.height >> 1
  const out = new ImageData(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i00 = (2 * y * src.width + 2 * x) * 4
      const i10 = i00 + 4
      const i01 = ((2 * y + 1) * src.width + 2 * x) * 4
      const i11 = i01 + 4
      const j   = (y * w + x) * 4
      out.data[j]   = (src.data[i00]   + src.data[i10]   + src.data[i01]   + src.data[i11])   >> 2
      out.data[j+1] = (src.data[i00+1] + src.data[i10+1] + src.data[i01+1] + src.data[i11+1]) >> 2
      out.data[j+2] = (src.data[i00+2] + src.data[i10+2] + src.data[i01+2] + src.data[i11+2]) >> 2
      out.data[j+3] = 255
    }
  }
  return out
}

// Lucas-Kanade at a single pyramid level with initial velocity guess
function lkLevel(
  prev: ImageData, curr: ImageData,
  px: number, py: number,
  initVx = 0, initVy = 0,
): { vx: number; vy: number; quality: number } {
  const { width: w, height: h } = prev

  // Structure tensor — constant across iterations
  let Sxx = 0, Sxy = 0, Syy = 0
  for (let dy = -LK_WIN; dy <= LK_WIN; dy++) {
    for (let dx = -LK_WIN; dx <= LK_WIN; dx++) {
      const x  = px + dx, y = py + dy
      const gx = (getGray(prev.data, x + 1, y, w, h) - getGray(prev.data, x - 1, y, w, h)) * 0.5
      const gy = (getGray(prev.data, x, y + 1, w, h) - getGray(prev.data, x, y - 1, w, h)) * 0.5
      Sxx += gx * gx; Sxy += gx * gy; Syy += gy * gy
    }
  }
  const det = Sxx * Syy - Sxy * Sxy
  const tr  = Sxx + Syy
  // Minimum eigenvalue — measures how trackable the point is
  const minEig = (tr - Math.sqrt(Math.max(0, tr * tr - 4 * det))) / 2
  if (det < 1e-4) return { vx: initVx, vy: initVy, quality: 0 }

  // Iterative refinement
  let vx = initVx, vy = initVy
  for (let iter = 0; iter < LK_ITERS; iter++) {
    let bx = 0, by = 0
    for (let dy = -LK_WIN; dy <= LK_WIN; dy++) {
      for (let dx = -LK_WIN; dx <= LK_WIN; dx++) {
        const x  = px + dx, y = py + dy
        const gx = (getGray(prev.data, x + 1, y, w, h) - getGray(prev.data, x - 1, y, w, h)) * 0.5
        const gy = (getGray(prev.data, x, y + 1, w, h) - getGray(prev.data, x, y - 1, w, h)) * 0.5
        const gt = bilinearGray(curr.data, x + vx, y + vy, w, h) - getGray(prev.data, x, y, w, h)
        bx += gx * gt; by += gy * gt
      }
    }
    vx -= (Syy * bx - Sxy * by) / det
    vy -= (Sxx * by - Sxy * bx) / det
  }
  return { vx, vy, quality: minEig }
}

// Pyramidal LK — coarse→fine so large inter-frame motions are handled
function pyramidalLK(
  prev: ImageData, curr: ImageData, px: number, py: number,
): { x: number; y: number; quality: number } {
  const prevPyr: ImageData[] = [prev], currPyr: ImageData[] = [curr]
  for (let l = 1; l < LK_LEVELS; l++) {
    prevPyr.push(downsample(prevPyr[l - 1]))
    currPyr.push(downsample(currPyr[l - 1]))
  }
  let vx = 0, vy = 0, quality = 0
  for (let l = LK_LEVELS - 1; l >= 0; l--) {
    const scale = 1 << l
    const res   = lkLevel(prevPyr[l], currPyr[l], px / scale, py / scale, vx, vy)
    vx = res.vx * (l > 0 ? 2 : 1)
    vy = res.vy * (l > 0 ? 2 : 1)
    if (l === 0) quality = res.quality
  }
  return { x: px + vx, y: py + vy, quality }
}

// NCC patch extractor — used for fallback search
function extractPatch(imgData: ImageData, cx: number, cy: number, w: number, h: number): Float64Array {
  const out = new Float64Array(PATCH_PIXELS)
  let idx = 0
  for (let dy = -PATCH; dy <= PATCH; dy++) {
    for (let dx = -PATCH; dx <= PATCH; dx++) {
      const px = Math.min(w - 1, Math.max(0, Math.round(cx + dx)))
      const py = Math.min(h - 1, Math.max(0, Math.round(cy + dy)))
      const s  = (py * w + px) * 4
      out[idx++] = imgData.data[s]
      out[idx++] = imgData.data[s + 1]
      out[idx++] = imgData.data[s + 2]
    }
  }
  return out
}

function patchNCC(a: Float64Array, b: Float64Array): number {
  const N = a.length
  let ma = 0, mb = 0
  for (let i = 0; i < N; i++) { ma += a[i]; mb += b[i] }
  ma /= N; mb /= N
  let num = 0, da2 = 0, db2 = 0
  for (let i = 0; i < N; i++) {
    const da = a[i] - ma, db = b[i] - mb
    num += da * db; da2 += da * da; db2 += db * db
  }
  return (da2 < 1 || db2 < 1) ? 0 : num / Math.sqrt(da2 * db2)
}

// NCC coarse+fine search — fallback when LK verification fails
function nccSearch(
  imgData: ImageData, w: number, h: number,
  template: Float64Array, lastX: number, lastY: number,
): { x: number; y: number; score: number } {
  let best = -Infinity, bx = lastX, by = lastY
  for (let dy = -40; dy <= 40; dy += 4) {
    for (let dx = -40; dx <= 40; dx += 4) {
      const score = patchNCC(template, extractPatch(imgData, lastX + dx, lastY + dy, w, h))
      if (score > best) { best = score; bx = lastX + dx; by = lastY + dy }
    }
  }
  const cx = bx, cy = by; best = -Infinity
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const score = patchNCC(template, extractPatch(imgData, cx + dx, cy + dy, w, h))
      if (score > best) { best = score; bx = cx + dx; by = cy + dy }
    }
  }
  return { x: bx, y: by, score: best }
}

// ── helpers ────────────────────────────────────────────────────────────────
// Unknown values show "--", never 0.00s (QA-007).
function fmtTime(t: number | null) { return formatSeconds(t) }

function dbToShape(a: DbAnnotation): Shape {
  const shape: Shape = {
    id: a.id,
    type: a.type as ShapeType,
    color: a.color,
    points: a.points ?? undefined,
    start: a.start_pt ?? undefined,
    end: a.end_pt ?? undefined,
    originTime: a.origin_time,
    lastTrackedTime: a.origin_time,
  }
  // compute anchor so shape renders at its placed position (no template = no tracking)
  if (shape.type === 'freehand' && shape.points?.length) {
    const anchor = {
      x: shape.points.reduce((s, p) => s + p.x, 0) / shape.points.length,
      y: shape.points.reduce((s, p) => s + p.y, 0) / shape.points.length,
    }
    shape.anchor = anchor; shape.currentAnchor = { ...anchor }
  } else if (shape.start && shape.end) {
    const anchor = { x: (shape.start.x + shape.end.x) / 2, y: (shape.start.y + shape.end.y) / 2 }
    shape.anchor = anchor; shape.currentAnchor = { ...anchor }
  }
  return shape
}

// ── style helpers ──────────────────────────────────────────────────────────
const TOOLS = [
  { id: 'pointer',  label: 'Pointer' },
  { id: 'freehand', label: 'Pen'     },
  { id: 'line',     label: 'Line'    },
  { id: 'rect',     label: 'Box'     },
  { id: 'circle',   label: 'Circle'  },
] as const

const COLORS = [
  { hex: '#E9412F', label: 'Red'   },
  { hex: '#FFFFFF', label: 'White' },
  { hex: '#4ADE80', label: 'Green' },
]

const oswald  = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)' }
const divider = { borderTop: '1px solid #DDE4ED' }
const btnBase = 'px-2 py-1.5 sm:px-3 sm:py-2 rounded-md text-[0.65rem] sm:text-[0.76rem] uppercase tracking-wider cursor-pointer transition-colors'
const btnIdle = 'text-[#456080] hover:bg-[#EEF2F7] hover:text-[#0F1F33]'
const btnOn   = 'bg-[#C8102E] text-white'
const tgroup  = 'flex gap-1 bg-[#F0F4F8] rounded-lg p-[3px] items-center border border-[#DDE4ED]'

// ── component ──────────────────────────────────────────────────────────────
export default function VideoPlayer({
  src,
  clipId,
  playerId,
  role,
  initialAnnotations = [],
  initialReframe = null,
  canRecordLesson,
}: {
  src: string
  clipId: string
  playerId: string
  role: 'coach' | 'player'
  initialAnnotations?: DbAnnotation[]
  initialReframe?: { left: number; top: number; right: number; bottom: number } | null
  /** Lesson recording is for the player's direct coach only (defaults to role === 'coach'). */
  canRecordLesson?: boolean
}) {
  const isCoach = role === 'coach'
  const canRecord = canRecordLesson ?? isCoach

  const videoRef       = useRef<HTMLVideoElement>(null)
  const overlayRef     = useRef<HTMLCanvasElement>(null)
  const scrubRef       = useRef<HTMLInputElement>(null)
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const prevFrameRef   = useRef<{ imgData: ImageData; w: number; h: number } | null>(null)
  const scrubbingRef   = useRef(false)

  // drawing state refs
  const annotationsRef     = useRef<Shape[]>([])
  const draftRef           = useRef<Shape | null>(null)
  const toolRef            = useRef<string>('pointer')
  const inkColorRef        = useRef('#E9412F')
  const trackingEnabledRef = useRef(true)

  // UI state
  const [playing,         setPlaying]         = useState(false)
  const [currentTime,     setCurrentTime]     = useState(0)
  const [duration,        setDuration]        = useState<number | null>(null)   // null until the browser has a finite length
  const [speed,           setSpeedState]      = useState(1)
  const [tool,            setTool]            = useState('pointer')
  const [inkColor,        setInkColor]        = useState('#E9412F')
  const [markerCount,     setMarkerCount]     = useState(0)
  const [trackingEnabled, setTrackingEnabled] = useState(true)
  const [videoError,      setVideoError]      = useState(false)
  type MarkItem = { ref: Shape; type: string; color: string; time: number }
  const [markList,        setMarkList]        = useState<MarkItem[]>([])

  // video aspect ratio — used to constrain portrait videos
  const [videoAspect,    setVideoAspect]      = useState<number | null>(null)

  // stamp overlay
  const stampOverlayRef  = useRef<StampShape[]>([])
  const stampTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [stampMode,      setStampMode]        = useState(false)
  const [stampText,      setStampText]        = useState('')
  const [stampSaving,    setStampSaving]      = useState(false)
  const [stampError,     setStampError]       = useState<string | null>(null)
  const [markError,      setMarkError]        = useState<string | null>(null)

  // reframe
  type Crop = { left: number; top: number; right: number; bottom: number }
  type HandleId = 'tl' | 't' | 'tr' | 'r' | 'br' | 'b' | 'bl' | 'l'
  const fullCrop: Crop = { left: 0, top: 0, right: 100, bottom: 100 }
  const [reframeMode,    setReframeMode]      = useState(false)
  const [crop,           setCrop]             = useState<Crop>(
    initialReframe && 'left' in initialReframe ? initialReframe : fullCrop
  )
  const [reframeSaved,   setReframeSaved]     = useState(false)
  const [reframeSaveErr, setReframeSaveErr]   = useState<string | null>(null)
  const stageRef        = useRef<HTMLDivElement>(null)
  const reframeModeRef  = useRef(false)
  const cropDragRef     = useRef<{ handle: HandleId; startX: number; startY: number; startCrop: Crop } | null>(null)

  // lesson recording
  // Saved lessons are listed below the player (LessonList); this only records.
  const router = useRouter()
  const [lessonNotice,   setLessonNotice]     = useState<string | null>(null)
  const lessonStartRef   = useRef<number>(0)
  const [lessonPhase,    setLessonPhase]      = useState<'idle' | 'recording' | 'saving'>('idle')
  const [lessonSecs,     setLessonSecs]       = useState(0)
  const [lessonError,    setLessonError]      = useState<string | null>(null)
  const lessonCanvasRef  = useRef<HTMLCanvasElement | null>(null)
  const lessonRecRef     = useRef<MediaRecorder | null>(null)
  const lessonChunksRef  = useRef<Blob[]>([])
  const lessonRafRef     = useRef<number | null>(null)
  const lessonTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const lessonTicksRef   = useRef(0)   // whole seconds recorded (duration fallback)

  // load initial annotations from DB
  useEffect(() => {
    const shapes = initialAnnotations.map(dbToShape)
    annotationsRef.current = shapes
    setMarkerCount(shapes.length)
    setMarkList(shapes.map(s => ({ ref: s, type: s.type, color: s.color, time: s.originTime ?? 0 })))
    // Use rAF so canvas is sized after video layout
    requestAnimationFrame(() => { resizeCanvas(); drawFrame() })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── tracker helpers ──────────────────────────────────────────────────────
  function grabFrame() {
    const video = videoRef.current
    if (!video || !video.videoWidth || !video.videoHeight) return null
    if (!frameCanvasRef.current) frameCanvasRef.current = document.createElement('canvas')
    const c    = frameCanvasRef.current
    c.width    = video.videoWidth; c.height = video.videoHeight
    const fctx = c.getContext('2d', { willReadFrequently: true })!
    fctx.drawImage(video, 0, 0, c.width, c.height)
    return { imgData: fctx.getImageData(0, 0, c.width, c.height), w: c.width, h: c.height }
  }

  function updateTracking() {
    if (!trackingEnabledRef.current || annotationsRef.current.length === 0) return
    const curr = grabFrame()
    if (!curr) return
    const prev = prevFrameRef.current
    const t    = videoRef.current?.currentTime ?? 0

    annotationsRef.current.forEach(s => {
      if (!s.anchor) return
      if (t < (s.originTime ?? 0) - 0.001) {
        s.currentAnchor = { ...s.anchor }; s.lastTrackedTime = s.originTime; return
      }

      let nx = s.currentAnchor!.x, ny = s.currentAnchor!.y
      let confident = false

      // Primary: pyramidal Lucas-Kanade (frame-to-frame optical flow)
      if (prev && t > (s.lastTrackedTime ?? 0) + 0.001) {
        const lk = pyramidalLK(prev.imgData, curr.imgData, s.currentAnchor!.x, s.currentAnchor!.y)
        if (lk.quality >= LK_MIN_Q && s.template) {
          // Verify LK result with NCC — rejects drifts into wrong textures
          const ncc = patchNCC(s.template, extractPatch(curr.imgData, lk.x, lk.y, curr.w, curr.h))
          if (ncc >= MIN_NCC) {
            nx = lk.x; ny = lk.y; confident = true
            // Slowly adapt template to appearance changes
            const fresh = extractPatch(curr.imgData, lk.x, lk.y, curr.w, curr.h)
            for (let i = 0; i < s.template.length; i++)
              s.template[i] = s.template[i] * (1 - LEARN) + fresh[i] * LEARN
          }
        }
      }

      // Fallback: NCC search (used when paused, scrubbing, or LK lost the point)
      if (!confident && s.template) {
        const res = nccSearch(curr.imgData, curr.w, curr.h, s.template, s.currentAnchor!.x, s.currentAnchor!.y)
        if (res.score >= MIN_NCC) { nx = res.x; ny = res.y }
      }

      s.currentAnchor = {
        x: s.currentAnchor!.x + (nx - s.currentAnchor!.x) * SMOOTH,
        y: s.currentAnchor!.y + (ny - s.currentAnchor!.y) * SMOOTH,
      }
      s.lastTrackedTime = t
    })

    prevFrameRef.current = curr
  }

  // ── canvas drawing ───────────────────────────────────────────────────────
  const drawFrame = useCallback(() => {
    const canvas = overlayRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    function drawShape(s: Shape) {
      const dx = s.anchor && s.currentAnchor ? s.currentAnchor.x - s.anchor.x : 0
      const dy = s.anchor && s.currentAnchor ? s.currentAnchor.y - s.anchor.y : 0
      ctx!.strokeStyle = s.color; ctx!.lineWidth = INK_WIDTH
      ctx!.lineCap = 'round';     ctx!.lineJoin  = 'round'

      if (s.type === 'freehand' && s.points) {
        ctx!.beginPath()
        s.points.forEach((p, i) => i === 0 ? ctx!.moveTo(p.x + dx, p.y + dy) : ctx!.lineTo(p.x + dx, p.y + dy))
        ctx!.stroke()
      } else if (s.type === 'line' && s.start && s.end) {
        ctx!.beginPath()
        ctx!.moveTo(s.start.x + dx, s.start.y + dy)
        ctx!.lineTo(s.end.x   + dx, s.end.y   + dy)
        ctx!.stroke()
      } else if (s.type === 'rect' && s.start && s.end) {
        ctx!.strokeRect(
          Math.min(s.start.x, s.end.x) + dx, Math.min(s.start.y, s.end.y) + dy,
          Math.abs(s.end.x - s.start.x), Math.abs(s.end.y - s.start.y)
        )
      } else if (s.type === 'circle' && s.start && s.end) {
        ctx!.beginPath()
        ctx!.ellipse(
          (s.start.x + s.end.x) / 2 + dx, (s.start.y + s.end.y) / 2 + dy,
          Math.abs(s.end.x - s.start.x) / 2, Math.abs(s.end.y - s.start.y) / 2,
          0, 0, Math.PI * 2
        )
        ctx!.stroke()
      }
    }

    annotationsRef.current.forEach(drawShape)
    if (draftRef.current) drawShape(draftRef.current)

    // stamp overlay — drawn at original coords with no tracking offset
    if (stampOverlayRef.current.length) {
      ctx.save()
      ctx.globalAlpha = 0.85
      stampOverlayRef.current.forEach(s => {
        ctx!.strokeStyle = s.color; ctx!.lineWidth = INK_WIDTH
        ctx!.lineCap = 'round';     ctx!.lineJoin  = 'round'
        if (s.type === 'freehand' && s.points) {
          ctx!.beginPath()
          s.points.forEach((p, i) => i === 0 ? ctx!.moveTo(p.x, p.y) : ctx!.lineTo(p.x, p.y))
          ctx!.stroke()
        } else if (s.type === 'line' && s.start && s.end) {
          ctx!.beginPath(); ctx!.moveTo(s.start.x, s.start.y); ctx!.lineTo(s.end.x, s.end.y); ctx!.stroke()
        } else if (s.type === 'rect' && s.start && s.end) {
          ctx!.strokeRect(Math.min(s.start.x, s.end.x), Math.min(s.start.y, s.end.y), Math.abs(s.end.x - s.start.x), Math.abs(s.end.y - s.start.y))
        } else if (s.type === 'circle' && s.start && s.end) {
          ctx!.beginPath()
          ctx!.ellipse((s.start.x + s.end.x) / 2, (s.start.y + s.end.y) / 2, Math.abs(s.end.x - s.start.x) / 2, Math.abs(s.end.y - s.start.y) / 2, 0, 0, Math.PI * 2)
          ctx!.stroke()
        }
      })
      ctx.restore()
    }
  }, [])

  const resizeCanvas = useCallback(() => {
    const canvas = overlayRef.current, video = videoRef.current
    if (!canvas || !video) return
    canvas.width  = video.videoWidth  || canvas.offsetWidth
    canvas.height = video.videoHeight || canvas.offsetHeight
    drawFrame()
  }, [drawFrame])

  function canvasPoint(e: MouseEvent | TouchEvent): Point {
    const canvas = overlayRef.current!
    const rect   = canvas.getBoundingClientRect()
    const t      = (e as TouchEvent).touches?.[0]
    const cx     = (t ? t.clientX : (e as MouseEvent).clientX) - rect.left
    const cy     = (t ? t.clientY : (e as MouseEvent).clientY) - rect.top
    return { x: (cx / rect.width) * canvas.width, y: (cy / rect.height) * canvas.height }
  }

  function computeAnchor(d: Shape): Point {
    if (d.type === 'freehand' && d.points?.length)
      return { x: d.points.reduce((s, p) => s + p.x, 0) / d.points.length, y: d.points.reduce((s, p) => s + p.y, 0) / d.points.length }
    return { x: ((d.start?.x ?? 0) + (d.end?.x ?? 0)) / 2, y: ((d.start?.y ?? 0) + (d.end?.y ?? 0)) / 2 }
  }

  // ── drawing event listeners (coach only) ─────────────────────────────────
  useEffect(() => {
    const canvas = overlayRef.current
    if (!canvas || !isCoach) return

    function startDraw(e: MouseEvent | TouchEvent) {
      if (toolRef.current === 'pointer') return
      e.preventDefault()
      videoRef.current?.pause()
      const p = canvasPoint(e)
      draftRef.current = toolRef.current === 'freehand'
        ? { type: 'freehand', color: inkColorRef.current, points: [p] }
        : { type: toolRef.current as ShapeType, color: inkColorRef.current, start: p, end: p }
    }

    function moveDraw(e: MouseEvent | TouchEvent) {
      if (!draftRef.current) return
      if ('buttons' in e && (e as MouseEvent).buttons === 0) { endDraw(); return }
      e.preventDefault()
      const p = canvasPoint(e)
      if (draftRef.current.type === 'freehand') draftRef.current.points!.push(p)
      else draftRef.current.end = p
      drawFrame()
    }

    function endDraw() {
      if (!draftRef.current) return
      const d    = draftRef.current
      const keep = d.type === 'freehand'
        ? (d.points?.length ?? 0) > 1
        : Math.hypot((d.end!.x - d.start!.x), (d.end!.y - d.start!.y)) > 4
      if (keep) {
        const anchor = computeAnchor(d)
        d.anchor = anchor; d.currentAnchor = { ...anchor }
        d.originTime = videoRef.current?.currentTime ?? 0
        d.lastTrackedTime = d.originTime
        const frame = grabFrame()
        if (frame) d.template = extractPatch(frame.imgData, anchor.x, anchor.y, frame.w, frame.h)
        annotationsRef.current = [...annotationsRef.current, d]
        setMarkerCount(c => c + 1)
        const item = { ref: d, type: d.type, color: d.color, time: d.originTime ?? 0 }
        setMarkList(prev => [...prev, item])

        // persist to DB — update id when it comes back
        saveAnnotation({
          clip_id:     clipId,
          type:        d.type,
          color:       d.color,
          points:      d.points ?? null,
          start_pt:    d.start  ?? null,
          end_pt:      d.end    ?? null,
          origin_time: d.originTime ?? 0,
        }).then(result => {
          if (result?.error) {
            setMarkError(`Mark not saved: ${result.error}`)
            annotationsRef.current = annotationsRef.current.filter(s => s !== d)
            setMarkList(prev => prev.filter(m => m.ref !== d))
            setMarkerCount(c => c - 1)
            drawFrame()
          } else if (result?.id) {
            setMarkError(null)
            d.id = result.id
            setMarkList(prev => prev.map(m => m.ref === d ? { ...m } : m))
          }
        })
      }
      draftRef.current = null
      drawFrame()
    }

    canvas.addEventListener('mousedown',  startDraw)
    canvas.addEventListener('mousemove',  moveDraw)
    canvas.addEventListener('touchstart', startDraw, { passive: false })
    canvas.addEventListener('touchmove',  moveDraw,  { passive: false })
    window.addEventListener('mouseup',    endDraw)
    window.addEventListener('touchend',   endDraw)

    return () => {
      canvas.removeEventListener('mousedown',  startDraw)
      canvas.removeEventListener('mousemove',  moveDraw)
      canvas.removeEventListener('touchstart', startDraw)
      canvas.removeEventListener('touchmove',  moveDraw)
      window.removeEventListener('mouseup',    endDraw)
      window.removeEventListener('touchend',   endDraw)
    }
  }, [isCoach, clipId, drawFrame])

  // ── video event listeners ────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current, scrub = scrubRef.current
    if (!video || !scrub) return

    function onLoadedMetadata() {
      if (video!.videoWidth && video!.videoHeight) {
        setVideoAspect(video!.videoWidth / video!.videoHeight)
      }
      resizeCanvas()
    }
    function onTimeUpdate() {
      if (!scrubbingRef.current) scrub!.value = String(Math.floor(video!.currentTime * 1000))
      setCurrentTime(video!.currentTime)
      if (video!.paused) { updateTracking(); drawFrame() }
    }
    function onPlay()  { setPlaying(true) }
    function onPause() { setPlaying(false); updateTracking(); drawFrame() }
    function onEnded() { setPlaying(false) }

    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('durationchange', onLoadedMetadata)
    // Metadata may have loaded before this effect ran (QA-007: "0.00s" total).
    const lateMeta = video.readyState >= 1 ? setTimeout(onLoadedMetadata, 0) : null
    video.addEventListener('timeupdate',     onTimeUpdate)
    video.addEventListener('play',           onPlay)
    video.addEventListener('pause',          onPause)
    video.addEventListener('ended',          onEnded)
    window.addEventListener('resize',        resizeCanvas)
    // Duration (QA-007): webm clips can report Infinity until resolved, and it
    // can change later (durationchange). Shared with the lesson player.
    const stopDuration = watchMediaDuration(video, (d) => {
      setDuration(d)
      scrub!.max = String(d != null ? Math.floor(d * 1000) || 1000 : 1000)
    })

    return () => {
      stopDuration()
      setDuration(null)
      prevFrameRef.current = null
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('durationchange', onLoadedMetadata)
      if (lateMeta) clearTimeout(lateMeta)
      video.removeEventListener('timeupdate',     onTimeUpdate)
      video.removeEventListener('play',           onPlay)
      video.removeEventListener('pause',          onPause)
      video.removeEventListener('ended',          onEnded)
      window.removeEventListener('resize',        resizeCanvas)
    }
  }, [src, drawFrame, resizeCanvas])

  // ── stamp overlay listener ───────────────────────────────────────────────
  useEffect(() => {
    function clearStamp() {
      stampOverlayRef.current = []
      if (stampTimerRef.current) clearTimeout(stampTimerRef.current)
      drawFrame()
    }
    function onShowStamp(e: Event) {
      const { shapes } = (e as CustomEvent).detail as { shapes: StampShape[]; time: number }
      stampOverlayRef.current = shapes
      drawFrame()
      if (stampTimerRef.current) clearTimeout(stampTimerRef.current)
      stampTimerRef.current = setTimeout(clearStamp, 4000)
    }
    window.addEventListener('rp:show-stamp', onShowStamp)
    return () => window.removeEventListener('rp:show-stamp', onShowStamp)
  }, [drawFrame])

  // ── render loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing) return
    let raf: number
    function loop() { updateTracking(); drawFrame(); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing, drawFrame])

  // ── controls ─────────────────────────────────────────────────────────────
  function togglePlay() {
    const v = videoRef.current; if (!v) return
    if (v.paused) { clearStampOverlay(); v.play() } else { v.pause() }
  }
  function stepBack() {
    const v = videoRef.current; if (!v) return
    v.pause(); v.currentTime = Math.max(0, v.currentTime - FRAME)
  }
  function stepFwd() {
    const v = videoRef.current; if (!v) return
    v.pause(); v.currentTime = Math.min(v.duration || 0, v.currentTime + FRAME)
  }
  function clearStampOverlay() {
    if (stampTimerRef.current) clearTimeout(stampTimerRef.current)
    stampOverlayRef.current = []
  }
  function onScrubInput() {
    scrubbingRef.current = true
    clearStampOverlay()
    if (videoRef.current && scrubRef.current)
      videoRef.current.currentTime = Number(scrubRef.current.value) / 1000
  }
  function onScrubChange() { scrubbingRef.current = false }
  function changeSpeed(s: number) {
    if (videoRef.current) videoRef.current.playbackRate = s
    setSpeedState(s)
  }
  function selectTool(t: string)  { toolRef.current = t;     setTool(t) }
  function selectColor(c: string) { inkColorRef.current = c; setInkColor(c) }
  // Marks leave the screen only after the server removed them; on failure
  // they stay and the error is shown.
  async function removeAnnotation(shape: Shape) {
    // Still saving: removing it now would let the save land afterwards.
    if (!shape.id) return
    const id = shape.id
    const result = await runAction(() => deleteAnnotation(id))
    if (!result.ok) { setMarkError(`Mark not removed: ${result.error}`); return }
    setMarkError(null)
    annotationsRef.current = annotationsRef.current.filter(s => s !== shape)
    setMarkList(prev => prev.filter(m => m.ref !== shape))
    setMarkerCount(c => c - 1)
    drawFrame()
  }

  async function clearMarks() {
    const result = await runAction(() => clearAnnotations(clipId))
    if (!result.ok) { setMarkError(`Marks not cleared: ${result.error}`); return }
    // Only the marks the server deleted (this coach's saved marks) leave the screen.
    const removedIds = (result.value && 'removedIds' in result.value ? result.value.removedIds : undefined) ?? []
    const { kept, removed } = marksAfterClear(annotationsRef.current, removedIds)
    annotationsRef.current = kept; draftRef.current = null
    setMarkList(prev => prev.filter(m => kept.includes(m.ref)))
    setMarkerCount(c => c - removed)
    setMarkError(kept.length > 0 ? 'Some marks weren\'t cleared: marks added by someone else, or still saving, stay on the clip.' : null)
    drawFrame()
  }
  async function saveStamp() {
    if (!stampText.trim()) return
    const t = videoRef.current?.currentTime ?? 0
    const shapes: StampShape[] = annotationsRef.current.map(s => ({
      type: s.type,
      color: s.color,
      points: s.points ? s.points.map(p => ({ x: p.x + ((s.currentAnchor?.x ?? 0) - (s.anchor?.x ?? 0)), y: p.y + ((s.currentAnchor?.y ?? 0) - (s.anchor?.y ?? 0)) })) : undefined,
      start: s.start ? { x: s.start.x + ((s.currentAnchor?.x ?? 0) - (s.anchor?.x ?? 0)), y: s.start.y + ((s.currentAnchor?.y ?? 0) - (s.anchor?.y ?? 0)) } : undefined,
      end:   s.end   ? { x: s.end.x   + ((s.currentAnchor?.x ?? 0) - (s.anchor?.x ?? 0)), y: s.end.y   + ((s.currentAnchor?.y ?? 0) - (s.anchor?.y ?? 0)) } : undefined,
    }))
    setStampSaving(true)
    setStampError(null)
    try {
      const result = await saveTimestampNote({
        clip_id: clipId,
        time_seconds: t,
        body: stampText.trim(),
        drawing_data: shapes.length ? shapes : null,
      })
      if (result?.note) {
        window.dispatchEvent(new CustomEvent('rp:stamp-created', { detail: result.note }))
        setStampText('')
        setStampMode(false)
      } else {
        setStampError(result?.error ?? 'Could not save this stamp. Please try again.')
      }
    } catch (err) {
      console.error('[saveStamp] request failed', err)
      setStampError('Could not save this stamp. Check your connection and try again.')
    } finally {
      setStampSaving(false)
    }
  }

  async function startLessonRecording() {
    setLessonError(null)
    setLessonNotice(null)
    // QA-004: say why instead of failing silently (no MediaRecorder, no mic API, http).
    const unsupported = recordingSupportError(browserRecordingEnv())
    if (unsupported) { setLessonError(unsupported); return }
    try {
      await startVideoLessonRecording()
    } catch (err) {
      console.error('[lesson] could not start recording', err)
      setLessonError('Couldn\'t start recording in this browser. Try again, or use the latest Safari or Chrome.')
      setLessonPhase('idle')
    }
  }

  async function startVideoLessonRecording() {
    const video = videoRef.current
    const overlay = overlayRef.current
    if (!video || !overlay) return

    const lw = video.videoWidth || 1280
    const lh = video.videoHeight || 720
    const lCanvas = document.createElement('canvas')
    lCanvas.width = lw; lCanvas.height = lh
    lessonCanvasRef.current = lCanvas
    const lCtx = lCanvas.getContext('2d')!

    let micStream: MediaStream
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      setLessonError(micErrorMessage(err))
      return
    }

    function lessonLoop() {
      lCtx.drawImage(video!, 0, 0, lw, lh)
      lCtx.drawImage(overlay!, 0, 0, lw, lh)
      lessonRafRef.current = requestAnimationFrame(lessonLoop)
    }
    lessonLoop()

    const canvasStream = lCanvas.captureStream(30)
    const mixedStream = new MediaStream([
      canvasStream.getVideoTracks()[0],
      micStream.getAudioTracks()[0],
    ])

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : 'video/mp4'

    const recorder = new MediaRecorder(mixedStream, { mimeType })
    lessonChunksRef.current = []
    recorder.ondataavailable = (e) => { if (e.data.size > 0) lessonChunksRef.current.push(e.data) }
    // Release everything this recording opened, so the next one starts clean.
    const releaseStreams = () => {
      if (lessonRafRef.current) cancelAnimationFrame(lessonRafRef.current)
      lessonRafRef.current = null
      micStream.getTracks().forEach(t => t.stop())
      canvasStream.getTracks().forEach(t => t.stop())
    }
    // Event timestamps share one clock, so stop - start is the recording length.
    lessonStartRef.current = 0
    recorder.onstart = (ev) => { lessonStartRef.current = ev.timeStamp }
    recorder.onstop = (ev) => {
      releaseStreams()
      lessonRecRef.current = null
      const durationMs = recordedDurationMs(lessonStartRef.current, ev.timeStamp, lessonTicksRef.current)
      uploadLesson(mimeType, durationMs)
    }
    recorder.onerror = (ev) => {
      console.error('[lesson] recorder error', ev)
      if (lessonTimerRef.current) clearInterval(lessonTimerRef.current)
      releaseStreams()
      lessonRecRef.current = null
      setLessonError('Recording stopped unexpectedly. Try again.')
      setLessonPhase('idle')
    }
    recorder.start(250)
    lessonRecRef.current = recorder
    setLessonSecs(0)
    setLessonNotice(null)
    setLessonPhase('recording')
    lessonTicksRef.current = 0
    lessonTimerRef.current = setInterval(() => { lessonTicksRef.current++; setLessonSecs(s => s + 1) }, 1000)
  }

  function stopLessonRecording() {
    if (lessonTimerRef.current) clearInterval(lessonTimerRef.current)
    lessonRecRef.current?.stop()
    setLessonPhase('saving')
  }

  async function uploadLesson(mimeType: string, durationMs: number | null) {
    // A fresh object per recording: re-recording used to reuse lesson.<ext>,
    // which already existed, so the non-upsert signed upload was rejected.
    const path = newLessonPath(playerId, clipId, mimeType)
    // Strip codec parameters — Supabase MIME check only matches the base type
    const baseMime = mimeType.split(';')[0].trim()
    const blob = new Blob(lessonChunksRef.current, { type: baseMime })
    lessonChunksRef.current = []
    if (blob.size === 0) { setLessonError('Nothing was recorded. Try again.'); setLessonPhase('idle'); return }

    const urlResult = await getSignedUploadUrl(path, 'lessons')
    if ('error' in urlResult) {
      console.error('[lesson] signed upload URL failed', { path, error: urlResult.error })
      setLessonError(`Upload failed: ${urlResult.error}`); setLessonPhase('idle'); return
    }

    const res = await fetch(urlResult.signedUrl, {
      method: 'PUT', body: blob, headers: { 'Content-Type': baseMime },
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error('[lesson] upload failed', { path, status: res.status, size: blob.size, detail })
      setLessonError(`Upload failed (${res.status}). Try again.`); setLessonPhase('idle'); return
    }

    const saveResult = await saveLessonPath(clipId, path, { mime: baseMime, durationMs })
    if ('error' in saveResult) {
      console.error('[lesson] save failed', { path, error: saveResult.error })
      setLessonError(`Uploaded, but the lesson wasn't saved: ${saveResult.error}`); setLessonPhase('idle'); return
    }
    setLessonNotice(saveResult.warning ?? 'Lesson saved')
    setLessonPhase('idle')
    router.refresh()   // reload the lesson list for this clip
  }

  // ── reframe helpers ──────────────────────────────────────────────────────
  useEffect(() => { reframeModeRef.current = reframeMode }, [reframeMode])

  function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }

  function startCropDrag(e: React.PointerEvent, handle: HandleId) {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    cropDragRef.current = { handle, startX: e.clientX, startY: e.clientY, startCrop: { ...crop } }
  }

  function moveCropDrag(e: React.PointerEvent) {
    if (!cropDragRef.current) return
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const dx = (e.clientX - cropDragRef.current.startX) / rect.width * 100
    const dy = (e.clientY - cropDragRef.current.startY) / rect.height * 100
    const s = cropDragRef.current.startCrop
    const MIN = 10
    const h = cropDragRef.current.handle
    const next = { ...s }
    if (h === 'tl' || h === 'bl' || h === 'l') next.left   = clamp(s.left   + dx, 0,          s.right  - MIN)
    if (h === 'tr' || h === 'br' || h === 'r') next.right  = clamp(s.right  + dx, s.left + MIN, 100)
    if (h === 'tl' || h === 'tr' || h === 't') next.top    = clamp(s.top    + dy, 0,          s.bottom - MIN)
    if (h === 'bl' || h === 'br' || h === 'b') next.bottom = clamp(s.bottom + dy, s.top  + MIN, 100)
    setCrop(next)
  }

  function endCropDrag() { cropDragRef.current = null }

  function cropToInnerStyle(): React.CSSProperties {
    if (reframeMode) return { lineHeight: 0 }
    const { left, top, right, bottom } = crop
    const cw = (right - left) / 100
    const ch = (bottom - top) / 100
    if (cw >= 0.999 && ch >= 0.999) return { lineHeight: 0 }
    const W = stageRef.current?.offsetWidth ?? 0
    const H = stageRef.current?.offsetHeight ?? 0
    if (!W || !H) return { lineHeight: 0 }
    const z = Math.max(1 / cw, 1 / ch)
    const cx = (left + right) / 2
    const cy = (top + bottom) / 2
    const px = -(cx / 100 - 0.5) * W * z
    const py = -(cy / 100 - 0.5) * H * z
    return { transform: `translate(${px}px, ${py}px) scale(${z})`, transformOrigin: 'center center', lineHeight: 0 }
  }

  async function handleSaveReframe() {
    setReframeSaveErr(null)
    const result = await saveReframe(clipId, crop)
    if (result?.error) {
      setReframeSaveErr('Save failed: ' + result.error)
    } else {
      setReframeSaved(true)
      setTimeout(() => setReframeSaved(false), 2500)
    }
  }

  function resetReframe() {
    setCrop(fullCrop); setReframeSaved(false); setReframeSaveErr(null)
  }

  function toggleTracking() {
    const next = !trackingEnabledRef.current
    trackingEnabledRef.current = next
    setTrackingEnabled(next)
    if (!next) {
      annotationsRef.current.forEach(s => { if (s.anchor) s.currentAnchor = { ...s.anchor } })
      drawFrame()
    }
  }

  return (
    <div className="bg-white border border-[#DDE4ED] rounded-xl p-3.5 shadow-sm">
      {/* Stage */}
      <div
        ref={stageRef}
        className="relative bg-black rounded-md overflow-hidden mx-auto"
        style={{
          lineHeight: 0,
          ...(videoAspect && videoAspect < 1
            ? { maxWidth: `min(100%, calc(70vh * ${videoAspect.toFixed(4)}))` }
            : {}),
          }}
      >
        {videoError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black z-20">
            <p className="text-white text-sm opacity-70">Video unavailable. Try refreshing the page.</p>
          </div>
        )}
        {/* Crop overlay — only shown in reframe mode */}
        {reframeMode && (() => {
          const { left, top, right, bottom } = crop
          const handles: { id: HandleId; x: number; y: number; cursor: string }[] = [
            { id: 'tl', x: left,               y: top,                  cursor: 'nw-resize' },
            { id: 't',  x: (left + right) / 2, y: top,                  cursor: 'n-resize'  },
            { id: 'tr', x: right,              y: top,                  cursor: 'ne-resize' },
            { id: 'r',  x: right,              y: (top + bottom) / 2,   cursor: 'e-resize'  },
            { id: 'br', x: right,              y: bottom,               cursor: 'se-resize' },
            { id: 'b',  x: (left + right) / 2, y: bottom,               cursor: 's-resize'  },
            { id: 'bl', x: left,               y: bottom,               cursor: 'sw-resize' },
            { id: 'l',  x: left,               y: (top + bottom) / 2,   cursor: 'w-resize'  },
          ]
          return (
            <div className="absolute inset-0 z-20" style={{ pointerEvents: 'none' }}>
              {/* Dark mask outside crop */}
              <div style={{ position: 'absolute', inset: 0, top: 0, left: 0, right: 0, height: `${top}%`, background: 'rgba(0,0,0,0.55)' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${100 - bottom}%`, background: 'rgba(0,0,0,0.55)' }} />
              <div style={{ position: 'absolute', left: 0, top: `${top}%`, bottom: `${100 - bottom}%`, width: `${left}%`, background: 'rgba(0,0,0,0.55)' }} />
              <div style={{ position: 'absolute', right: 0, top: `${top}%`, bottom: `${100 - bottom}%`, width: `${100 - right}%`, background: 'rgba(0,0,0,0.55)' }} />
              {/* Crop border */}
              <div style={{ position: 'absolute', left: `${left}%`, top: `${top}%`, right: `${100 - right}%`, bottom: `${100 - bottom}%`, border: '1.5px solid rgba(255,255,255,0.85)', boxSizing: 'border-box' }} />
              {/* Rule-of-thirds grid */}
              <div style={{ position: 'absolute', left: `${left + (right - left) / 3}%`, top: `${top}%`, bottom: `${100 - bottom}%`, width: 1, background: 'rgba(255,255,255,0.2)' }} />
              <div style={{ position: 'absolute', left: `${left + (right - left) * 2 / 3}%`, top: `${top}%`, bottom: `${100 - bottom}%`, width: 1, background: 'rgba(255,255,255,0.2)' }} />
              <div style={{ position: 'absolute', top: `${top + (bottom - top) / 3}%`, left: `${left}%`, right: `${100 - right}%`, height: 1, background: 'rgba(255,255,255,0.2)' }} />
              <div style={{ position: 'absolute', top: `${top + (bottom - top) * 2 / 3}%`, left: `${left}%`, right: `${100 - right}%`, height: 1, background: 'rgba(255,255,255,0.2)' }} />
              {/* Handles */}
              {handles.map(h => (
                <div
                  key={h.id}
                  style={{
                    position: 'absolute',
                    left: `${h.x}%`,
                    top: `${h.y}%`,
                    transform: 'translate(-50%, -50%)',
                    width: 11,
                    height: 11,
                    background: 'white',
                    border: '1.5px solid rgba(0,0,0,0.4)',
                    borderRadius: 2,
                    cursor: h.cursor,
                    pointerEvents: 'auto',
                    touchAction: 'none',
                  }}
                  onPointerDown={e => startCropDrag(e, h.id)}
                  onPointerMove={moveCropDrag}
                  onPointerUp={endCropDrag}
                />
              ))}
            </div>
          )
        })()}
        {/* Inner stage — receives the crop transform when not in reframe mode */}
        <div style={cropToInnerStyle()}>
          <video
            ref={videoRef}
            src={src}
            playsInline
            crossOrigin="anonymous"
            className="w-full block"
            style={videoAspect && videoAspect < 1 ? { maxHeight: '70vh' } : {}}
            onError={() => setVideoError(true)}
          />
          <canvas
            ref={overlayRef}
            className="absolute inset-0 w-full h-full"
            style={{
              touchAction: 'none',
              cursor: isCoach && tool !== 'pointer' && !reframeMode ? 'crosshair' : 'default',
              pointerEvents: isCoach && !reframeMode ? 'auto' : 'none',
            }}
          />
        </div>
      </div>

      {/* Scrub */}
      <div className="flex items-center gap-3 mt-3">
        <span className="text-[0.76rem] text-[#3D5166] min-w-[100px] text-right tabular-nums" style={oswald}>
          {fmtTime(currentTime)} / {fmtTime(duration)}
        </span>
        <input
          ref={scrubRef}
          type="range" min="0" max="1000" defaultValue="0" step="1"
          onInput={onScrubInput} onChange={onScrubChange}
          className="flex-1 accent-[#C8102E] cursor-pointer h-1"
        />
      </div>

      {/* Transport + speed */}
      <div className="mt-3 pt-3 flex flex-wrap gap-2 items-center" style={divider}>
        <div className={tgroup} style={oswald}>
          <button onClick={togglePlay} className={`${btnBase} ${playing ? btnOn : btnIdle}`}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <button onClick={stepBack} className={`${btnBase} ${btnIdle}`}>
            <svg className="inline w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 16 16"><path d="M3 3h2v10H3V3zm9.854 1.146a.5.5 0 01.146.354v7a.5.5 0 01-.854.354L7.5 8.207V13a.5.5 0 01-1 0V3a.5.5 0 011 0v4.793l4.646-4.647a.5.5 0 01.708 0z"/></svg>
            Frame
          </button>
          <button onClick={stepFwd}  className={`${btnBase} ${btnIdle}`}>
            Frame
            <svg className="inline w-3 h-3 ml-1" fill="currentColor" viewBox="0 0 16 16"><path d="M13 3h-2v10h2V3zm-9.854 1.146a.5.5 0 00-.146.354v7a.5.5 0 00.854.354L8.5 8.207V13a.5.5 0 001 0V3a.5.5 0 00-1 0v4.793L4.854 3.146a.5.5 0 00-.708 0z"/></svg>
          </button>
        </div>
        <div className={tgroup} style={oswald}>
          {([0.25, 0.5, 1, 1.5, 2] as const).map(s => (
            <button key={s} onClick={() => changeSpeed(s)} className={`${btnBase} ${speed === s ? btnOn : btnIdle}`}>
              {s === 0.25 ? '.25x' : s === 0.5 ? '.5x' : s === 1 ? '1x' : s === 1.5 ? '1.5x' : '2x'}
            </button>
          ))}
        </div>
      </div>

      {/* Coach-only draw toolbar */}
      {isCoach && (
        <div className="mt-2 pt-2 flex flex-wrap gap-2 items-center justify-between" style={divider}>
          <div className="flex gap-2 flex-wrap items-center">
            <div className={tgroup} style={oswald}>
              {TOOLS.map(t => (
                <button key={t.id} onClick={() => selectTool(t.id)} className={`${btnBase} ${tool === t.id ? btnOn : btnIdle}`}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 px-1">
              {COLORS.map(c => (
                <button key={c.hex} onClick={() => selectColor(c.hex)} title={c.label}
                  style={{
                    width: 20, height: 20, borderRadius: '50%', background: c.hex, padding: 0, cursor: 'pointer',
                    border: inkColor === c.hex ? '2px solid white' : '2px solid transparent',
                    outline: c.hex === '#FFFFFF' ? '1px solid #5B6B7F' : 'none',
                    transform: inkColor === c.hex ? 'scale(1.25)' : 'scale(1)',
                    transition: 'transform 0.1s',
                  }}
                />
              ))}
            </div>

            <button onClick={toggleTracking} className={`${btnBase} border border-[#DDE4ED] ${trackingEnabled ? btnOn : 'bg-[#F0F4F8] ' + btnIdle}`} style={oswald}>
              Tracking: {trackingEnabled ? 'On' : 'Off'}
            </button>
          </div>

          <div className="flex gap-1">
            <button
              onClick={() => { setReframeMode(m => !m); setReframeSaveErr(null) }}
              className={`${btnBase} border border-[#DDE4ED] ${reframeMode ? btnOn : 'bg-[#F0F4F8] ' + btnIdle}`}
              style={oswald}
              title="Zoom and pan the video to focus on what matters"
            >
              Reframe
            </button>
            <button
              onClick={() => { setStampMode(m => !m); setStampText('') }}
              className={`${btnBase} border border-[#DDE4ED] ${stampMode ? btnOn : 'bg-[#F0F4F8] ' + btnIdle}`}
              style={oswald}
              title="Stamp current drawings as a timestamp note"
            >
              ✦ Stamp
            </button>
            <button onClick={clearMarks} className={`${btnBase} bg-[#F0F4F8] border border-[#DDE4ED] ${btnIdle}`} style={oswald}>
              Clear marks
            </button>
          </div>
        </div>
      )}

      {/* Reframe controls */}
      {isCoach && reframeMode && (
        <div className="mt-2 pt-2 flex flex-wrap items-center gap-3" style={divider}>
          <span className="text-[0.65rem] text-[#8096AE]" style={oswald}>
            Drag corners or edges to crop
          </span>
          <span className="text-[0.65rem] text-[#3D5166] tabular-nums" style={oswald}>
            {Math.round(crop.right - crop.left)}% × {Math.round(crop.bottom - crop.top)}%
          </span>
          <div className="flex gap-1 ml-auto">
            <button onClick={resetReframe} className={`${btnBase} bg-[#F0F4F8] border border-[#DDE4ED] ${btnIdle}`} style={oswald}>
              Reset
            </button>
            <button
              onClick={handleSaveReframe}
              className={`${btnBase} border border-[#DDE4ED] ${reframeSaved ? btnOn : 'bg-[#F0F4F8] ' + btnIdle}`}
              style={oswald}
            >
              {reframeSaved ? 'Saved ✓' : 'Save View'}
            </button>
          </div>
          {reframeSaveErr && (
            <p className="w-full text-[0.65rem] text-[#C8102E] font-mono break-all">{reframeSaveErr}</p>
          )}
        </div>
      )}

      {/* Stamp input row */}
      {isCoach && stampMode && (
        <div className="mt-2 pt-2 flex items-center gap-2" style={divider}>
          <span className="text-[0.68rem] text-[#8096AE] tabular-nums shrink-0" style={oswald}>{fmtTime(currentTime)}</span>
          <input
            autoFocus
            value={stampText}
            onChange={e => { setStampText(e.target.value); setStampError(null) }}
            onKeyDown={e => { if (e.key === 'Enter') saveStamp(); if (e.key === 'Escape') { setStampMode(false); setStampText('') } }}
            placeholder="Describe this moment…"
            className="flex-1 text-sm bg-white border border-[#DDE4ED] rounded-md px-3 py-1 text-[#0F1F33] placeholder:text-[#AAB8C8] focus:outline-none focus:border-[#456080]"
          />
          <button
            onClick={saveStamp}
            disabled={stampSaving || !stampText.trim()}
            className="text-xs bg-[#C8102E] hover:bg-[#9E0E24] text-white px-3 py-1 rounded-md transition-colors disabled:opacity-40 whitespace-nowrap shrink-0"
            style={oswald}
          >
            {stampSaving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={() => { setStampMode(false); setStampText('') }}
            className="text-xs text-[#8096AE] hover:text-[#C8102E] transition-colors"
          >
            ✕
          </button>
        </div>
      )}
      {isCoach && stampMode && stampError && (
        <p role="alert" className="mt-1 text-xs text-[#C8102E]">Stamp not saved: {stampError}</p>
      )}

      {/* Lesson recording */}
      {canRecord && lessonPhase !== 'idle' ? (
        <div className="mt-2 pt-2 flex items-center gap-3" style={divider}>
          <span className="w-2 h-2 rounded-full bg-[#C8102E] animate-pulse shrink-0" />
          <span className="text-xs text-[#C8102E]" style={oswald}>
            Recording · {String(Math.floor(lessonSecs / 60)).padStart(2, '0')}:{String(lessonSecs % 60).padStart(2, '0')}
          </span>
          <button
            onClick={stopLessonRecording}
            disabled={lessonPhase === 'saving'}
            className={`${btnBase} bg-slate-950 text-white ml-auto disabled:opacity-50`}
            style={oswald}
          >
            {lessonPhase === 'saving' ? 'Saving…' : 'Stop'}
          </button>
        </div>
      ) : canRecord && (
        <div className="mt-2 pt-2 flex items-center gap-2 flex-wrap" style={divider}>
          <button
            onClick={startLessonRecording}
            className={`${btnBase} border border-[#DDE4ED] bg-[#F0F4F8] ${btnIdle}`}
            style={oswald}
            title="Record a lesson: your voice + everything you draw and do on this clip"
          >
            ● Record Lesson
          </button>
          {lessonError && <span className="text-xs text-[#C8102E]">{lessonError}</span>}
          {lessonNotice && !lessonError && (lessonNotice === 'Lesson saved'
            ? <span className="text-xs text-slate-400" style={oswald}>{lessonNotice}</span>
            : <span role="status" className="text-xs text-[#B45309]">{lessonNotice}</span>)}
        </div>
      )}

      {/* Per-mark list (coach only) */}
      {isCoach && markList.length > 0 && (
        <div className="mt-2 pt-2 border-t border-[#DDE4ED]">
          <p className="text-[0.68rem] text-[#8096AE] tracking-widest mb-1.5" style={oswald}>Marks · tap ✕ to remove from player view</p>
          <div className="space-y-0.5 max-h-36 overflow-y-auto">
            {markList.map((m, i) => (
              <div key={i} className="flex items-center gap-2 text-[0.72rem] text-[#456080] py-0.5 px-1 rounded hover:bg-[#F0F4F8]">
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, border: '1px solid rgba(0,0,0,0.15)', flexShrink: 0, display: 'inline-block' }} />
                <span style={oswald} className="capitalize">{m.type}</span>
                <span className="text-[#8096AE] tabular-nums">{m.time.toFixed(2)}s</span>
                <button
                  onClick={() => removeAnnotation(m.ref)}
                  disabled={!m.ref.id}
                  className="ml-auto text-[#8096AE] hover:text-[#C8102E] transition-colors leading-none disabled:opacity-40"
                  title={m.ref.id ? 'Remove annotation' : 'Saving…'}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-2 text-[0.78rem] text-[#3D5166]">
        {markerCount} {markerCount === 1 ? 'mark' : 'marks'} on this clip
        {!isCoach && markerCount > 0 && <span className="ml-2 text-[#DDE4ED]">· coach annotations</span>}
        {isCoach && markError && <p role="alert" className="mt-1 text-xs text-[#C8102E]">{markError}</p>}
      </div>
    </div>
  )
}
