import { fakeClient, sessionFrom, state } from './db'

/** Calls to auth.signUp, so tests can check whether signup reached Supabase. */
export const signUpCalls: { email: string; password: string }[] = []

/** Session claims and updateUser behaviour for the password reset tests. */
export const authFake = {
  claims: null as null | { amr?: unknown[] },
  claimsError: null as null | { message: string },
  updateError: null as null | { message: string; code?: string },
  updateThrows: false,
  updates: [] as { password?: string }[],
  reset() { this.claims = null; this.claimsError = null; this.updateError = null; this.updateThrows = false; this.updates = [] },
}

export async function createClient() {
  return {
    ...fakeClient,
    from: sessionFrom,
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: null }),
      signUp: async ({ email, password }: { email: string; password: string }) => {
        signUpCalls.push({ email, password })
        return { data: { user: { id: `u-${signUpCalls.length}`, email } }, error: null }
      },
      getClaims: async () => authFake.claimsError
        ? { data: null, error: authFake.claimsError }
        : { data: authFake.claims ? { claims: authFake.claims } : null, error: null },
      updateUser: async (attrs: { password?: string }) => {
        if (authFake.updateThrows) throw new TypeError('fetch failed')
        if (authFake.updateError) return { data: { user: null }, error: authFake.updateError }
        authFake.updates.push(attrs)
        return { data: { user: { id: 'u1' } }, error: null }
      },
    },
  }
}
