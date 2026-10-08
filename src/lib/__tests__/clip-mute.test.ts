/**
 * Clip mute: rate rule, recording rule, persistence, localStorage failure,
 * and the iOS unmute fallback. Source pins on every clip watcher.
 * Run with: npx tsx --test src/lib/__tests__/clip-mute.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CLIP_MUTED_KEY,
  VOICE_RECORDING_EVENT,
  applyClipAudio,
  effectiveMuted,
  initialClipMuted,
  playClip,
  readClipMuted,
  writeClipMuted,
} from '../clip-mute'
import {
  E2E_CLIP_A,
  E2E_CLIP_B,
  e2eClipFixtureEnabled,
  isE2eClipFixture,
  isE2eClipFixtureRequest,
} from '../e2e-clip-fixture'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

test('rate rule: any playbackRate other than 1 forces mute; 1x uses the saved choice', () => {
  assert.equal(effectiveMuted({ savedMuted: false, playbackRate: 1, recording: false }), false)
  assert.equal(effectiveMuted({ savedMuted: true, playbackRate: 1, recording: false }), true)
  for (const rate of [0.25, 0.5, 1.5, 2, 0]) {
    assert.equal(effectiveMuted({ savedMuted: false, playbackRate: rate, recording: false }), true, String(rate))
    assert.equal(effectiveMuted({ savedMuted: true, playbackRate: rate, recording: false }), true, String(rate))
  }
})

test('recording rule: a voice-note recording always mutes; stop / fail / cancel restore the saved choice', () => {
  assert.equal(effectiveMuted({ savedMuted: false, playbackRate: 1, recording: true }), true)
  assert.equal(effectiveMuted({ savedMuted: true, playbackRate: 1, recording: true }), true)
  assert.equal(effectiveMuted({ savedMuted: false, playbackRate: 1, recording: false }), false, 'stop restores unmuted')
  assert.equal(effectiveMuted({ savedMuted: true, playbackRate: 1, recording: false }), true, 'stop keeps saved mute')
  assert.equal(effectiveMuted({ savedMuted: false, playbackRate: 0.5, recording: false }), true, 'rate still wins after recording ends')
})

test('persistence: read/write rp.clipMuted', () => {
  const store: Record<string, string> = {}
  const storage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = v },
  }
  assert.equal(readClipMuted(storage), false)
  writeClipMuted(true, storage)
  assert.equal(store[CLIP_MUTED_KEY], '1')
  assert.equal(readClipMuted(storage), true)
  writeClipMuted(false, storage)
  assert.equal(store[CLIP_MUTED_KEY], '0')
  assert.equal(readClipMuted(storage), false)
  store[CLIP_MUTED_KEY] = 'true'
  assert.equal(readClipMuted(storage), true)
})

test('localStorage getItem / setItem throws (Safari private mode): default unmuted, write is a no-op', () => {
  const exploding = {
    getItem() { throw new Error('QuotaExceededError') },
    setItem() { throw new Error('QuotaExceededError') },
  }
  assert.equal(readClipMuted(exploding), false)
  writeClipMuted(true, exploding)
  assert.equal(readClipMuted(exploding), false)
})

test('applyClipAudio: mute never calls play(); unmute of a paused video does not call play()', async () => {
  const calls: string[] = []
  const media = {
    muted: false,
    paused: true,
    play() { calls.push('play'); return Promise.resolve() },
  }
  assert.equal(await applyClipAudio(media, true), 'muted')
  assert.equal(media.muted, true)
  assert.deepEqual(calls, [])
  media.paused = true
  assert.equal(await applyClipAudio(media, false), 'unmuted')
  assert.equal(media.muted, false)
  assert.deepEqual(calls, [])
})

test('applyClipAudio: refused unmuted play() falls back to muted play and reports muted', async () => {
  const calls: string[] = []
  const media = {
    muted: true,
    paused: false,
    play() {
      calls.push(this.muted ? 'play-muted' : 'play-unmuted')
      if (!this.muted) return Promise.reject(new DOMException('NotAllowedError', 'NotAllowedError'))
      return Promise.resolve()
    },
  }
  assert.equal(await applyClipAudio(media, false), 'muted')
  assert.equal(media.muted, true)
  assert.deepEqual(calls, ['play-unmuted', 'play-muted'])
})

test('playClip: refused unmuted play() falls back to muted play', async () => {
  const calls: string[] = []
  const media = {
    muted: false,
    paused: true,
    play() {
      calls.push(this.muted ? 'play-muted' : 'play-unmuted')
      if (!this.muted) return Promise.reject(new DOMException('NotAllowedError', 'NotAllowedError'))
      this.paused = false
      return Promise.resolve()
    },
  }
  assert.equal(await playClip(media, false), 'muted')
  assert.equal(media.muted, true)
  assert.equal(media.paused, false)
  assert.deepEqual(calls, ['play-unmuted', 'play-muted'])
})

test('applyClipAudio: successful unmuted play reports unmuted', async () => {
  const media = {
    muted: true,
    paused: false,
    play() { return Promise.resolve() },
  }
  assert.equal(await applyClipAudio(media, false), 'unmuted')
  assert.equal(media.muted, false)
})

test('video-player: mute button, rate sync, recording listener, playsInline, persistence', () => {
  const src = read('../../components/video-player.tsx')
  assert.match(src, /readClipMuted/)
  assert.match(src, /writeClipMuted/)
  assert.match(src, /effectiveMuted/)
  assert.match(src, /applyClipAudio/)
  assert.match(src, /playClip/)
  assert.match(src, /VOICE_RECORDING_EVENT/)
  assert.match(src, /<ClipMuteButton/)
  assert.match(src, /playsInline/)
  assert.match(src, /function changeSpeed/)
  assert.match(src, /function toggleMute/)
  assert.doesNotMatch(src, /if \(v\.paused\) \{[^\n]*v\.play\(\)/)
})

test('compare-player: same mute button, rate rule, persistence, playsInline', () => {
  const src = read('../../app/clips/compare/compare-player.tsx')
  assert.match(src, /readClipMuted/)
  assert.match(src, /writeClipMuted/)
  assert.match(src, /effectiveMuted/)
  assert.match(src, /applyClipAudio/)
  assert.match(src, /playClip/)
  assert.match(src, /<ClipMuteButton/)
  assert.match(src, /playsInline/)
  assert.match(src, /function changeSpeed/)
})

test('voice-note and timestamp-notes emit recording start/stop/fail/cancel', () => {
  const voice = read('../../app/clips/[id]/voice-note.tsx')
  const stamps = read('../../app/clips/[id]/timestamp-notes.tsx')
  for (const [name, src] of [['voice-note', voice], ['timestamp-notes', stamps]] as const) {
    assert.match(src, /emitVoiceRecording\(true\)/, `${name} starts`)
    assert.match(src, /emitVoiceRecording\(false\)/, `${name} restores`)
    assert.match(src, /VOICE_RECORDING_EVENT|emitVoiceRecording/, name)
  }
  assert.match(voice, /emitVoiceRecording\(false\)/)
  assert.ok((voice.match(/emitVoiceRecording\(false\)/g) ?? []).length >= 2, 'voice-note restores on stop and fail/unmount')
  assert.ok((stamps.match(/emitVoiceRecording\(false\)/g) ?? []).length >= 2, 'timestamp-notes restores on stop and fail/unmount')
})

test('e2e clip fixture is off unless PLAYWRIGHT_CLIP_FIXTURE=1', () => {
  const prev = process.env.PLAYWRIGHT_CLIP_FIXTURE
  delete process.env.PLAYWRIGHT_CLIP_FIXTURE
  assert.equal(e2eClipFixtureEnabled(), false)
  assert.equal(isE2eClipFixture(E2E_CLIP_A), false)
  assert.equal(isE2eClipFixtureRequest(`/clips/${E2E_CLIP_A}`), false)
  process.env.PLAYWRIGHT_CLIP_FIXTURE = '1'
  assert.equal(isE2eClipFixture(E2E_CLIP_A), true)
  assert.equal(isE2eClipFixture('not-a-fixture'), false)
  assert.equal(isE2eClipFixtureRequest(`/clips/${E2E_CLIP_A}`), true)
  assert.equal(isE2eClipFixtureRequest(`/clips/${E2E_CLIP_B}`), true)
  assert.equal(isE2eClipFixtureRequest('/clips/compare', new URLSearchParams(`a=${E2E_CLIP_A}&b=${E2E_CLIP_B}`)), true)
  assert.equal(isE2eClipFixtureRequest('/clips/compare', new URLSearchParams(`a=${E2E_CLIP_A}`)), false)
  assert.equal(isE2eClipFixtureRequest('/dashboard'), false)
  if (prev === undefined) delete process.env.PLAYWRIGHT_CLIP_FIXTURE
  else process.env.PLAYWRIGHT_CLIP_FIXTURE = prev

  const clipPage = read('../../app/clips/[id]/page.tsx')
  const comparePage = read('../../app/clips/compare/page.tsx')
  const middleware = read('../../middleware.ts')
  assert.match(clipPage, /isE2eClipFixture\(id\)/)
  assert.match(clipPage, /<E2eClipCoachPage/)
  assert.match(comparePage, /isE2eClipFixture\(a\) && isE2eClipFixture\(b\)/)
  assert.match(comparePage, /<E2eComparePage/)
  assert.match(middleware, /isE2eClipFixtureRequest/)
})

test('first paint: video starts muted so a saved muted choice cannot leak audio', () => {
  assert.equal(initialClipMuted(), true)
  const vp = read('../../components/video-player.tsx')
  const cp = read('../../app/clips/compare/compare-player.tsx')
  assert.match(vp, /useState\(initialClipMuted\)/)
  assert.match(cp, /useState\(initialClipMuted\)/)
  assert.match(vp, /muted=\{audioMuted\}/)
  assert.match(cp, /muted=\{audioMuted\}/)
  assert.doesNotMatch(vp, /const \[audioMuted,\s*setAudioMuted\]\s*=\s*useState\(false\)/)
  assert.doesNotMatch(cp, /const \[audioMuted,\s*setAudioMuted\]\s*=\s*useState\(false\)/)
})

test('clip mute button: speaker icon, aria-label, 44px tap target', () => {
  const src = read('../../components/clip-mute-button.tsx')
  assert.match(src, /aria-label=\{muted \? 'Unmute' : 'Mute'\}/)
  assert.match(src, /data-testid="clip-mute"/)
  assert.match(src, /minWidth: 44/)
  assert.match(src, /minHeight: 44/)
  assert.match(src, /<svg/)
  assert.equal(VOICE_RECORDING_EVENT, 'rp:voice-recording')
  assert.equal(CLIP_MUTED_KEY, 'rp.clipMuted')
})
