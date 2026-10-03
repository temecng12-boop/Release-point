// Profile photos. profiles.avatar_url stores the object path (`avatars/<userId>.<ext>`, in the private
// `clips` bucket); pages sign a short-lived URL on the server for each render.
//
// Older rows hold a full URL instead: a ~10-year signed URL into `clips`, or a public/signed URL into the
// old `profiles` bucket. readAvatarRef() turns any of those into { bucket, path }; anything else
// (unknown host shape, someone else's file, a non-avatar path) is ignored and the UI shows initials.
// Only `avatars/<ownerId>.<ext>` is ever signed, so a hand-edited avatar_url can't be used to get a
// signed URL for another user's photo or for a clip.

export const AVATAR_BUCKET = 'clips'
export const AVATAR_URL_TTL_SECONDS = 60 * 60 // 1 hour
const AVATAR_BUCKETS = ['clips', 'profiles'] as const
export type AvatarBucket = (typeof AVATAR_BUCKETS)[number]
export type AvatarRef = { bucket: AvatarBucket; path: string }

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const AVATAR_PATH_RE = new RegExp(`^avatars/(${UUID})\\.([a-z0-9]{1,5})$`, 'i')
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif'] as const

/** The storage path for a user's photo. The cropper always produces JPEG; other image types keep their extension. */
export function avatarPathFor(userId: string, fileName: string | undefined, contentType: string | undefined): string | null {
  if (!new RegExp(`^${UUID}$`, 'i').test(userId)) return null
  const fromName = fileName?.includes('.') ? fileName.split('.').pop()!.toLowerCase() : ''
  const fromType = contentType?.startsWith('image/') ? contentType.slice(6).toLowerCase() : ''
  const ext = [fromName, fromType].find(e => (ALLOWED_EXT as readonly string[]).includes(e)) ?? (fromType ? 'jpg' : '')
  return ext ? `avatars/${userId}.${ext === 'jpeg' ? 'jpg' : ext}` : null
}

function ownAvatarPath(path: string, ownerId: string): string | null {
  const m = AVATAR_PATH_RE.exec(path)
  return m && m[1].toLowerCase() === ownerId.toLowerCase() ? path : null
}

/** Parse a stored avatar_url (path or legacy URL) into the owner's avatar object, or null. */
export function readAvatarRef(stored: string | null | undefined, ownerId: string): AvatarRef | null {
  const v = (stored ?? '').trim()
  if (!v || !ownerId) return null
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) {
    const path = ownAvatarPath(v.replace(/^\/+/, ''), ownerId)
    return path ? { bucket: AVATAR_BUCKET, path } : null
  }
  let url: URL
  try { url = new URL(v) } catch { return null }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  // Supabase Storage: /storage/v1/object/{sign|public|authenticated}/<bucket>/<path>
  const m = /^\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/]+)\/(.+)$/.exec(url.pathname)
  if (!m) return null
  let bucket: string, path: string
  try { bucket = decodeURIComponent(m[1]); path = decodeURIComponent(m[2]) } catch { return null }
  if (!(AVATAR_BUCKETS as readonly string[]).includes(bucket)) return null
  const own = ownAvatarPath(path, ownerId)
  return own ? { bucket: bucket as AvatarBucket, path: own } : null
}

/** The minimal storage surface used here (supabaseAdmin.storage satisfies it). */
export type AvatarStorage = {
  from(bucket: string): {
    createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl: string } | null; error: unknown }>
  }
}

/** A short-lived signed URL for a user's photo, or null (no photo, unreadable value, or signing failed). Never throws. */
export async function signAvatarUrl(storage: AvatarStorage, stored: string | null | undefined, ownerId: string): Promise<string | null> {
  const ref = readAvatarRef(stored, ownerId)
  if (!ref) return null
  try {
    const { data, error } = await storage.from(ref.bucket).createSignedUrl(ref.path, AVATAR_URL_TTL_SECONDS)
    return !error && data?.signedUrl ? data.signedUrl : null
  } catch {
    return null
  }
}
