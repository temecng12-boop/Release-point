import { fakeClient, sessionFrom, state } from './db'
export async function createClient() {
  return {
    ...fakeClient,
    from: sessionFrom,
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
  }
}
