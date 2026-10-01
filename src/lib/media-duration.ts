// Lesson playback length (QA-005). MediaRecorder webm files often have no
// duration in their header, so Chrome reports `duration = Infinity` until the
// file is read to the end; before metadata loads it is NaN. Safari's mp4
// recordings usually report a finite duration straight away. These helpers
// never let Infinity, NaN, 0 or a negative value reach the screen.

/** A usable duration in seconds, or null for Infinity, NaN, 0, negatives and non-numbers. */
export function finiteDuration(seconds: unknown): number | null {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

/** "m:ss" (e.g. "0:09", "1:05", "12:30") for a usable duration, else "--:--". */
export function formatClock(seconds: unknown): string {
  const d = finiteDuration(seconds)
  if (d == null) return '--:--'
  const s = Math.max(1, Math.round(d))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Seconds as "1.25s" for the clip player's readout; "--" for Infinity, NaN, negatives and non-numbers (QA-007). */
export function formatSeconds(seconds: unknown): string {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0 ? `${seconds.toFixed(2)}s` : '--'
}

/** Length to show: the time measured while recording first, then the media's own duration. */
export function lessonLengthSeconds(recordedSeconds: unknown, mediaSeconds: unknown): number | null {
  return finiteDuration(recordedSeconds) ?? finiteDuration(mediaSeconds)
}

/** The parts of HTMLMediaElement used here (so tests can pass a stand-in). */
export type MediaLike = {
  duration: number
  currentTime: number
  addEventListener(type: string, fn: () => void): void
  removeEventListener(type: string, fn: () => void): void
}

const FAR_PAST_END = 1e101

/**
 * Reports the element's usable duration through `onDuration`: now, and again
 * on every later `loadedmetadata` / `durationchange` (null while unknown).
 * The first time the duration is Infinity, it seeks far past the end, which
 * makes Chrome and Safari work out the real length, then goes back to where
 * playback was. If no usable duration arrives within `timeoutMs`, it goes back
 * anyway (and keeps reporting null). Returns a cleanup function.
 */
export function watchMediaDuration(
  el: MediaLike,
  onDuration: (seconds: number | null) => void,
  { timeoutMs = 5000, setTimer = setTimeout, clearTimer = clearTimeout }: {
    timeoutMs?: number
    setTimer?: (fn: () => void, ms: number) => unknown
    clearTimer?: (id: never) => void
  } = {},
): () => void {
  let tried = false
  let seeking = false
  let restoreTo = 0
  let timer: unknown = null

  const endSeek = () => {
    if (!seeking) return
    seeking = false
    el.removeEventListener('timeupdate', check)
    if (timer != null) { clearTimer(timer as never); timer = null }
    try { el.currentTime = restoreTo } catch { /* element gone */ }
  }

  function check() {
    const d = finiteDuration(el.duration)
    if (d != null) { endSeek(); onDuration(d); return }
    onDuration(null)
    if (el.duration === Infinity && !tried) {
      tried = true
      seeking = true
      restoreTo = Number.isFinite(el.currentTime) && el.currentTime >= 0 ? el.currentTime : 0
      el.addEventListener('timeupdate', check)
      timer = setTimer(() => { timer = null; endSeek() }, timeoutMs)
      try { el.currentTime = FAR_PAST_END } catch { endSeek() }
    }
  }

  el.addEventListener('loadedmetadata', check)
  el.addEventListener('durationchange', check)
  check()

  return () => {
    el.removeEventListener('loadedmetadata', check)
    el.removeEventListener('durationchange', check)
    el.removeEventListener('timeupdate', check)
    if (timer != null) { clearTimer(timer as never); timer = null }
    seeking = false
  }
}
