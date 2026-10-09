import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requirePlatformAdmin } from '@/lib/platform-admin-server'

// One-shot route: raise the clips bucket limit to 500 MB. Platform admins only
// (DB flag + env allowlist) — never a hardcoded email.
export async function GET(req: NextRequest) {
  void req
  const gate = await requirePlatformAdmin()
  if (!gate.ok) return new Response(gate.error, { status: gate.status })

  const { data, error } = await supabaseAdmin.storage.updateBucket('clips', {
    public: false,
    fileSizeLimit: 524288000, // 500 MB
    allowedMimeTypes: ['video/*', 'audio/*'],
  })

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }

  return Response.json({ ok: true, message: 'clips bucket updated — 500 MB limit set', data })
}
