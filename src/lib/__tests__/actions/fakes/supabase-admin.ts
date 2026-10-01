import { fakeClient } from './db'
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- stands in for the untyped service client
export const supabaseAdmin = fakeClient as any
