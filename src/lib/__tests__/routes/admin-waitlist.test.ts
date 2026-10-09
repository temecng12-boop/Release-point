/**
 * /admin/waitlist and /api/admin/fix-bucket: platform-admin only (never a
 * hardcoded email). A signed-in non-admin gets 403 and the waitlist is not read.
 * Run with: npx tsx --tsconfig src/lib/__tests__/routes/tsconfig.json --test src/lib/__tests__/routes/admin-waitlist.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resetFake, state } from '../actions/fakes/db'
import { loadAdminWaitlistPage } from '../../admin-waitlist'
import { GET as fixBucket } from '../../../app/api/admin/fix-bucket/route'
import { forbidden } from '../../http-forbidden'

const COACH = { id: 'coach-a', email: 'a@example.com' }

test('non-admin loadAdminWaitlistPage is 403 and does not read waitlist', async () => {
  delete process.env.PLATFORM_ADMIN_EMAILS
  resetFake({
    user: COACH,
    tables: {
      profiles: [{ id: COACH.id, role: 'coach', is_platform_admin: false }],
      waitlist: [{ id: 'w1', email: 'x@example.com' }],
    },
  })
  const r = await loadAdminWaitlistPage()
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.status, 403)
    assert.equal(r.error, 'Forbidden')
  }
  assert.ok(!state.ops.some((o) => o.table === 'waitlist'))
  try {
    forbidden()
    assert.fail('expected throw')
  } catch (err) {
    assert.equal((err as { digest?: string }).digest, 'NEXT_HTTP_ERROR_FALLBACK;403')
  }
})

test('non-admin /api/admin/fix-bucket is 403', async () => {
  delete process.env.PLATFORM_ADMIN_EMAILS
  resetFake({
    user: COACH,
    tables: { profiles: [{ id: COACH.id, role: 'coach', is_platform_admin: false }] },
  })
  const r = await fixBucket({} as never)
  assert.equal(r.status, 403)
})
