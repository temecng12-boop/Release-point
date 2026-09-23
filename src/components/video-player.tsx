'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { saveAnnotation } from '@/app/actions/clips'

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
function fmtTime(t: number) { return (isFinite(t) ? t : 0).toFixed(2) + 's' }

function dbToShape(a: DbAnnotation): Shape {
  const shape: Shape = {
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
const btnBase = 'px-3 py-2 rounded-md text-[0.76rem] uppercase tracking-wider cursor-pointer transition-colors'
const btnIdle = 'text-[#456080] hover:bg-[#EEF2F7] hover:text-[#0F1F33]'
const btnOn   = 'bg-[#C8102E] text-white'
const tgroup  = 'flex gap-1 bg-[#F0F4F8] rounded-lg p-[3px] items-center border border-[#DDE4ED]'

// ── component ──────────────────────────────────────────────────────────────
export default function VideoPlayer({
  src,
  clipId,
  role,
  initialAnnotations = [],
}: {
  src: string
  clipId: string
  role: 'coach' | 'player'
  initialAnnotations?: DbAnnotation[]
}) {
  const isCoach = role === 'coach'

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
  const [duration,        setDuration]        = useState(0)
  const [speed,           setSpeedState]      = useState(1)
  const [tool,            setTool]            = useState('pointer')
  const [inkColor,        setInkColor]        = useState('#E9412F')
  const [markerCount,     setMarkerCount]     = useState(0)
  const [trackingEnabled, setTrackingEnabled] = useState(true)

  // load initial annotations from DB
  useEffect(() => {
    const shapes = initialAnnotations.map(dbToShape)
    annotationsRef.current = shapes
    setMarkerCount(shapes.length)
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

        // persist to DB (fire-and-forget)
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
            console.error('annotation save failed:', result.error)
            // Remove the annotation from UI if save failed
            annotationsRef.current = annotationsRef.current.slice(0, -1)
            setMarkerCount(c => c - 1)
            drawFrame()
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
      setDuration(video!.duration)
      scrub!.max = String(Math.floor(video!.duration * 1000) || 1000)
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
    video.addEventListener('timeupdate',     onTimeUpdate)
    video.addEventListener('play',           onPlay)
    video.addEventListener('pause',          onPause)
    video.addEventListener('ended',          onEnded)
    window.addEventListener('resize',        resizeCanvas)

    return () => {
      prevFrameRef.current = null
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('timeupdate',     onTimeUpdate)
      video.removeEventListener('play',           onPlay)
      video.removeEventListener('pause',          onPause)
      video.removeEventListener('ended',          onEnded)
      window.removeEventListener('resize',        resizeCanvas)
    }
  }, [src, drawFrame, resizeCanvas])

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
    v.paused ? v.play() : v.pause()
  }
  function stepBack() {
    const v = videoRef.current; if (!v) return
    v.pause(); v.currentTime = Math.max(0, v.currentTime - FRAME)
  }
  function stepFwd() {
    const v = videoRef.current; if (!v) return
    v.pause(); v.currentTime = Math.min(v.duration || 0, v.currentTime + FRAME)
  }
  function onScrubInput() {
    scrubbingRef.current = true
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
  function clearMarks() {
    annotationsRef.current = []; draftRef.current = null
    setMarkerCount(0); drawFrame()
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
      <div className="relative bg-black rounded-md overflow-hidden" style={{ lineHeight: 0 }}>
        <video ref={videoRef} src={src} playsInline crossOrigin="anonymous" className="w-full block" />
        <canvas
          ref={overlayRef}
          className="absolute inset-0 w-full h-full"
          style={{
            touchAction: 'none',
            cursor: isCoach && tool !== 'pointer' ? 'crosshair' : 'default',
            pointerEvents: isCoach ? 'auto' : 'none',
          }}
        />
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
          <button onClick={stepBack} className={`${btnBase} ${btnIdle}`}>◄ Frame</button>
          <button onClick={stepFwd}  className={`${btnBase} ${btnIdle}`}>Frame ►</button>
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

            <button onClick={toggleTracking} className={`${btnBase} bg-[#F0F4F8] border border-[#DDE4ED] ${trackingEnabled ? btnOn : btnIdle}`} style={oswald}>
              Tracking: {trackingEnabled ? 'On' : 'Off'}
            </button>
          </div>

          <button onClick={clearMarks} className={`${btnBase} bg-[#F0F4F8] border border-[#DDE4ED] ${btnIdle}`} style={oswald}>
            Clear marks
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="mt-2 text-[0.78rem] text-[#3D5166]">
        {markerCount} {markerCount === 1 ? 'mark' : 'marks'} on this clip
        {!isCoach && markerCount > 0 && <span className="ml-2 text-[#DDE4ED]">— coach annotations</span>}
      </div>
    </div>
  )
}
