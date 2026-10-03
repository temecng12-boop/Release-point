#!/usr/bin/env -S npx tsx
// Move leftover profile photos from the old `profiles` bucket into clips/avatars/ and store object paths in
// profiles.avatar_url (migration 036 / avatars-private). Service role. DRY RUN unless --apply.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/avatars/move-to-clips.ts            # plan only
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/avatars/move-to-clips.ts --apply    # do it
//
// Per profile (see src/lib/avatar-move.ts):
//   copy       avatar_url points into the profiles bucket: download it, upload to clips/avatars/<id>.<ext>
//              (upsert: it is the photo the profile currently shows), check it can be signed, then set
//              avatar_url to the path. The profiles copy is NOT deleted.
//   rewrite    avatar_url is an old signed URL into clips: set it to the path. No file moves.
//   unreadable left alone (the app shows initials); listed for a human to look at.
// Files in profiles/avatars/ that no profile points at are listed, never deleted.
// Each profile is independent; a failure is reported and the script exits 1. Safe to re-run.
// Credentials come from the environment only; nothing is written to disk.
import { createClient } from '@supabase/supabase-js'
import { planAvatarMove } from '../../src/lib/avatar-move'

const apply = process.argv.includes('--apply')
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1) }
const sb = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  const profiles: { id: string; avatar_url: string | null }[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('profiles').select('id, avatar_url').not('avatar_url', 'is', null).order('id').range(from, from + 999)
    if (error) throw new Error(`read profiles: ${error.message}`)
    profiles.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  const files: string[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from('profiles').list('avatars', { limit: 1000, offset })
    if (error) throw new Error(`list profiles/avatars: ${error.message}`)
    files.push(...(data ?? []).filter(f => f.id).map(f => `avatars/${f.name}`))
    if (!data || data.length < 1000) break
  }

  const plan = planAvatarMove(profiles, files)
  const count = (k: string) => plan.steps.filter(s => s.kind === k).length
  console.log(`${apply ? 'APPLY' : 'DRY RUN'}: ${profiles.length} profiles with avatar_url, ${files.length} files in profiles/avatars/`)
  console.log(`  copy ${count('copy')}, rewrite ${count('rewrite')}, unreadable ${count('unreadable')}, unreferenced files ${plan.orphanFiles.length}`)

  let failed = 0
  for (const s of plan.steps) {
    if (s.kind === 'unreadable') { console.log(`  unreadable  ${s.userId}  ${s.oldValue.slice(0, 120)}`); continue }
    if (!apply) { console.log(`  ${s.kind.padEnd(10)}  ${s.userId}  -> ${s.newValue}`); continue }
    try {
      if (s.kind === 'copy') {
        const dl = await sb.storage.from(s.from.bucket).download(s.from.path)
        if (dl.error || !dl.data) throw new Error(`download: ${dl.error?.message ?? 'no data'}`)
        const up = await sb.storage.from(s.to.bucket).upload(s.to.path, await dl.data.arrayBuffer(), { contentType: dl.data.type || 'image/jpeg', upsert: true })
        if (up.error) throw new Error(`upload: ${up.error.message}`)
        const signed = await sb.storage.from(s.to.bucket).createSignedUrl(s.to.path, 60)
        if (signed.error || !signed.data?.signedUrl) throw new Error(`verify: ${signed.error?.message ?? 'no URL'}`)
      }
      const { error } = await sb.from('profiles').update({ avatar_url: s.newValue }).eq('id', s.userId)
      if (error) throw new Error(`update profile: ${error.message}`)
      console.log(`  ok ${s.kind.padEnd(7)}  ${s.userId}  -> ${s.newValue}`)
    } catch (e) {
      failed++
      console.log(`  FAILED ${s.kind}  ${s.userId}: ${(e as Error).message}`)
    }
  }
  for (const f of plan.orphanFiles) console.log(`  unreferenced  profiles/${f}`)
  if (failed) { console.error(`${failed} step(s) failed; re-run after fixing.`); process.exit(1) }
  console.log(apply ? 'Done.' : 'Dry run only. Re-run with --apply to make these changes.')
}

main().catch(e => { console.error((e as Error).message); process.exit(1) })
