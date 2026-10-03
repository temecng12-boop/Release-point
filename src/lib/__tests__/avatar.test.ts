/**
 * Avatar paths: parsing stored avatar_url values (paths and legacy URLs) and signing short-lived URLs.
 * Run with: npx tsx --test src/lib/__tests__/avatar.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readAvatarRef, signAvatarUrl, avatarPathFor, AVATAR_URL_TTL_SECONDS, type AvatarStorage } from '../avatar'

const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const SB = 'https://zebjt.supabase.co/storage/v1/object'

test('readAvatarRef: stored paths', () => {
  assert.deepEqual(readAvatarRef(`avatars/${ME}.jpg`, ME), { bucket: 'clips', path: `avatars/${ME}.jpg` })
  assert.deepEqual(readAvatarRef(` /avatars/${ME}.PNG `, ME), { bucket: 'clips', path: `avatars/${ME}.PNG` })
  assert.deepEqual(readAvatarRef(`avatars/${ME.toUpperCase()}.webp`, ME), { bucket: 'clips', path: `avatars/${ME.toUpperCase()}.webp` })
  for (const v of [null, undefined, '', '   ']) assert.equal(readAvatarRef(v, ME), null)
})

test('readAvatarRef: legacy signed and public URLs parse to the path', () => {
  assert.deepEqual(readAvatarRef(`${SB}/sign/clips/avatars/${ME}.jpg?token=eyJhbGciOi.x.y`, ME), { bucket: 'clips', path: `avatars/${ME}.jpg` })
  assert.deepEqual(readAvatarRef(`${SB}/public/profiles/avatars/${ME}.png`, ME), { bucket: 'profiles', path: `avatars/${ME}.png` })
  assert.deepEqual(readAvatarRef(`${SB}/sign/profiles/avatars/${ME}.jpg?token=t&t=123`, ME), { bucket: 'profiles', path: `avatars/${ME}.jpg` })
  assert.deepEqual(readAvatarRef(`${SB}/authenticated/clips/avatars%2F${ME}.jpg`, ME), { bucket: 'clips', path: `avatars/${ME}.jpg` })
  // the old client-side cache-buster (`?token=...?t=...`) still parses: only the pathname matters
  assert.deepEqual(readAvatarRef(`${SB}/sign/clips/avatars/${ME}.jpg?token=abc?t=1700000000000`, ME), { bucket: 'clips', path: `avatars/${ME}.jpg` })
})

test('readAvatarRef: anything else falls back to null (initials)', () => {
  for (const v of [
    `avatars/${OTHER}.jpg`,                                   // someone else's photo
    `${SB}/sign/clips/avatars/${OTHER}.jpg?token=t`,           // someone else's photo, as URL
    `${SB}/sign/clips/${ME}/clip.mp4?token=t`,                 // a clip, not an avatar
    `${SB}/public/lessons/avatars/${ME}.jpg`,                  // wrong bucket
    `${SB}/sign/clips/avatars/${ME}.jpg/../x?token=t`,         // traversal-ish
    `avatars/${ME}.jpg.exe`, `avatars/${ME}`, `avatars/../${ME}.jpg`, `clips/avatars/${ME}.jpg`,
    'https://lh3.googleusercontent.com/a/abc', 'https://example.com/storage/v1/object/sign/', 'not a url at all',
    `javascript:alert(1)//avatars/${ME}.jpg`, `data:image/png;base64,AAAA`, 'https://%zz', `${SB}/sign/clips/avatars%E0%A4%A/x`,
  ]) assert.equal(readAvatarRef(v, ME), null, v)
  assert.equal(readAvatarRef(`avatars/${ME}.jpg`, ''), null)
})

test('avatarPathFor: user id + image type -> avatars/<id>.<ext>', () => {
  assert.equal(avatarPathFor(ME, 'avatar.jpg', 'image/jpeg'), `avatars/${ME}.jpg`)
  assert.equal(avatarPathFor(ME, 'me.JPEG', 'image/jpeg'), `avatars/${ME}.jpg`)
  assert.equal(avatarPathFor(ME, 'me.png', 'image/png'), `avatars/${ME}.png`)
  assert.equal(avatarPathFor(ME, 'blob', 'image/webp'), `avatars/${ME}.webp`)
  assert.equal(avatarPathFor(ME, 'x.svg', 'image/svg+xml'), `avatars/${ME}.jpg`)
  assert.equal(avatarPathFor(ME, 'x.pdf', 'application/pdf'), null)
  assert.equal(avatarPathFor('../etc', 'a.jpg', 'image/jpeg'), null)
  // every generated path is accepted by the reader
  assert.deepEqual(readAvatarRef(avatarPathFor(ME, 'a.gif', 'image/gif'), ME), { bucket: 'clips', path: `avatars/${ME}.gif` })
})

function fakeStorage(behaviour: 'ok' | 'error' | 'throw' | 'empty' = 'ok') {
  const calls: { bucket: string; path: string; expiresIn: number }[] = []
  const storage: AvatarStorage = {
    from: (bucket: string) => ({
      async createSignedUrl(path: string, expiresIn: number) {
        calls.push({ bucket, path, expiresIn })
        if (behaviour === 'throw') throw new Error('network')
        if (behaviour === 'error') return { data: null, error: { message: 'Object not found' } }
        if (behaviour === 'empty') return { data: { signedUrl: '' }, error: null }
        return { data: { signedUrl: `https://signed.test/${bucket}/${path}?token=s` }, error: null }
      },
    }),
  }
  return { storage, calls }
}

test('signAvatarUrl: signs the parsed object for 1 hour, in the bucket it lives in', async () => {
  assert.equal(AVATAR_URL_TTL_SECONDS, 3600)
  const a = fakeStorage()
  assert.equal(await signAvatarUrl(a.storage, `avatars/${ME}.jpg`, ME), `https://signed.test/clips/avatars/${ME}.jpg?token=s`)
  assert.equal(await signAvatarUrl(a.storage, `${SB}/public/profiles/avatars/${ME}.png`, ME), `https://signed.test/profiles/avatars/${ME}.png?token=s`)
  assert.deepEqual(a.calls, [{ bucket: 'clips', path: `avatars/${ME}.jpg`, expiresIn: 3600 }, { bucket: 'profiles', path: `avatars/${ME}.png`, expiresIn: 3600 }])
})

test('signAvatarUrl: no photo, unreadable or foreign value -> null without calling storage', async () => {
  const a = fakeStorage()
  for (const v of [null, '', 'https://example.com/a.jpg', `avatars/${OTHER}.jpg`]) assert.equal(await signAvatarUrl(a.storage, v, ME), null)
  assert.deepEqual(a.calls, [])
})

test('signAvatarUrl: missing file, storage error, empty URL or a throw -> null (initials), never throws', async () => {
  for (const b of ['error', 'throw', 'empty'] as const) assert.equal(await signAvatarUrl(fakeStorage(b).storage, `avatars/${ME}.jpg`, ME), null, b)
})

import { planAvatarMove } from '../avatar-move'

test('planAvatarMove: copy profiles-bucket photos, rewrite old clips URLs, leave the rest, list unreferenced files', () => {
  const C = '33333333-3333-4333-8333-333333333333', D = '44444444-4444-4444-8444-444444444444'
  const plan = planAvatarMove([
    { id: ME, avatar_url: `${SB}/public/profiles/avatars/${ME}.png` },
    { id: OTHER, avatar_url: `${SB}/sign/clips/avatars/${OTHER}.jpg?token=t` },
    { id: C, avatar_url: `avatars/${C}.jpg` },
    { id: D, avatar_url: 'https://example.com/me.jpg' },
    { id: '55555555-5555-4555-8555-555555555555', avatar_url: null },
  ], [`avatars/${ME}.png`, `avatars/${D}.jpg`])
  assert.deepEqual(plan.steps, [
    { kind: 'copy', userId: ME, from: { bucket: 'profiles', path: `avatars/${ME}.png` }, to: { bucket: 'clips', path: `avatars/${ME}.png` }, newValue: `avatars/${ME}.png` },
    { kind: 'rewrite', userId: OTHER, oldValue: `${SB}/sign/clips/avatars/${OTHER}.jpg?token=t`, newValue: `avatars/${OTHER}.jpg` },
    { kind: 'unreadable', userId: D, oldValue: 'https://example.com/me.jpg' },
  ])
  assert.deepEqual(plan.orphanFiles, [`avatars/${D}.jpg`])
  // re-running after it was applied: nothing to do
  assert.deepEqual(planAvatarMove([{ id: ME, avatar_url: `avatars/${ME}.png` }, { id: OTHER, avatar_url: `avatars/${OTHER}.jpg` }], []).steps, [])
})
