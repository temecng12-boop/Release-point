import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

// One-shot route: visit this URL while logged in as the account owner to raise the clips bucket limit to 500 MB.
// Safe to leave in — it only works for the owner's authenticated session.
export async function GET(req: NextRequest) {
  void req
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== 'temecng12@gmail.com') {
    return new Response('Unauthorized', { status: 401 })
  }

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
