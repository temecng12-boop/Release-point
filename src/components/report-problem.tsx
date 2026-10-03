'use client'

// "Report a problem": a small button in the sticky app header (so it never
// sits over the video controls on clip pages) that opens a form. Sends the
// text report even if the screenshot upload fails. See src/lib/feedback/.
//
// Sizing: globals.css has unlayered `button, a { min-height: 36px }` and
// `header a, header button, header span { min-height: unset }`, which beat
// Tailwind's layered min-h-* utilities. So every tap target here uses the
// important variants (!min-h-11 / !min-h-12), and the dialog is portaled to
// document.body so it isn't styled as part of the header.
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { submitFeedbackReport } from '@/app/actions/feedback'
import { captureFromWindow } from '@/lib/feedback/capture'
import { feedbackErrorMessage, screenshotFailureNote } from '@/lib/feedback/errors'
import {
  FEEDBACK_BUCKET, FEEDBACK_MESSAGE_MAX, SCREENSHOT_ACCEPT,
  cooldownLeftMs, screenshotPath, validateMessage, validateScreenshot,
} from '@/lib/feedback/validate'

const RED = '#C8031E'          // --rp-red (tokens.css)
const RED_HOVER = '#A30219'    // --rp-red-hover
const LAST_SENT_KEY = 'rp-feedback-last-sent'
const oswald = { fontFamily: 'var(--font-oswald, Oswald, sans-serif)', textTransform: 'uppercase' as const }

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

// false on the server and during hydration, true in the browser afterwards,
// so the portal target (document.body) is only touched on the client.
const noopSubscribe = () => () => {}
function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false)
}

type Status = { tone: 'ok' | 'warn' | 'error'; text: string } | null
type Uploaded = { file: File; path: string; mime: string; bytes: number }

export default function ReportProblemButton() {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const isClient = useIsClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const ids = useId()
  const [message, setMessage] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>(null)
  const [sending, setSending] = useState(false)
  // One id per report: the screenshot is stored under it, and a retry after a
  // failed send reuses the already uploaded screenshot.
  const reportIdRef = useRef<string | null>(null)
  const uploadedRef = useRef<Uploaded | null>(null)

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    // Native modal <dialog>: showModal() makes the rest of the page inert
    // (focus stays inside) and Esc closes it. On close, focus goes back to
    // the header button explicitly, since the dialog lives under <body>.
    const onClose = () => {
      if (status?.tone === 'ok') setStatus(null)
      triggerRef.current?.focus()
    }
    d.addEventListener('close', onClose)
    return () => d.removeEventListener('close', onClose)
  }, [status, isClient])

  function open() {
    setStatus(s => (s?.tone === 'ok' ? null : s))
    dialogRef.current?.showModal()
  }

  function onFile(f: File | null) {
    setFileError(null)
    if (!f) { setFile(null); return }
    const v = validateScreenshot(f)
    if (!v.ok) { setFile(null); setFileError(v.error); if (fileRef.current) fileRef.current.value = ''; return }
    setFile(f)
  }

  function clearFile() {
    setFile(null); setFileError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (sending) return
    const m = validateMessage(message)
    if (!m.ok) { setStatus({ tone: 'error', text: m.error }); return }
    let last: number | null = null
    try { last = Number(localStorage.getItem(LAST_SENT_KEY)) || null } catch { /* private mode */ }
    const wait = cooldownLeftMs(last, Date.now())
    if (wait > 0) { setStatus({ tone: 'warn', text: `Thanks, we just got your last report. You can send another in ${Math.ceil(wait / 1000)} seconds.` }); return }

    setSending(true)
    setStatus(null)
    const id = reportIdRef.current ?? (reportIdRef.current = newId())
    let screenshot: { path: string; mime: string; bytes: number } | null = null
    let shotNote: string | null = null
    try {
      if (file) {
        const v = validateScreenshot(file)
        if (!v.ok) shotNote = v.error
        else if (uploadedRef.current?.file === file) {
          const u = uploadedRef.current
          screenshot = { path: u.path, mime: u.mime, bytes: u.bytes }
        } else {
          const supabase = createClient()
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) {
            setStatus({ tone: 'error', text: feedbackErrorMessage('signed_out') }); return
          }
          const path = screenshotPath(user.id, id, v.value.ext)
          const { error } = await supabase.storage.from(FEEDBACK_BUCKET).upload(path, file, { contentType: v.value.mime, upsert: false })
          if (error) {
            console.warn('[feedback] screenshot upload failed', error)
            shotNote = screenshotFailureNote(error as { message?: string; statusCode?: string })
          } else {
            uploadedRef.current = { file, path, mime: v.value.mime, bytes: v.value.bytes }
            screenshot = { path, mime: v.value.mime, bytes: v.value.bytes }
          }
        }
      }
      const res = await submitFeedbackReport({
        id, message: m.value, context: captureFromWindow(window), screenshot, screenshotFailed: !!file && !screenshot,
      })
      if (!res.ok) { setStatus({ tone: 'error', text: res.error }); return }
      try { localStorage.setItem(LAST_SENT_KEY, String(Date.now())) } catch { /* private mode */ }
      reportIdRef.current = null
      uploadedRef.current = null
      setMessage('')
      clearFile()
      setStatus(res.screenshot === 'failed'
        ? { tone: 'warn', text: `Thanks, your report was sent, but the screenshot didn't attach (${shotNote ?? 'the upload failed'}).` }
        : { tone: 'ok', text: 'Thanks, your report was sent. We’ll look into it.' })
    } catch (err) {
      console.error('[feedback] send failed', err)
      setStatus({ tone: 'error', text: feedbackErrorMessage('network') })
    } finally {
      setSending(false)
    }
  }

  const left = FEEDBACK_MESSAGE_MAX - message.length
  const focus = "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#023167]"

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        className={`inline-flex items-center justify-center gap-1.5 !min-h-11 !min-w-11 sm:!min-w-0 px-2 rounded-md text-xs transition-colors hover:bg-[#FDEEF0] ${focus}`}
        style={{ ...oswald, color: RED }}
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 22V4a1 1 0 0 1 1-1h11l-1.5 4L16 11H5" />
        </svg>
        <span className="sr-only sm:not-sr-only">Report a problem</span>
      </button>

      {isClient && createPortal(
      <dialog
        ref={dialogRef}
        aria-labelledby={`${ids}-title`}
        className="m-0 mt-auto sm:m-auto w-full max-w-none sm:max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white p-0 text-[#020618] shadow-2xl backdrop:bg-[#020618]/50"
      >
        <form onSubmit={onSubmit} noValidate className="px-5 pt-5 sm:px-6" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
          <div className="flex items-start justify-between gap-4">
            <h2 id={`${ids}-title`} className="text-lg tracking-wide" style={oswald}>Report a problem</h2>
            <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close" className={`-mr-2 -mt-1 !min-h-11 !min-w-11 rounded-md text-2xl leading-none text-[#45556C] hover:text-[#020618] ${focus}`}>×</button>
          </div>

          <label htmlFor={`${ids}-msg`} className="mt-3 block text-sm font-semibold">What happened? <span className="font-normal text-[#45556C]">(required)</span></label>
          <textarea
            id={`${ids}-msg`}
            required
            aria-required="true"
            maxLength={FEEDBACK_MESSAGE_MAX}
            rows={5}
            value={message}
            onChange={e => setMessage(e.target.value)}
            aria-describedby={`${ids}-msg-help`}
            placeholder="What were you doing, and what went wrong?"
            className={`mt-1 block w-full rounded-[10px] border border-[#7C8DA6] p-3 text-base ${focus}`}
          />
          <p id={`${ids}-msg-help`} className="mt-1 text-sm text-[#45556C]">{left.toLocaleString('en-US')} characters left</p>

          <label htmlFor={`${ids}-file`} className="mt-4 block text-sm font-semibold">Screenshot <span className="font-normal text-[#45556C]">(optional, PNG, JPEG, WebP or HEIC, up to 10 MB)</span></label>
          <input
            ref={fileRef}
            id={`${ids}-file`}
            type="file"
            accept={SCREENSHOT_ACCEPT}
            onChange={e => onFile(e.target.files?.[0] ?? null)}
            aria-describedby={fileError ? `${ids}-file-err` : undefined}
            className="mt-1 block w-full text-sm file:mr-3 file:min-h-11 file:rounded-md file:border-0 file:bg-[#EEF3FA] file:px-3 file:text-[#023167]"
          />
          {file && (
            <p className="mt-1 flex items-center gap-2 text-sm text-[#314158]">
              <span className="truncate">{file.name}</span>
              <button type="button" onClick={clearFile} className={`!min-h-11 px-2 underline ${focus}`}>Remove</button>
            </p>
          )}
          {fileError && <p id={`${ids}-file-err`} role="alert" className="mt-1 text-sm" style={{ color: RED }}>{fileError}</p>}

          <p className="mt-4 text-sm text-[#45556C]">We’ll include this page’s address, your device, browser and screen size, the app version and your account, to help us find the problem.</p>

          <div aria-live="polite" className="min-h-0">
            {status && (
              <p role={status.tone === 'error' ? 'alert' : 'status'} className="mt-3 rounded-md px-3 py-2 text-sm"
                style={status.tone === 'ok' ? { background: '#ECFDF5', color: '#047857' } : status.tone === 'warn' ? { background: '#FFF7ED', color: '#9A3412' } : { background: '#FDEEF0', color: RED }}>
                {status.text}
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => dialogRef.current?.close()} className={`!min-h-12 rounded-[10px] px-4 text-[15px] tracking-wider text-[#023167] hover:bg-[#EEF3FA] ${focus}`} style={oswald}>Close</button>
            <button
              type="submit"
              disabled={sending}
              className={`!min-h-12 rounded-[10px] px-5 text-[15px] tracking-wider text-white disabled:opacity-60 ${focus}`}
              style={{ ...oswald, background: RED }}
              onMouseEnter={e => { e.currentTarget.style.background = RED_HOVER }}
              onMouseLeave={e => { e.currentTarget.style.background = RED }}
            >
              {sending ? 'Sending…' : 'Send report'}
            </button>
          </div>
        </form>
      </dialog>,
      document.body,
      )}
    </>
  )
}
