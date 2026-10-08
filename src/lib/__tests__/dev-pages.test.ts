/**
 * /dev/* is a 404 unless ENABLE_DEV_PAGES=1 (Playwright only).
 * Run with: npx tsx --test src/lib/__tests__/dev-pages.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { devPagesEnabled } from '../dev-pages'

const SRC = new URL('../../', import.meta.url)
const src = (p: string) => readFileSync(new URL(p, SRC), 'utf8')

test('/dev/positions-shot 404s without ENABLE_DEV_PAGES=1', () => {
  assert.equal(devPagesEnabled({}), false)
  assert.equal(devPagesEnabled({ ENABLE_DEV_PAGES: undefined }), false)
  assert.equal(devPagesEnabled({ ENABLE_DEV_PAGES: '' }), false)
  assert.equal(devPagesEnabled({ ENABLE_DEV_PAGES: 'true' }), false)
  assert.equal(devPagesEnabled({ ENABLE_DEV_PAGES: '0' }), false)
  assert.equal(devPagesEnabled({ ENABLE_DEV_PAGES: '1' }), true)

  const layout = src('app/dev/layout.tsx')
  assert.doesNotMatch(layout, /['"]use client['"]/)
  assert.match(layout, /devPagesEnabled\(\)/)
  assert.match(layout, /notFound\(\)/)
  assert.ok(layout.indexOf('if (!devPagesEnabled())') < layout.indexOf('notFound()'))
})

test('ENABLE_DEV_PAGES=1 is set only in the Playwright webServer, not in app code', () => {
  const pw = src('../playwright.config.ts')
  assert.match(pw, /ENABLE_DEV_PAGES:\s*'1'/)
  assert.match(pw, /webServer/)
  const app = src('app/dev/positions-shot/page.tsx')
  assert.doesNotMatch(app, /ENABLE_DEV_PAGES/)
})
