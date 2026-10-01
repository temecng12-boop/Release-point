/**
 * scripts/triage/list-feedback.mjs argument + env-file parsing.
 * Run with: npx tsx --test src/lib/__tests__/triage-args.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DEFAULT_LIMIT, MAX_LIMIT, SECRETS_FILE, parseArgs, parseEnvFile, parseSince, resolveCredentials, screenshotFileName } from '../../../scripts/triage/args.mjs'

const NOW = new Date('2026-10-01T17:00:00Z')

test('defaults', () => {
  const o = parseArgs([], NOW)
  assert.equal(o.limit, DEFAULT_LIMIT); assert.equal(o.download, true); assert.equal(o.json, false)
  assert.equal(o.out, 'feedback-downloads'); assert.equal(o.envFile, SECRETS_FILE)
  assert.equal(o.since.toISOString(), '2026-09-24T17:00:00.000Z')
})

test('--since relative and absolute; --limit bounds; flags; = form', () => {
  assert.equal(parseSince('30m', NOW).toISOString(), '2026-10-01T16:30:00.000Z')
  assert.equal(parseSince('12h', NOW).toISOString(), '2026-10-01T05:00:00.000Z')
  assert.equal(parseSince('2w', NOW).toISOString(), '2026-09-17T17:00:00.000Z')
  assert.equal(parseSince('2026-09-30', NOW).toISOString(), '2026-09-30T00:00:00.000Z')
  assert.equal(parseSince('2026-09-30T08:15:00-07:00', NOW).toISOString(), '2026-09-30T15:15:00.000Z')
  for (const bad of ['', 'yesterday', '0d', '7y', '2026-13-45']) assert.throws(() => parseSince(bad, NOW), String(bad))
  const o = parseArgs(['--since', '24h', '--limit=20', '--no-download', '--json', '--out', '/tmp/x', '--secrets-file', '/tmp/f.env'], NOW)
  assert.deepEqual([o.since.toISOString(), o.limit, o.download, o.json, o.out, o.envFile], ['2026-09-30T17:00:00.000Z', 20, false, true, '/tmp/x', '/tmp/f.env'])
  assert.equal(parseArgs(['--limit', String(MAX_LIMIT)], NOW).limit, MAX_LIMIT)
  for (const bad of [['--limit', '0'], ['--limit', String(MAX_LIMIT + 1)], ['--limit', '2.5'], ['--limit'], ['--since'], ['--since', '--json'], ['--delete'], ['stray']])
    assert.throws(() => parseArgs(bad, NOW), bad.join(' '))
  assert.equal(parseArgs(['-h'], NOW).help, true)
})

test('env file format and credential precedence', () => {
  const vars = parseEnvFile(`# feedback triage\nSUPABASE_URL=https://abc.supabase.co\nexport SUPABASE_SERVICE_ROLE_KEY="s3cr3t"\n\nOTHER='x y' \nBAD LINE\nTRAIL=v # comment\n`)
  assert.deepEqual(vars, { SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 's3cr3t', OTHER: 'x y', TRAIL: 'v' })
  assert.deepEqual(resolveCredentials({ SUPABASE_URL: 'https://env', SUPABASE_SERVICE_ROLE_KEY: 'k' }, vars), { url: 'https://env', key: 'k', missing: [] })
  assert.deepEqual(resolveCredentials({}, vars), { url: 'https://abc.supabase.co', key: 's3cr3t', missing: [] })
  assert.deepEqual(resolveCredentials({ NEXT_PUBLIC_SUPABASE_URL: 'https://pub' }, {}).missing, ['SUPABASE_SERVICE_ROLE_KEY'])
  assert.deepEqual(resolveCredentials({}, {}).missing, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
})

test('screenshot file names are safe', () => {
  assert.equal(screenshotFileName({ id: '22222222-2222-4222-8222-222222222222', created_at: '2026-10-01T17:05:09.123+00:00', screenshot_path: 'u/22222222-2222-4222-8222-222222222222.HEIC' }), '20261001T170509_22222222-2222-4222-8222-222222222222.heic')
  assert.equal(screenshotFileName({ id: '../../etc/passwd', created_at: null, screenshot_path: null }), 'unknown_ecad.bin')
})

test('the script is read-only and has no secrets', () => {
  const src = readFileSync(new URL('../../../scripts/triage/list-feedback.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /\.(update|delete|insert|upsert|remove|move|rpc)\(/)
  assert.doesNotMatch(src, /eyJ[A-Za-z0-9_-]{10,}/)            // no JWT-looking key
  assert.doesNotMatch(src, /method:\s*'(POST|PATCH|PUT|DELETE)'/i)   // GET requests only
})
