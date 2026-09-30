// Browser checks and messages for lesson recording (QA-004), and the recorded
// length (QA-005: MediaRecorder webm files report duration = Infinity, so the
// app stores the length it measured while recording).

export type RecordingEnv = {
  isSecureContext?: boolean
  hasGetUserMedia: boolean
  hasMediaRecorder: boolean
}

/** A message for the user if this browser can't record a lesson, else null. */
export function recordingSupportError(env: RecordingEnv): string | null {
  if (env.isSecureContext === false) return 'Recording needs a secure (https) connection. Open this page over https and try again.'
  if (!env.hasGetUserMedia) return 'This browser can\'t use the microphone. Try the latest Safari or Chrome.'
  if (!env.hasMediaRecorder) return 'Recording isn\'t supported in this browser. Update iOS/Safari, or try Chrome.'
  return null
}

/** Reads the current browser (safe to call on the server: reports unsupported). */
export function browserRecordingEnv(): RecordingEnv {
  if (typeof window === 'undefined') return { isSecureContext: false, hasGetUserMedia: false, hasMediaRecorder: false }
  return {
    isSecureContext: window.isSecureContext,
    hasGetUserMedia: typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function',
    hasMediaRecorder: typeof window.MediaRecorder === 'function',
  }
}

/** A clear message for a getUserMedia failure. */
export function micErrorMessage(err: unknown): string {
  const name = (err as { name?: string } | null)?.name ?? ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError')
    return 'Microphone access was blocked. Allow the microphone for this site in your browser settings, then try again.'
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError')
    return 'No microphone was found. Connect one and try again.'
  if (name === 'NotReadableError' || name === 'TrackStartError')
    return 'The microphone is busy in another app. Close it and try again.'
  return 'Couldn\'t start the microphone. Try again.'
}

/**
 * Recorded length in ms: the MediaRecorder start/stop event times when both
 * are known, else the recording timer (whole seconds). Never Infinity or NaN;
 * null only if nothing was measured.
 */
export function recordedDurationMs(startTs: number | null | undefined, stopTs: number | null | undefined, timerSecs = 0): number | null {
  if (startTs != null && stopTs != null && Number.isFinite(startTs) && Number.isFinite(stopTs) && startTs > 0 && stopTs >= startTs) {
    return Math.round(stopTs - startTs)
  }
  return timerSecs > 0 ? Math.round(timerSecs * 1000) : null
}

/** Total length to show and scrub: stored duration first, then a finite media duration. */
export function lessonTotalMs(storedMs: number | null | undefined, ...fallbacks: (number | null | undefined)[]): number | null {
  for (const v of [storedMs, ...fallbacks]) if (v != null && Number.isFinite(v) && v > 0) return Math.round(v)
  return null
}
