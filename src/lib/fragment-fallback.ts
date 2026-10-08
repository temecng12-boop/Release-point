// Client-side fragment fallback for old invite emails.
//
// Invite emails sent before the token_hash links carry an IMPLICIT-flow link
// (.../auth/callback#access_token=... or .../auth/confirm#...). The tokens
// live in the URL fragment, which never reaches the server, so a server
// route alone cannot sign those invitees in. When a confirm/callback request
// arrives with no server-side params, the route answers with this page
// instead: it reads the hash in the browser, establishes the session with
// the cookie-based browser client (plain setSession only writes localStorage,
// which the server can't see), strips the hash so tokens never linger in the
// URL, and then navigates to /auth/callback, where the same invite-only and
// age gates run as for every other path.

// Pinned to the installed packages (package.json).
const SUPABASE_JS_PIN = 'https://esm.sh/@supabase/ssr@0.12.7'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * An HTML page (served by /auth/confirm and /auth/callback when no
 * server-side auth params are present) that finishes an old fragment link.
 * `next` is carried through to the callback redirect; both it and the
 * Supabase credentials are HTML-escaped. No tokens are embedded.
 */
export function fragmentFallbackHtml(next: string, supabaseUrl: string, supabaseAnonKey: string): string {
  const target = `/auth/callback?next=${encodeURIComponent(next)}`
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Signing you in · Release Point</title></head>
<body>
<p style="font-family:sans-serif;color:#3D5166;font-size:14px;text-align:center;margin-top:20vh">Signing you in…</p>
<script type="module">
import { createBrowserClient } from "${SUPABASE_JS_PIN}";
const supabase = createBrowserClient("${escapeHtml(supabaseUrl)}", "${escapeHtml(supabaseAnonKey)}");
const hash = new URLSearchParams(window.location.hash.slice(1));
const access_token = hash.get("access_token");
const refresh_token = hash.get("refresh_token");
if (!access_token || !refresh_token) {
  window.location.replace("/auth/login");
} else {
  // Strip the tokens from the URL first so they never linger in history.
  history.replaceState(null, "", window.location.pathname + window.location.search);
  supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
    window.location.replace(error ? "/auth/login?error=confirmation_failed" : "${escapeHtml(target)}");
  });
}
</script>
</body>
</html>`
}
