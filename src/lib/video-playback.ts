/**
 * Play/pause intent for a media element. Using the element's `paused` flag
 * alone is not enough: after play() is called, `paused` can stay true until
 * the play promise settles, so a second click can call play() again instead
 * of pause(). Track what the user asked for and prefer pausing whenever we
 * already wanted to play or the element is actually playing.
 */
export type PlaybackIntent = { wantPlaying: boolean }

export function nextPlaybackAction(
  intent: PlaybackIntent,
  videoPaused: boolean,
): 'play' | 'pause' {
  if (intent.wantPlaying || !videoPaused) {
    intent.wantPlaying = false
    return 'pause'
  }
  intent.wantPlaying = true
  return 'play'
}

/** Apply play or pause on a media element; play() rejections clear the intent. */
export function applyPlaybackAction(
  media: { paused: boolean; play: () => void | Promise<void>; pause: () => void },
  intent: PlaybackIntent,
  action: 'play' | 'pause',
  onPlayReject?: () => void,
): void {
  if (action === 'pause') {
    media.pause()
    return
  }
  try {
    const p = media.play()
    if (p !== undefined && typeof (p as Promise<void>).then === 'function') {
      ;(p as Promise<void>).catch(() => {
        intent.wantPlaying = false
        onPlayReject?.()
      })
    }
  } catch {
    intent.wantPlaying = false
    onPlayReject?.()
  }
}
