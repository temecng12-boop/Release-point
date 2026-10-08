/**
 * Clip audio mute rules for the film-room player.
 *
 * - The user's choice is stored in localStorage (`rp.clipMuted`).
 * - playbackRate other than 1x always mutes; 1x restores the saved choice.
 * - A voice-note (or lesson) recording always mutes; stop / fail / cancel restores.
 * - Unmute is attempted only from a user gesture. If the browser refuses
 *   unmuted play(), fall back to muted play and report 'muted' so the UI
 *   never shows unmuted while the element is muted.
 */
export const CLIP_MUTED_KEY = 'rp.clipMuted'
export const VOICE_RECORDING_EVENT = 'rp:voice-recording'

export type ClipMuteStorage = {
  getItem?: (key: string) => string | null
  setItem?: (key: string, value: string) => void
}

export type ClipAudioMedia = {
  muted: boolean
  paused: boolean
  play: () => void | Promise<void>
}

export function effectiveMuted(s: {
  savedMuted: boolean
  playbackRate: number
  recording: boolean
}): boolean {
  return s.savedMuted || s.playbackRate !== 1 || s.recording
}

function storageOrThrow(storage?: ClipMuteStorage): ClipMuteStorage | undefined {
  if (storage) return storage
  return globalThis.localStorage
}

export function readClipMuted(storage?: ClipMuteStorage): boolean {
  try {
    const raw = storageOrThrow(storage)?.getItem?.(CLIP_MUTED_KEY)
    return raw === '1' || raw === 'true'
  } catch {
    return false
  }
}

/**
 * First-paint <video muted>. Always muted so a saved 'muted' choice cannot
 * leak audio before localStorage is read, and so SSR matches the first
 * client render (reading localStorage in useState would hydrate mismatch).
 * After mount, readClipMuted() + syncAudio() apply the saved choice.
 */
export function initialClipMuted(): boolean {
  return true
}

export function writeClipMuted(muted: boolean, storage?: ClipMuteStorage): void {
  try {
    storageOrThrow(storage)?.setItem?.(CLIP_MUTED_KEY, muted ? '1' : '0')
  } catch {
    // Safari private mode can throw on setItem.
  }
}

/** Dispatch the cross-component "voice note is recording" signal. */
export function emitVoiceRecording(recording: boolean): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(VOICE_RECORDING_EVENT, { detail: { recording } }))
}

/**
 * Apply mute/unmute on a media element. Unmute of a playing video re-calls
 * play() (iOS); a refusal falls back to muted play so playback is not lost.
 */
export async function applyClipAudio(
  media: ClipAudioMedia,
  wantMuted: boolean,
): Promise<'muted' | 'unmuted'> {
  if (wantMuted) {
    media.muted = true
    return 'muted'
  }
  media.muted = false
  if (media.paused) return media.muted ? 'muted' : 'unmuted'
  try {
    const p = media.play()
    if (p !== undefined && typeof (p as Promise<void>).then === 'function') await p
    return media.muted ? 'muted' : 'unmuted'
  } catch {
    media.muted = true
    try {
      const p = media.play()
      if (p !== undefined && typeof (p as Promise<void>).then === 'function') await p
    } catch {
      // Stay muted. The UI must not claim unmuted.
    }
    return 'muted'
  }
}

/** Play after applying mute. Unmuted play() refusal → muted play, report muted. */
export async function playClip(
  media: ClipAudioMedia,
  wantMuted: boolean,
): Promise<'muted' | 'unmuted'> {
  const audio = await applyClipAudio(media, wantMuted)
  if (!media.paused) return audio
  try {
    const p = media.play()
    if (p !== undefined && typeof (p as Promise<void>).then === 'function') await p
    return media.muted ? 'muted' : 'unmuted'
  } catch {
    media.muted = true
    try {
      const p = media.play()
      if (p !== undefined && typeof (p as Promise<void>).then === 'function') await p
    } catch {
      // Stay muted. Caller treats a still-paused element as a failed play.
    }
    return 'muted'
  }
}
