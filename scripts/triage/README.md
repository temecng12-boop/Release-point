# Feedback triage (read-only)

Lists "Report a problem" reports (`feedback_reports`, migration 028) and
downloads their screenshots from the private `feedback-screenshots` bucket.
It never updates or deletes anything. Plain HTTPS GETs, no dependencies (Node 18+).

```sh
node scripts/triage/list-feedback.mjs                 # last 7 days, up to 50
node scripts/triage/list-feedback.mjs --since 24h --limit 20
node scripts/triage/list-feedback.mjs --since 2026-10-01 --out /tmp/rp-shots
node scripts/triage/list-feedback.mjs --no-download --json > reports.json
```

Screenshots land in `./feedback-downloads/` by default (git-ignored).

## Credentials (never commit them)

The script needs the project URL and the **service role** key. It reads
`SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY`
from the environment first, then from an env file outside the repo, by default
`/workspace/releasepoint-secrets/feedback.env` (override with `--secrets-file`):

```
# /workspace/releasepoint-secrets/feedback.env  (chmod 600)
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key from Supabase > Project Settings > API>
```

One `KEY=value` per line; `#` comments, blank lines, an `export ` prefix and
single or double quotes are allowed.
