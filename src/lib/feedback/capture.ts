// Context captured with a report: page, route, clip, device/browser, viewport,
// app version. Pure helpers (tested in feedback-capture.test.ts); the form
// calls captureFromWindow() and the server action re-checks everything with
// sanitizeContext() and adds the user and version itself.

export type ClientContext = {
  pageUrl: string
  route: string
  clipId: string | null
  viewportW: number | null
  viewportH: number | null
  pixelRatio: number | null
}

export type ParsedAgent = { device: string; os: string; browser: string }

const UUID_SEG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Route pattern for a path: ids become [id], so reports group by page. */
export function routeFor(pathname: string): string {
  const parts = (pathname || '/').split('?')[0].split('#')[0].split('/').filter(Boolean)
  const out = parts.map((p, i) => {
    if (UUID_SEG.test(p) || /^\d+$/.test(p)) return '[id]'
    // /clips/compare is a real page; any other second segment under /clips is a clip id
    if (i === 1 && parts[0] === 'clips' && p !== 'compare') return '[id]'
    return p
  })
  return '/' + out.join('/')
}

/** The clip id when on a clip page (/clips/<uuid> or below). */
export function clipIdFromPath(pathname: string): string | null {
  const m = (pathname || '').match(/^\/clips\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$|\?|#)/i)
  return m ? m[1].toLowerCase() : null
}

/** Small user-agent parser: enough to group reports (no dependency). */
export function parseUserAgent(ua: string | null | undefined): ParsedAgent {
  const s = ua ?? ''
  // iPadOS 13+ reports as Macintosh; touch support is not visible here, so it stays "Mac".
  let os = 'Unknown'
  let m: RegExpMatchArray | null
  if ((m = s.match(/(?:iPhone|CPU) OS (\d+)[_.](\d+)/)) && /iPhone|iPad|iPod/.test(s)) os = `iOS ${m[1]}.${m[2]}`
  else if ((m = s.match(/Android (\d+(?:\.\d+)?)/))) os = `Android ${m[1]}`
  else if ((m = s.match(/Windows NT (\d+\.\d+)/))) os = m[1] === '10.0' ? 'Windows 10/11' : `Windows NT ${m[1]}`
  else if ((m = s.match(/Mac OS X (\d+)[_.](\d+)/))) os = `macOS ${m[1]}.${m[2]}`
  else if (/CrOS/.test(s)) os = 'ChromeOS'
  else if (/Linux/.test(s)) os = 'Linux'

  let device = 'Desktop'
  if (/iPad/.test(s)) device = 'iPad'
  else if (/iPhone/.test(s)) device = 'iPhone'
  else if (/iPod/.test(s)) device = 'iPod'
  else if (/Android/.test(s)) device = /Mobile/.test(s) ? 'Android phone' : 'Android tablet'
  else if (/Mobi/.test(s)) device = 'Mobile'

  let browser = 'Unknown'
  if ((m = s.match(/EdgiOS\/(\d+)/)) || (m = s.match(/Edg(?:A)?\/(\d+)/))) browser = `Edge ${m[1]}`
  else if ((m = s.match(/OPR\/(\d+)/))) browser = `Opera ${m[1]}`
  else if ((m = s.match(/SamsungBrowser\/(\d+)/))) browser = `Samsung Internet ${m[1]}`
  else if ((m = s.match(/CriOS\/(\d+)/))) browser = `Chrome ${m[1]} (iOS)`
  else if ((m = s.match(/FxiOS\/(\d+)/))) browser = `Firefox ${m[1]} (iOS)`
  else if ((m = s.match(/Firefox\/(\d+)/))) browser = `Firefox ${m[1]}`
  else if ((m = s.match(/Chrome\/(\d+)/))) browser = `Chrome ${m[1]}`
  else if ((m = s.match(/Version\/(\d+(?:\.\d+)?).*Safari\//))) browser = `Safari ${m[1]}`
  else if (/Safari\//.test(s)) browser = 'Safari'
  if (/; wv\)/.test(s)) browser += ' (WebView)'
  return { device, os, browser }
}

const intOrNull = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : null)

/** Server-side clean-up of what the browser sent (lengths, types, same-origin URL). */
export function sanitizeContext(raw: unknown, appOrigin?: string | null): ClientContext {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  let pageUrl = typeof r.pageUrl === 'string' ? r.pageUrl.slice(0, 2048) : ''
  let pathname = '/'
  try {
    const u = new URL(pageUrl)
    if (!/^https?:$/.test(u.protocol) || (appOrigin && u.origin !== appOrigin)) pageUrl = ''
    else pathname = u.pathname
  } catch { pageUrl = '' }
  const pr = typeof r.pixelRatio === 'number' && Number.isFinite(r.pixelRatio) && r.pixelRatio > 0 && r.pixelRatio < 100 ? Math.round(r.pixelRatio * 100) / 100 : null
  return {
    pageUrl,
    route: routeFor(pathname).slice(0, 300),
    clipId: clipIdFromPath(pathname),
    viewportW: intOrNull(r.viewportW, 20000),
    viewportH: intOrNull(r.viewportH, 20000),
    pixelRatio: pr,
  }
}

/** Browser-side capture (call only in the browser). */
export function captureFromWindow(w: { location: { href: string; pathname: string }; innerWidth: number; innerHeight: number; devicePixelRatio?: number }): ClientContext {
  return {
    pageUrl: w.location.href,
    route: routeFor(w.location.pathname),
    clipId: clipIdFromPath(w.location.pathname),
    viewportW: w.innerWidth,
    viewportH: w.innerHeight,
    pixelRatio: w.devicePixelRatio ?? null,
  }
}

/** App version for reports: the deployed commit, or a clear fallback. */
export function appVersion(env: Record<string, string | undefined>): string {
  const sha = env.VERCEL_GIT_COMMIT_SHA || env.GIT_COMMIT_SHA || env.NEXT_PUBLIC_COMMIT_SHA
  const where = env.VERCEL_ENV ? ` (${env.VERCEL_ENV})` : ''
  if (sha && /^[0-9a-f]{7,40}$/i.test(sha)) return `${sha.slice(0, 12)}${where}`
  return `unknown${env.NODE_ENV === 'development' ? ' (local dev)' : where}`
}
