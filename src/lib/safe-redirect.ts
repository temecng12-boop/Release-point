// Post-sign-in redirect targets taken from the URL (?next=...). Only a
// same-origin path starting with exactly one '/' is allowed; anything else
// gets the fallback. Used by /auth/confirm and /auth/callback.

const BASE = 'https://same-origin.invalid'

// Control characters (incl. tab/newline, which URL parsers strip) and DEL.
const CONTROL = /[\u0000-\u001f\u007f]/

function isSafeForm(s: string) {
  return s.startsWith('/')
    && s[1] !== '/'
    && !s.includes('\\')
    && !CONTROL.test(s)
}

// A decoded form may contain a single '/' from an encoded %2F (e.g. a path
// segment or query value), but never '//' anywhere (protocol-relative or
// "scheme://"), a backslash, or a still-encoded backslash.
function isSafeDecoded(s: string) {
  return isSafeForm(s) && !s.includes('//') && !/%5c/i.test(s)
}

export function safeRedirectPath(next: unknown, fallback = '/dashboard', origin: string = BASE): string {
  if (typeof next !== 'string' || next === '' || !isSafeForm(next)) return fallback
  // Encoded backslashes ("%5C") are never needed here.
  if (/%5c/i.test(next)) return fallback
  // Every decoded form (including double encoding) must be safe too.
  // Four rounds or more of encoding is too deep to check, so it is refused.
  let decoded = next
  for (let i = 0; ; i++) {
    let d: string
    try { d = decodeURIComponent(decoded) } catch { return fallback }
    if (d === decoded) break
    if (i === 3 || !isSafeDecoded(d)) return fallback
    decoded = d
  }
  let url: URL
  try { url = new URL(next, origin) } catch { return fallback }
  return url.origin === new URL(origin).origin ? next : fallback
}
