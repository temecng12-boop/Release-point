// Plan for moving leftover profile photos out of the old public `profiles` bucket (see migration 036).
// Pure: takes profiles rows and the file names in profiles/avatars/, returns what to do.
// Used by scripts/avatars/move-to-clips.ts. Nothing here deletes anything.
import { readAvatarRef, AVATAR_BUCKET } from './avatar'

export type AvatarMoveStep =
  | { kind: 'copy'; userId: string; from: { bucket: 'profiles'; path: string }; to: { bucket: typeof AVATAR_BUCKET; path: string }; newValue: string }
  | { kind: 'rewrite'; userId: string; oldValue: string; newValue: string }  // legacy clips URL -> path, no file moves
  | { kind: 'unreadable'; userId: string; oldValue: string }                 // left alone; the UI shows initials

export type AvatarMovePlan = { steps: AvatarMoveStep[]; orphanFiles: string[] }

export function planAvatarMove(profiles: { id: string; avatar_url: string | null }[], profilesBucketFiles: string[]): AvatarMovePlan {
  const steps: AvatarMoveStep[] = []
  const referenced = new Set<string>()
  for (const p of profiles) {
    const v = p.avatar_url
    if (!v || !v.trim()) continue
    const ref = readAvatarRef(v, p.id)
    if (!ref) { steps.push({ kind: 'unreadable', userId: p.id, oldValue: v }); continue }
    if (ref.bucket === 'profiles') {
      referenced.add(ref.path)
      steps.push({ kind: 'copy', userId: p.id, from: { bucket: 'profiles', path: ref.path }, to: { bucket: AVATAR_BUCKET, path: ref.path }, newValue: ref.path })
    } else if (v !== ref.path) {
      steps.push({ kind: 'rewrite', userId: p.id, oldValue: v, newValue: ref.path })
    }
  }
  const orphanFiles = profilesBucketFiles.map(f => f.replace(/^\/+/, '')).filter(f => !referenced.has(f)).sort()
  return { steps, orphanFiles }
}
