#!/usr/bin/env node
// Interim early-access coach invite path for Nolan/ops (runs against prod).
// Use this until the dashboard admin UI (this PR) is deployed, or if the
// UI is ever unreachable. It does exactly what the in-product invite does,
// and never double-creates an account: an email that already has an auth
// user gets no new user and no invite email.
//
//   Invite a coach:
//     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... RESEND_API_KEY=... \
//       node scripts/invite-coach.mjs --email Caseyspencer2021@gmail.com --name "Casey Spencer"
//   Grant platform admin (e.g. if Nolan's profile post-dates migration 041):
//     node scripts/invite-coach.mjs --mark-admin temecng12@gmail.com
//
// Without RESEND_API_KEY the invite is still saved and the sign-in URL is
// printed for manual sending. The email HTML mirrors sendCoachInviteEmail
// (src/lib/email.ts) — keep the two in sync.

import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const FROM = 'Release Point <notifications@releasepointai.com>'

function arg(name) {
  const i = process.argv.indexOf(name)
  return i === -1 ? null : process.argv[i + 1] ?? null
}

const email = (arg('--email') ?? (arg('--mark-admin') ? null : null) ?? '').trim().toLowerCase()
const markAdmin = arg('--mark-admin')
const target = (markAdmin ?? email).trim().toLowerCase()
const name = (arg('--name') ?? '').trim()
const site = (arg('--site') ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://releasepointai.com').replace(/\/$/, '')

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESEND_KEY = process.env.RESEND_API_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(2)
}
if (!target || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
  console.error('Pass a valid email: --email coach@example.com or --mark-admin you@example.com')
  process.exit(2)
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

async function findUserByEmail(emailLower) {
  const perPage = 1000
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(`listUsers failed: ${error.message}`)
    const hit = data.users.find((u) => u.email?.toLowerCase() === emailLower)
    if (hit) return hit
    if (data.users.length < perPage) return null
  }
  return null
}

const existing = await findUserByEmail(target)
if (markAdmin) {
  if (!existing) {
    console.error(`${target} has no account yet; create it first, then re-run --mark-admin.`)
    process.exit(1)
  }
  const { error } = await admin.from('profiles').update({ is_platform_admin: true }).eq('id', existing.id)
  if (error) throw new Error(`grant failed: ${error.message}`)
  console.log(`${target} is now a platform admin.`)
  process.exit(0)
}

if (!name) {
  console.error('Pass --name "Full Name" alongside --email.')
  process.exit(2)
}

// Never double-create: ops may already have created this coach.
if (existing) {
  const { data: profile } = await admin.from('profiles').select('role').eq('id', existing.id).maybeSingle()
  console.log(`${target} already has an account (role: ${profile?.role ?? 'unknown'}). No user created, no email sent.`)
  if (profile?.role === 'coach') console.log('They can sign in at https://releasepointai.com/auth/login.')
  else console.log('Not a coach account — sort out the role by hand before inviting.')
  process.exit(0)
}

const token = randomUUID()
const { data: row } = await admin.from('coach_invites').select('id, accepted_at').eq('email', email).maybeSingle()
if (row?.accepted_at) {
  console.log(`${email} already accepted a coach invite. They can sign in at https://releasepointai.com/auth/login.`)
  process.exit(0)
}
if (row) {
  const { error } = await admin.from('coach_invites').update({ token, created_at: new Date().toISOString(), accepted_at: null }).eq('id', row.id)
  if (error) throw new Error(`invite refresh failed: ${error.message}`)
} else {
  const { error } = await admin.from('coach_invites').insert({ email, token })
  if (error) throw new Error(`invite insert failed: ${error.message}`)
}

const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: 'invite',
  email,
  options: { data: { role: 'coach', full_name: name }, redirectTo: `${site}/auth/confirm` },
})
if (linkErr) throw new Error(`invite link failed: ${linkErr.message}`)
const inviteUrl = linkData?.properties?.action_link
if (!inviteUrl) throw new Error('invite link came back empty')

const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <div style="background:#0F1F33;border-radius:12px;padding:24px;margin-bottom:24px;">
          <p style="color:#C8102E;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;margin:0 0 6px">Release Point</p>
          <h1 style="color:white;font-size:22px;margin:0;text-transform:uppercase;">Coach Early Access</h1>
        </div>
        <p style="color:#0F1F33;font-size:15px;">Hey ${name},</p>
        <p style="color:#456080;font-size:14px;line-height:1.6;">
          You've been invited to coach on Release Point, a professional-grade film room built for baseball.
        </p>
        <p style="color:#456080;font-size:14px;line-height:1.6;">
          Accepting creates your own coach account and organization: your teams, your roster, your clips. Nothing is shared with anyone else's account.
        </p>
        <a href="${inviteUrl}"
           style="display:inline-block;background:#C8102E;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:13px;text-transform:uppercase;letter-spacing:0.1em;margin:16px 0;">
          Accept Invite →
        </a>
        <p style="color:#8096AE;font-size:12px;margin-top:8px;">This link expires in 24 hours. After you accept, you can set a password anytime from Sign in → Forgot password, or keep signing in with an email link.</p>
        <p style="color:#3D5166;font-size:12px;margin-top:32px;border-top:1px solid #DDE4ED;padding-top:16px;">
          By accepting this invite you agree to the <a href="${site}/terms" style="color:#1C3A5C;">Terms of Service</a> and <a href="${site}/privacy" style="color:#1C3A5C;">Privacy Policy</a>.<br />
          Release Point · Built for coaches and players.
        </p>
      </div>
    `

if (!RESEND_KEY) {
  console.log(`Invite saved for ${email}, but RESEND_API_KEY is unset — no email sent. Send this link manually:\n${inviteUrl}`)
  process.exit(0)
}

const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ from: FROM, to: email, subject: 'You\u2019re invited to coach on Release Point', html }),
})
if (!res.ok) {
  const body = await res.text()
  console.error(`Invite saved for ${email}, but Resend refused it (${res.status}): ${body}\nResend with a fresh email or send this link manually:\n${inviteUrl}`)
  process.exit(1)
}
console.log(`Invite sent to ${email}. They'll set up their own coach account from the email.`)
