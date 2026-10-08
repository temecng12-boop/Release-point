// @supabase/ssr stand-in for the middleware tests: a signed-in user (or none),
// their profile role, and their players row, read through the session client.
export const ssrFake = {
  user: null as null | { id: string },
  profile: null as null | { role: string },
  player: null as null | Record<string, unknown>,
  playerError: null as null | { message: string },
  reads: 0,
  reset() { this.user = null; this.profile = null; this.player = null; this.playerError = null; this.reads = 0 },
}

export function createServerClient() {
  return {
    auth: { getUser: async () => ({ data: { user: ssrFake.user }, error: null }) },
    from: (table: string) => ({
      select: () => ({
        eq: (_c: string, v: string) => ({
          maybeSingle: async () => {
            ssrFake.reads++
            if (table === 'profiles') return { data: ssrFake.user && ssrFake.user.id === v ? ssrFake.profile : null, error: null }
            if (table !== 'players') return { data: null, error: null }
            if (ssrFake.playerError) return { data: null, error: ssrFake.playerError }
            return { data: ssrFake.player && ssrFake.user?.id === v ? ssrFake.player : null, error: null }
          },
        }),
      }),
    }),
  }
}
