/**
 * Clip play/pause must toggle on every click, including a second click while
 * play() is still settling (paused can still be true). Run with:
 *   npx tsx --test src/lib/__tests__/video-playback.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyPlaybackAction, nextPlaybackAction, type PlaybackIntent } from '../video-playback'
import { readFileSync } from 'node:fs'

test('first click plays, second click pauses even while the element still reports paused (play promise pending)', () => {
  const intent: PlaybackIntent = { wantPlaying: false }
  // Click 1: idle → play. Browser has not flipped paused yet.
  assert.equal(nextPlaybackAction(intent, true), 'play')
  assert.equal(intent.wantPlaying, true)
  // Click 2: still paused===true (promise pending), but we already wanted play → pause.
  assert.equal(nextPlaybackAction(intent, true), 'pause')
  assert.equal(intent.wantPlaying, false)
})

test('after the element is actually playing, the next click pauses', () => {
  const intent: PlaybackIntent = { wantPlaying: true }
  assert.equal(nextPlaybackAction(intent, false), 'pause')
  assert.equal(intent.wantPlaying, false)
})

test('a third click plays again', () => {
  const intent: PlaybackIntent = { wantPlaying: false }
  assert.equal(nextPlaybackAction(intent, true), 'play')
  assert.equal(nextPlaybackAction(intent, false), 'pause')
  assert.equal(nextPlaybackAction(intent, true), 'play')
  assert.equal(intent.wantPlaying, true)
})

test('if intent says idle but the element is playing (desync), the next click still pauses', () => {
  const intent: PlaybackIntent = { wantPlaying: false }
  assert.equal(nextPlaybackAction(intent, false), 'pause')
  assert.equal(intent.wantPlaying, false)
})

test('applyPlaybackAction: pause calls media.pause(); play calls media.play() and clears intent on reject', async () => {
  const calls: string[] = []
  const intent: PlaybackIntent = { wantPlaying: true }
  const media = {
    paused: false,
    play: () => { calls.push('play'); return Promise.reject(new DOMException('interrupted', 'AbortError')) },
    pause: () => { calls.push('pause') },
  }
  applyPlaybackAction(media, intent, 'pause')
  assert.deepEqual(calls, ['pause'])
  let rejected = false
  applyPlaybackAction(media, intent, 'play', () => { rejected = true })
  await new Promise((r) => setTimeout(r, 0))
  assert.deepEqual(calls, ['pause', 'play'])
  assert.equal(intent.wantPlaying, false)
  assert.equal(rejected, true)
})

test('video-player: Play button toggles via nextPlaybackAction / applyPlaybackAction (not a bare play())', () => {
  const src = readFileSync(new URL('../../components/video-player.tsx', import.meta.url), 'utf8')
  assert.match(src, /nextPlaybackAction/)
  assert.match(src, /applyPlaybackAction/)
  assert.match(src, /wantPlayingRef/)
  // The old race-prone pattern must not return.
  assert.doesNotMatch(src, /if \(v\.paused\) \{[^\n]*v\.play\(\)/)
  const btnStart = src.indexOf('data-testid="clip-play-pause"')
  assert.ok(btnStart > 0, 'play/pause button has a test id')
  const btn = src.slice(btnStart - 80, btnStart + 280)
  assert.match(btn, /type="button"/)
  assert.match(btn, /onClick=\{togglePlay\}/)
  assert.match(btn, /aria-label=\{playing \? 'Pause' : 'Play'\}/)
})
