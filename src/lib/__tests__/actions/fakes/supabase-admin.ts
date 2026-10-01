import { fakeClient } from './db'

/** auth.admin stand-in: set `authAdmin.existingEmails` / `authAdmin.linkError` per test. */
export const authAdmin = {
  existingEmails: new Set<string>(),
  linkError: null as null | { code?: string; message: string },
  links: [] as string[],
  reset() { this.existingEmails = new Set(); this.linkError = null; this.links = [] },
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
      async getUserById(id: string) {
        return { data: { user: { id, email: 'coach@example.com', user_metadata: { full_name: 'Coach C' } } }, error: null }
      },
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stands in for the untyped service client
} as any
