import { fakeClient } from './db'

/** auth.admin stand-in: set `authAdmin.existingEmails` / `authAdmin.linkError` per test. */
export const authAdmin = {
  existingEmails: new Set<string>(),
  linkError: null as null | { code?: string; message: string },
  links: [] as string[],
  /** Auth users visible to listUsers/getUserById (findAuthUserByEmail). */
  users: [] as { id: string; email: string }[],
  /** auth.admin.updateUserById calls (the under-13 scrub of provider metadata). */
  metadataUpdates: [] as { id: string; user_metadata: Record<string, unknown> }[],
  updateError: null as null | { code?: string; message: string },
  reset() { this.existingEmails = new Set(); this.linkError = null; this.links = []; this.users = []; this.metadataUpdates = []; this.updateError = null },
}

export const supabaseAdmin = {
  ...fakeClient,
  auth: {
    admin: {
      async generateLink({ email }: { type: string; email: string }) {
        authAdmin.links.push(email)
        if (authAdmin.linkError) return { data: null, error: authAdmin.linkError }
        if (authAdmin.existingEmails.has(email)) {
          return { data: null, error: { code: 'email_exists', message: 'A user with this email address has already been registered' } }
        }
        return { data: { properties: { action_link: `https://auth.test/invite?e=${email}` } }, error: null }
      },
      async listUsers({ page = 1, perPage = 1000 }: { page?: number; perPage?: number } = {}) {
        const start = (page - 1) * perPage
        return { data: { users: authAdmin.users.slice(start, start + perPage) }, error: null }
      },
      async updateUserById(id: string, attrs: { user_metadata: Record<string, unknown> }) {
        authAdmin.metadataUpdates.push({ id, user_metadata: attrs.user_metadata })
        return { data: { user: { id } }, error: authAdmin.updateError }
      },
      async getUserById(id: string) {
        const known = authAdmin.users.find(u => u.id === id)
        if (known) return { data: { user: { id: known.id, email: known.email, user_metadata: {} } }, error: null }
        return { data: { user: { id, email: 'coach@example.com', user_metadata: { full_name: 'Coach C' } } }, error: null }
      },
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stands in for the untyped service client
} as any
