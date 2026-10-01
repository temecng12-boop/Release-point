'use client'

import { useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createClip, getSignedUploadUrl } from '@/app/actions/clips'
import BulkUploadModal from './bulk-upload-modal'
import { canUploadVideo, type PlayerConsentFields, type UploadBlockedViewer } from '@/lib/consent'
import UploadBlockedNotice from '@/components/upload-blocked-notice'

const COMPRESS_THRESHOLD_MB = 30
const FFMPEG_CORE_VERSION = '0.12.6'
const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

async function compressVideo(file: File, onProgress: (pct: number) => void): Promise<File> {
  const { FFmpeg } = await import('@ffmpeg/ffmpeg')
  const { fetchFile, toBlobURL } = await import('@ffmpeg/util')

  const ffmpeg = new FFmpeg()
  ffmpeg.on('progress', ({ progress }) => onProgress(Math.round(progress * 100)))

  const base = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`
  await ffmpeg.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
  })

  const ext = file.name.split('.').pop() ?? 'mp4'
  await ffmpeg.writeFile(`input.${ext}`, await fetchFile(file))

  await ffmpeg.exec([
    '-i', `input.${ext}`,
    '-vf', 'scale=-2:720',
    '-c:v', 'libx264',
    '-crf', '28',
    '-preset', 'fast',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    'output.mp4',
  ])

  const data = await ffmpeg.readFile('output.mp4')
  const rawBytes = typeof data === 'string' ? new TextEncoder().encode(data) : (data as Uint8Array)
  const safeBuf = rawBytes.buffer instanceof SharedArrayBuffer
    ? rawBytes.slice(0).buffer
    : (rawBytes.buffer as ArrayBuffer)
  const blob = new Blob([safeBuf], { type: 'video/mp4' })
  return new File([blob], file.name.replace(/\.[^.]+$/, '.mp4'), { type: 'video/mp4' })
}

type Phase = 'idle' | 'naming' | 'compressing' | 'uploading'

export default function UploadButton({
  playerId,
  playerName,
  maxFiles = 20,
  consent,
  viewer = 'coach',
  blockedAction,
  showBlockedNotice = true,
}: {
  playerId: string
  playerName: string
  maxFiles?: number
  /** The player's stored consent status (see src/lib/consent.ts). Required. */
  consent: PlayerConsentFields
  viewer?: UploadBlockedViewer
  /** Optional control shown under the blocked message, e.g. "Mark as 18+". */
  blockedAction?: ReactNode
  /** Set false when the parent renders its own UploadBlockedNotice. */
  showBlockedNotice?: boolean
}) {
  const [phase, setPhase]             = useState<Phase>('idle')
  const [compressPct, setCompressPct] = useState(0)
  const [error, setError]             = useState<string | null>(null)
  const [title, setTitle]             = useState('')
  const [bulkFiles, setBulkFiles]     = useState<File[] | null>(null)
  const inputRef    = useRef<HTMLInputElement>(null)
  const pendingFile = useRef<File | null>(null)
  const router      = useRouter()

  function handleFileSelected(file: File) {
    setError(null)
    pendingFile.current = file
    const today = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })
    setTitle(`${playerName} ${today}`)
    setPhase('naming')
  }

  async function handleFile(file: File, clipTitle: string) {
    setError(null)
    let fileToUpload = file

    const largeEnough = file.size > COMPRESS_THRESHOLD_MB * 1024 * 1024
    const canCompress = typeof SharedArrayBuffer !== 'undefined'

    if (largeEnough && canCompress) {
      setPhase('compressing')
      setCompressPct(0)
      try {
        fileToUpload = await compressVideo(file, setCompressPct)
      } catch {
        // Compression failed — upload original. User will see the larger file size.
        fileToUpload = file
        setError('Compression failed. Uploading original file.')
      }
    }

    setPhase('uploading')

    const ext = fileToUpload.name.split('.').pop() ?? 'mp4'
    const storagePath = `${playerId}/${Date.now()}.${ext}`

    const urlResult = await getSignedUploadUrl(storagePath)
    if ('error' in urlResult) {
      setError(urlResult.error ?? 'Upload failed')
      setPhase('idle')
      return
    }

    const supabase = createClient()
    const { error: uploadError } = await supabase.storage
      .from('clips')
      .uploadToSignedUrl(urlResult.path, urlResult.token, fileToUpload, { contentType: fileToUpload.type })

    if (uploadError) {
      setError(uploadError.message)
      setPhase('idle')
      return
    }

    const result = await createClip({
      player_id:    playerId,
      storage_path: storagePath,
      title:        clipTitle,
      session_date: null,
    })

    if (result?.error) {
      setError(result.error)
      setPhase('idle')
      return
    }

    setPhase('idle')
    if (inputRef.current) inputRef.current.value = ''
    router.refresh()
  }

  // ── consent gate ──────────────────────────────────────────────────────────
  if (!canUploadVideo(consent)) {
    if (!showBlockedNotice) return null
    return <UploadBlockedNotice viewer={viewer} action={blockedAction} className="max-w-xs" />
  }

  // ── naming overlay ───────────────────────────────────────────────────────
  if (phase === 'naming') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="bg-white border border-[#DDE4ED] shadow-sm rounded-xl p-6 w-[22rem] space-y-4">
          <p className="text-[10px] tracking-[0.3em] text-[#C8102E]" style={oswald}>Name This Clip</p>
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && title.trim() && pendingFile.current) handleFile(pendingFile.current, title.trim())
              if (e.key === 'Escape') { setPhase('idle'); pendingFile.current = null }
            }}
            placeholder="e.g. bullpen w/ Rapsodo 9/24"
            className="w-full border border-[#DDE4ED] rounded-md px-3 py-2 text-sm text-[#0F1F33] placeholder:text-[#AAB8C8] focus:outline-none focus:border-[#456080] max-sm:min-h-11"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setPhase('idle'); pendingFile.current = null }}
              className="text-xs text-[#456080] hover:text-[#0F1F33] px-3 py-1.5 rounded-md border border-[#DDE4ED] transition-colors max-sm:min-h-11"
              style={oswald}
            >
              Cancel
            </button>
            <button
              onClick={() => { if (title.trim() && pendingFile.current) handleFile(pendingFile.current, title.trim()) }}
              disabled={!title.trim()}
              className="text-xs bg-[#1C3A5C] hover:bg-[#223F63] text-white px-3 py-1.5 rounded-md transition-colors disabled:opacity-40 max-sm:min-h-11"
              style={oswald}
            >
              Upload
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── compressing overlay ───────────────────────────────────────────────────
  if (phase === 'compressing') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
        <div className="bg-white border border-[#DDE4ED] shadow-sm rounded-xl p-7 w-80 space-y-5">
          <p className="text-[10px] tracking-[0.3em] text-[#C8102E]" style={oswald}>Optimizing Video</p>
          <p className="text-sm text-[#0F1F33]">Compressing to 720p for faster playback…</p>
          <div>
            <div className="h-1.5 bg-[#DDE4ED] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#C8102E] rounded-full transition-all duration-300"
                style={{ width: `${compressPct}%` }}
              />
            </div>
            <p className="text-xs text-[#3D5166] mt-2 text-right">{compressPct}%</p>
          </div>
        </div>
      </div>
    )
  }

  // ── bulk modal ────────────────────────────────────────────────────────────
  if (bulkFiles) {
    return (
      <BulkUploadModal
        playerId={playerId}
        playerName={playerName}
        files={bulkFiles}
        onClose={() => { setBulkFiles(null); if (inputRef.current) inputRef.current.value = '' }}
      />
    )
  }

  // ── idle / uploading trigger ──────────────────────────────────────────────
  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (!files.length) return
          if (files.length > maxFiles) {
            setError(`Max ${maxFiles} videos at a time`)
            e.target.value = ''
            return
          }
          if (files.length > 1) {
            setBulkFiles(files)
          } else {
            handleFileSelected(files[0])
          }
          e.target.value = ''
        }}
      />
      {error && <p className="text-xs text-[#C8102E]">{error}</p>}
      <button
        onClick={() => phase === 'idle' && inputRef.current?.click()}
        disabled={phase === 'uploading'}
        className="text-[10px] sm:text-xs bg-[#1C3A5C] hover:bg-[#223F63] text-white px-2 sm:px-3 py-1 sm:py-1.5 rounded-md transition-colors whitespace-nowrap disabled:opacity-60 max-sm:min-h-11"
      >
        {phase === 'uploading' ? 'Uploading…' : 'Upload Clip'}
      </button>
    </div>
  )
}
