import { fakeClient, state } from './db'
export async function createClient() {
  return {
    ...fakeClient,
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
  }
}
