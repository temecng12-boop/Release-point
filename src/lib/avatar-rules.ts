// Profile photo upload rules, shared by the browser (before upload) and
// uploadAvatar (server). The browser crops to a small JPEG, so a real photo
// is far below the cap.
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024
export const AVATAR_TOO_BIG = 'That photo is too big. Pick one under 2 MB.'
export const AVATAR_NOT_IMAGE = 'That file isn\'t a photo. Pick a JPEG, PNG or WebP image.'
export const AVATAR_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export function avatarFileProblem(file: { type: string; size: number }): string | null {
  if (!AVATAR_TYPES[file.type]) return AVATAR_NOT_IMAGE
  if (file.size > MAX_AVATAR_BYTES) return AVATAR_TOO_BIG
  if (file.size === 0) return AVATAR_NOT_IMAGE
  return null
}

/** The file's first bytes match its declared image type (JPEG, PNG or WebP). */
export function avatarBytesMatchType(bytes: Uint8Array, type: string): boolean {
  const b = (i: number) => bytes[i]
  if (type === 'image/jpeg') return b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff
  if (type === 'image/png') return b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47
  if (type === 'image/webp') return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  return false
}
