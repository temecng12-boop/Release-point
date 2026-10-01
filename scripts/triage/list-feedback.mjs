#!/usr/bin/env node
// Read-only triage for "Report a problem" (feedback_reports, migration 028).
// Lists reports and downloads their screenshots with the service role, using
// plain HTTPS GETs to PostgREST and Storage (no dependencies; Node 18+).
// No secrets in the repo: credentials come from the environment or from an
// env file outside it (default /workspace/releasepoint-secrets/feedback.env).
// Run `node scripts/triage/list-feedback.mjs --help` for options.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { USAGE, parseArgs, parseEnvFile, resolveCredentials, screenshotFileName } from './args.mjs'

const BUCKET = 'feedback-screenshots'
const COLS = 'id, created_at, status, user_id, email, role, message, page_url, route, clip_id, device, os, browser, viewport_w, viewport_h, pixel_ratio, app_version, user_agent, screenshot_path, screenshot_mime, screenshot_bytes, screenshot_status'

function fail(msg) { console.error(`list-feedback: ${msg}`); process.exit(1) }

let opts
try { opts = parseArgs(process.argv.slice(2)) } catch (e) { fail(`${e.message}\n\n${USAGE}`) }
if (opts.help) { console.log(USAGE); process.exit(0) }

let fileVars = {}
if (existsSync(opts.envFile)) fileVars = parseEnvFile(readFileSync(opts.envFile, 'utf8'))
const { url, key, missing } = resolveCredentials(process.env, fileVars)
if (missing.length) fail(`missing ${missing.join(' and ')} (set them in the environment or in ${opts.envFile})`)

const base = url.replace(/\/+$/, '')
const headers = { apikey: key, Authorization: `Bearer ${key}` }

async function getJson(path) {
  const res = await fetch(`${base}${path}`, { headers: { ...headers, Accept: 'application/json' } })
  const body = await res.text()
  let json = null
  try { json = JSON.parse(body) } catch { /* not JSON */ }
  if (!res.ok) {
    const code = json?.code ?? res.status
    throw new Error(`${json?.message ?? body.slice(0, 200)} [${code}]${code === '42P01' || code === 'PGRST205' ? ' (migration 028 not applied?)' : ''}`)
  }
  return json
}

const qs = new URLSearchParams({ select: COLS.replace(/\s+/g, ''), created_at: `gte.${opts.since.toISOString()}`, order: 'created_at.desc', limit: String(opts.limit) })
let reports
try { reports = await getJson(`/rest/v1/feedback_reports?${qs}`) } catch (e) { fail(`could not read feedback_reports: ${e.message}`) }

async function download(path) {
  const res = await fetch(`${base}/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`, { headers })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

const outDir = resolve(opts.out)
const results = []
for (const r of reports ?? []) {
  let file = null, fileError = null
  if (opts.download && r.screenshot_path) {
    try {
      const bytes = await download(r.screenshot_path)
      mkdirSync(outDir, { recursive: true })
      file = join(outDir, screenshotFileName(r))
      writeFileSync(file, bytes)
    } catch (e) { fileError = e.message }
  }
  results.push({ ...r, local_screenshot: file, screenshot_error: fileError })
}

if (opts.json) {
  console.log(JSON.stringify(results, null, 2))
} else {
  const tz = 'America/Los_Angeles'
  const fmt = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }) + ' PT'
  console.log(`${results.length} report(s) since ${fmt(opts.since.toISOString())}${results.length === opts.limit ? ` (limit ${opts.limit}; there may be more)` : ''}\n`)
  for (const r of results) {
    console.log(`── ${fmt(r.created_at)}  [${r.status}]  ${r.id}`)
    console.log(`   From:     ${r.email ?? '?'} (${r.role ?? 'no role'}) ${r.user_id}`)
    console.log(`   Page:     ${r.route ?? '?'}  ${r.page_url ?? ''}${r.clip_id ? `\n   Clip:     ${r.clip_id}` : ''}`)
    console.log(`   Device:   ${r.device ?? '?'} · ${r.os ?? '?'} · ${r.browser ?? '?'} · ${r.viewport_w ?? '?'}×${r.viewport_h ?? '?'}${r.pixel_ratio ? ` @${r.pixel_ratio}x` : ''}`)
    console.log(`   Version:  ${r.app_version ?? '?'}`)
    const shot = r.local_screenshot ? r.local_screenshot : r.screenshot_error ? `download failed: ${r.screenshot_error}` : r.screenshot_status === 'failed' ? 'upload failed on the device' : r.screenshot_path ? '(not downloaded)' : 'none'
    console.log(`   Screenshot: ${shot}`)
    console.log(`   What happened:\n${String(r.message).split('\n').map(l => `     ${l}`).join('\n')}\n`)
  }
}
