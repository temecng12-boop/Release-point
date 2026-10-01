import { fakeClient, sessionFrom, state } from './db'

/** Calls to auth.signUp, so tests can check whether signup reached Supabase. */
export const signUpCalls: { email: string; password: string }[] = []

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
    },
  }
}
