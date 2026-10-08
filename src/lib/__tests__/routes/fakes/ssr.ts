// @supabase/ssr stand-in for route-handler tests: a programmable session
// client. verifyOtp/exchangeCodeForSession either fail with verifyError or
// succeed, install verifyUser, and record the cookie writes (proving the
// session is set server-side, not via a URL fragment).
export const ssrAuth = {
  user: null as null | { id: string; email?: string | null; created_at?: string | null },
  verifyUser: null as null | { id: string; email?: string | null; created_at?: string | null },
  verifyError: null as null | { message: string; code?: string },
  exchangeError: null as null | { message: string; code?: string },
  verifyCalls: [] as { token_hash?: string; type?: string; code?: string }[],
  signOuts: [] as unknown[],
  cookieWrites: 0,
  reset() {
    this.user = null
    this.verifyUser = null
    this.verifyError = null
    this.exchangeError = null
    this.verifyCalls = []
    this.signOuts = []
    this.cookieWrites = 0
  },
}

export function createServerClient(
  _url: string,
  _key: string,
  opts: { cookies: { getAll(): unknown[]; setAll(c: unknown[]): void } },
) {
  return {
    auth: {
      getUser: async () => ({ data: { user: ssrAuth.user }, error: null }),
      signOut: async (args?: unknown) => {
        ssrAuth.signOuts.push(args ?? {})
        ssrAuth.user = null
        return { error: null }
      },
      exchangeCodeForSession: async (code: string) => {
        ssrAuth.verifyCalls.push({ code })
        if (ssrAuth.exchangeError) return { error: ssrAuth.exchangeError }
        if (ssrAuth.verifyUser) {
          ssrAuth.user = ssrAuth.verifyUser
          opts.cookies.setAll([{ name: 'sb-test-auth', value: 'x', options: {} }])
          ssrAuth.cookieWrites++
        }
        return { error: null }
      },
      verifyOtp: async (args: { token_hash: string; type: string }) => {
        ssrAuth.verifyCalls.push(args)
        if (ssrAuth.verifyError) return { error: ssrAuth.verifyError }
        if (ssrAuth.verifyUser) {
          ssrAuth.user = ssrAuth.verifyUser
          opts.cookies.setAll([{ name: 'sb-test-auth', value: 'x', options: {} }])
          ssrAuth.cookieWrites++
        }
        return { error: null }
      },
    },
  }
}
