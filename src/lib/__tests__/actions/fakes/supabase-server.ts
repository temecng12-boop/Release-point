import { fakeClient, sessionFrom, state } from './db'

/** Calls to auth.signUp, so tests can check whether signup reached Supabase. */
export const signUpCalls: { email: string; password: string }[] = []
/** Session returned from signUp. Null = email confirmation on (production). */
export const signUpFake = {
  session: null as null | { access_token: string },
  reset() { this.session = null },
}
/** Calls to auth.signInWithOtp (player signup links). */
export const otpCalls: { email: string; options?: { emailRedirectTo?: string } }[] = []

/** Make signInWithOtp fail (raw Supabase error). */
export const otpFake = { error: null as null | { message: string; code?: string } }

/** Session claims and updateUser behaviour for the password reset tests. */
export const authFake = {
  claims: null as null | { amr?: unknown[] },
  claimsError: null as null | { message: string },
  updateError: null as null | { message: string; code?: string },
  updateThrows: false,
  updates: [] as { password?: string }[],
  reset() { this.claims = null; this.claimsError = null; this.updateError = null; this.updateThrows = false; this.updates = [] },
}

/** How many times createClient() was called (the under-13 signup stop must make none). */
export const clientCalls = { n: 0 }

export async function createClient() {
  clientCalls.n++
  return {
    ...fakeClient,
    from: sessionFrom,
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: null }),
      signOut: async () => { state.signOuts++; return { error: null } },
      signUp: async ({ email, password }: { email: string; password: string }) => {
        signUpCalls.push({ email, password })
        return { data: { user: { id: `u-${signUpCalls.length}`, email }, session: signUpFake.session }, error: null }
      },
      signInWithOtp: async (args: { email: string; options?: { emailRedirectTo?: string } }) => {
        otpCalls.push(args)
        if (otpFake.error) return { data: {}, error: otpFake.error }
        return { data: {}, error: null }
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
