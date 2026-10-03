// Argument + env-file parsing for list-feedback.mjs (pure; tested in
// src/lib/__tests__/triage-args.test.ts).

export const DEFAULT_LIMIT = 50
export const MAX_LIMIT = 500
export const DEFAULT_SINCE = '7d'
export const DEFAULT_OUT = 'feedback-downloads'
export const SECRETS_FILE = '/workspace/releasepoint-secrets/feedback.env'

export const USAGE = `Usage: node scripts/triage/list-feedback.mjs [options]

Lists "Report a problem" reports (newest first) and downloads their
screenshots. Read-only: never updates or deletes anything.

Options:
  --since <when>     Only reports after this. ISO date/time (2026-10-01,
                     2026-10-01T09:00:00Z) or relative: 30m, 12h, 7d, 2w.
                     Default: ${DEFAULT_SINCE}.
  --limit <n>        At most n reports (1-${MAX_LIMIT}). Default: ${DEFAULT_LIMIT}.
  --out <dir>        Folder for screenshots. Default: ./${DEFAULT_OUT} (git-ignored).
  --no-download      Don't download screenshots.
  --json             Print JSON instead of the readable summary.
  --secrets-file <path>  Env file to read. Default: ${SECRETS_FILE}
  -h, --help         Show this help.

Credentials: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and
SUPABASE_SERVICE_ROLE_KEY from the environment, else from the env file
(lines of KEY=value; # comments and blank lines ignored; optional quotes).`

/** Parses --since: ISO date/time or <n>(m|h|d|w). Returns a Date or throws. */
export function parseSince(value, now = new Date()) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('--since needs a value, e.g. 7d or 2026-10-01')
  const v = value.trim()
  const rel = v.match(/^(\d+)\s*(m|h|d|w)$/i)
  if (rel) {
    const n = Number(rel[1])
    const ms = { m: 60e3, h: 3600e3, d: 86400e3, w: 7 * 86400e3 }[rel[2].toLowerCase()]
    if (n <= 0) throw new Error('--since must be more than 0')
    return new Date(now.getTime() - n * ms)
  }
  if (/^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(v)) {
    const d = new Date(v.length === 10 ? `${v}T00:00:00Z` : v.replace(' ', 'T'))
    if (!Number.isNaN(d.getTime())) return d
  }
  throw new Error(`--since: can't read "${v}" (use e.g. 24h, 7d or 2026-10-01)`)
}

export function parseArgs(argv, now = new Date()) {
  const opts = { since: parseSince(DEFAULT_SINCE, now), limit: DEFAULT_LIMIT, out: DEFAULT_OUT, download: true, json: false, envFile: SECRETS_FILE, help: false }
  const need = (i, name) => {
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) throw new Error(`${name} needs a value`)
    return v
  }
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i]
    let inline
    const eq = a.indexOf('=')
    if (a.startsWith('--') && eq > 0) { inline = a.slice(eq + 1); a = a.slice(0, eq) }
    const val = (name) => (inline !== undefined ? inline : need(i++, name))
    switch (a) {
      case '--since': opts.since = parseSince(val('--since'), now); break
      case '--limit': {
        const raw = val('--limit')
        const n = Number(raw)
        if (!/^\d+$/.test(raw) || n < 1 || n > MAX_LIMIT) throw new Error(`--limit must be a whole number from 1 to ${MAX_LIMIT}`)
        opts.limit = n
        break
      }
      case '--out': opts.out = val('--out'); break
      case '--secrets-file': opts.envFile = val('--secrets-file'); break
      case '--no-download': opts.download = false; break
      case '--json': opts.json = true; break
      case '-h': case '--help': opts.help = true; break
      default: throw new Error(`Unknown option: ${argv[i]} (see --help)`)
    }
  }
  return opts
}

/** KEY=value lines; # comments, blank lines, `export ` prefix and quotes allowed. */
export function parseEnvFile(text) {
  const out = {}
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!m || line.trim().startsWith('#')) continue
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    else v = v.replace(/\s+#.*$/, '')
    out[m[1]] = v
  }
  return out
}

/** Environment first, then the env file. Never prints the key. */
export function resolveCredentials(env, fileVars) {
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || fileVars.SUPABASE_URL || fileVars.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY || fileVars.SUPABASE_SERVICE_ROLE_KEY
  const missing = [!url && 'SUPABASE_URL', !key && 'SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean)
  return { url, key, missing }
}

/** Safe local file name for a report's screenshot. */
export function screenshotFileName(report) {
  const ext = String(report.screenshot_path ?? '').match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? 'bin'
  const when = String(report.created_at ?? '').replace(/[^0-9T]/g, '').slice(0, 15) || 'unknown'
  return `${when}_${String(report.id).replace(/[^0-9a-f-]/gi, '')}.${ext}`
}
