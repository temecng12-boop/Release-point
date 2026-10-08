// next/server stand-in for route-handler tests: just enough of NextRequest
// and NextResponse for the auth routes (redirects, JSON, raw responses).

export class NextRequest {
  url: string
  nextUrl: URL
  constructor(url: string) {
    this.url = url
    this.nextUrl = new URL(url)
  }
}

type RedirectResult = { status: number; location: string }

export class NextResponse {
  static redirect(url: string | URL, init?: { status?: number }): RedirectResult {
    return { status: init?.status ?? 307, location: String(url) }
  }
  static json(body: unknown, init?: { status?: number }): { status: number; body: unknown } {
    return { status: init?.status ?? 200, body }
  }
}
