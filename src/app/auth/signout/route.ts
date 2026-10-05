import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Plain sign-out route (POST only), for pages where server actions aren't
// available: a frozen under-13 account's server actions are all refused
// (src/lib/under13-gate.ts). Signs out this device, then goes to sign-in.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut({ scope: 'local' })
  if (error) console.error('[auth/signout] sign-out failed', { message: error.message })
  const url = request.nextUrl.clone()
  url.pathname = error ? '/under-13' : '/auth/login'
  url.search = error ? '?signout=failed' : ''
  return NextResponse.redirect(url, 303)
}
