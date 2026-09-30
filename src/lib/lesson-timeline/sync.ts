// Keeps the ORIGINAL clip video in step with the lesson audio during replay.
// The audio clock (audio.currentTime) is the master; the video follows:
//  - small drift: nudge video.playbackRate by a few percent (no visible jump);
//  - large drift, or a seek/step in the lesson: hard seek, and if the seek is
//    slow (iPhone Safari), pause the audio until the video's "seeked" event or
//    a timeout, then resume;
//  - after a seek that didn't land (iOS may snap to ~1 s keyframes while
//    playing) it doesn't keep re-seeking; it nudges instead.
// All timing goes through injected clock/timer functions so tests can run it
// with a fake clock.
import { videoAt, type ReplayState } from './state'

export type SyncParams = {
  settleMs: number        // nudging stops once within this
  resyncMs: number        // start correcting beyond this (~100-150 ms)
  hardSeekMs: number      // beyond this, seek instead of nudging
  pausedTolMs: number     // paused video: seek if further off than this
  maxNudge: number        // max playbackRate change, as a fraction
  nudgeWindowMs: number   // aim to remove the drift over roughly this long
  seekCooldownMs: number  // after a seek, no re-seek for this long (nudge only)
  maxMissedSeeks: number  // seeks that didn't land before switching to nudge-only
}
export const DEFAULT_SYNC: SyncParams = {
  settleMs: 30, resyncMs: 120, hardSeekMs: 1000, pausedTolMs: 40,
  maxNudge: 0.1, nudgeWindowMs: 1500, seekCooldownMs: 1500, maxMissedSeeks: 2,
}

export type SyncInput = {
  driftMs: number          // video position - target (positive: video ahead)
  shouldPlay: boolean      // the video should be running now
  baseRate: number         // the coach's playback speed at this moment
  nudging: boolean         // a nudge is currently applied
  jumped: boolean          // the lesson seeked/stepped since the last check
  msSinceSeek: number
  missedSeeks: number
}
export type SyncDecision = { action: 'none' | 'nudge'; rate: number } | { action: 'seek' }

export function decideSync(i: SyncInput, p: SyncParams = DEFAULT_SYNC): SyncDecision {
  const abs = Math.abs(i.driftMs)
  if (!i.shouldPlay) {
    // Paused frame must match (frame steps); avoid re-seeking to the same spot.
    // A lesson step/seek must land exactly (a frame is ~33 ms); otherwise allow a little slack.
    const seek = i.jumped ? abs > 1 : abs > p.pausedTolMs && i.msSinceSeek >= p.seekCooldownMs
    return seek ? { action: 'seek' } : { action: 'none', rate: i.baseRate }
  }
  const canSeek = i.jumped || (i.msSinceSeek >= p.seekCooldownMs && i.missedSeeks < p.maxMissedSeeks)
  if ((i.jumped && abs > p.resyncMs) || (abs >= p.hardSeekMs && canSeek)) return { action: 'seek' }
  if (i.nudging ? abs <= p.settleMs : abs < p.resyncMs) return { action: 'none', rate: i.baseRate }
  const f = Math.max(-p.maxNudge, Math.min(p.maxNudge, i.driftMs / p.nudgeWindowMs))
  return { action: 'nudge', rate: i.baseRate * (1 - f) }
}

export interface MediaLike {
  currentTime: number
  readonly paused: boolean
  playbackRate: number
  play(): Promise<void> | void
  pause(): void
  addEventListener(type: string, fn: () => void): void
  removeEventListener(type: string, fn: () => void): void
}
export type Timers = {
  now(): number
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(h: unknown): void
}

/**
 * Seeks `video` to `sec` and resolves on its "seeked" event or after
 * `timeoutMs` (resolves 'timeout'), whichever comes first.
 */
export function seekAndWait(video: MediaLike, sec: number, timers: Timers, timeoutMs = 1500): Promise<'seeked' | 'timeout'> {
  return new Promise(resolve => {
    let done = false
    const finish = (r: 'seeked' | 'timeout') => {
      if (done) return
      done = true
      video.removeEventListener('seeked', onSeeked)
      timers.clearTimeout(h)
      resolve(r)
    }
    const onSeeked = () => finish('seeked')
    video.addEventListener('seeked', onSeeked)
    const h = timers.setTimeout(() => finish('timeout'), timeoutMs)
    video.currentTime = sec
  })
}

type Cursor = { at(t: number): ReplayState }

export class ReplaySync {
  private nudging = false
  private lastJump = 0
  private lastSeekAt = -Infinity
  private missed = 0
  private seeking: Promise<void> | null = null
  private pendingTarget: number | null = null
  private pausedAudioForSeek = false
  /** User pressed play (lesson running). */
  private wantPlay = false
  seeks = 0
  nudges = 0
  audioHolds = 0

  constructor(
    private readonly audio: MediaLike,
    private readonly video: MediaLike,
    private readonly cursor: Cursor,
    private readonly timers: Timers,
    private readonly clipDurMs: number | null = null,
    readonly params: SyncParams = DEFAULT_SYNC,
    /** Wait this long for a seek before holding the audio (quick seeks don't interrupt the voice). */
    readonly holdAfterMs = 120,
    readonly seekTimeoutMs = 1500,
  ) {}

  get busy() { return this.seeking !== null }
  lessonMs() { return this.audio.currentTime * 1000 }

  /** Start from a user gesture: audio.play() is called synchronously (iOS). */
  play() {
    this.wantPlay = true
    const p = this.audio.play()
    this.tick()
    return p
  }
  pause() {
    this.wantPlay = false
    this.pausedAudioForSeek = false
    this.audio.pause()
    this.video.pause()
  }
  get playing() { return this.wantPlay }

  /** Jump the lesson to t (ms): audio moves, the video follows at the next tick. */
  scrubTo(tMs: number) {
    this.audio.currentTime = Math.max(0, tMs) / 1000
    this.lastJump = -1   // force a jump check
    this.tick()
  }

  /** Call every ~250 ms and on audio "seeked"/"play"/"pause". Returns the state used. */
  tick(): ReplayState {
    const t = this.lessonMs()
    const s = this.cursor.at(t)
    const target = videoAt(s, t, this.clipDurMs)
    if (this.seeking) {
      // A newer lesson seek while one is in flight: go there next (coalesced).
      if (s.jump !== this.lastJump) { this.lastJump = s.jump; this.pendingTarget = target }
      return s
    }
    const running = this.wantPlay && !this.audio.paused
    const shouldPlay = running && s.playing
    const jumped = s.jump !== this.lastJump
    this.lastJump = s.jump
    const drift = this.video.currentTime * 1000 - target
    const d = decideSync({
      driftMs: drift, shouldPlay, baseRate: s.rate, nudging: this.nudging, jumped,
      msSinceSeek: this.timers.now() - this.lastSeekAt, missedSeeks: this.missed,
    }, this.params)
    if (d.action === 'seek') {
      void this.seekVideo(target, shouldPlay)
      return s
    }
    if (Math.abs(drift) < this.params.resyncMs) this.missed = 0
    this.nudging = d.action === 'nudge'
    if (d.action === 'nudge') this.nudges++
    if (Math.abs(this.video.playbackRate - d.rate) > 1e-3) this.video.playbackRate = d.rate
    if (shouldPlay && this.video.paused) void this.video.play()
    if (!shouldPlay && !this.video.paused) this.video.pause()
    return s
  }

  private seekVideo(targetMs: number, resumeVideo: boolean): Promise<void> {
    this.pendingTarget = targetMs
    if (this.seeking) return this.seeking
    this.seeks++
    this.nudging = false
    this.video.playbackRate = this.cursor.at(this.lessonMs()).rate
    const run = async () => {
      while (this.pendingTarget != null) {
        const target = this.pendingTarget
        this.pendingTarget = null
        // Hold the audio only if the seek is slow.
        const hold = this.timers.setTimeout(() => {
          if (this.wantPlay && !this.audio.paused) { this.pausedAudioForSeek = true; this.audioHolds++; this.audio.pause() }
        }, this.holdAfterMs)
        await seekAndWait(this.video, target / 1000, this.timers, this.seekTimeoutMs)
        this.timers.clearTimeout(hold)
        this.lastSeekAt = this.timers.now()
        // While the audio kept running the target moved; judge the landing against the new target.
        const s = this.cursor.at(this.lessonMs())
        const off = Math.abs(this.video.currentTime * 1000 - videoAt(s, this.lessonMs(), this.clipDurMs))
        this.missed = off > this.params.resyncMs ? this.missed + 1 : 0
      }
      this.seeking = null
      if (this.pausedAudioForSeek) {
        this.pausedAudioForSeek = false
        if (this.wantPlay) await this.audio.play()
      }
      if (resumeVideo && this.wantPlay && this.video.paused) await this.video.play()
      this.tick()
    }
    this.seeking = run()
    return this.seeking
  }
}
