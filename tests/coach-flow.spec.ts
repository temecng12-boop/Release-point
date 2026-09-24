/**
 * E2E: Coach full flow
 *
 * Prerequisites (set as environment variables):
 *   COACH_EMAIL    — email of a coach account that exists in the test DB
 *   COACH_PASSWORD — that coach's password
 *
 * Run against local dev:
 *   npx playwright test
 *
 * Run against production:
 *   PLAYWRIGHT_BASE_URL=https://release-point.vercel.app npx playwright test
 *
 * If credentials are not set, auth tests are skipped and only public-page
 * checks run (useful for CI without secrets).
 */

import { test, expect, type Page } from '@playwright/test'

const COACH_EMAIL    = process.env.COACH_EMAIL    ?? ''
const COACH_PASSWORD = process.env.COACH_PASSWORD ?? ''
const HAS_CREDS      = !!(COACH_EMAIL && COACH_PASSWORD)

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function signInAsCoach(page: Page) {
  await page.goto('/auth/login')
  await page.getByRole('button', { name: /password/i }).click()
  await page.getByLabel(/email/i).fill(COACH_EMAIL)
  await page.getByLabel(/password/i).fill(COACH_PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL('**/dashboard', { timeout: 15_000 })
}

// ─── Public pages ─────────────────────────────────────────────────────────────

test('login page loads and shows both auth modes', async ({ page }) => {
  await page.goto('/auth/login')
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /password/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /email link/i })).toBeVisible()
})

test('login page has Apple and Google sign-in buttons', async ({ page }) => {
  await page.goto('/auth/login')
  await expect(page.getByRole('button', { name: /continue with apple/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible()
})

test('signup page shows role selection', async ({ page }) => {
  await page.goto('/auth/signup')
  await expect(page.getByRole('heading', { name: /join release point/i })).toBeVisible()
  // Both role cards visible
  const coachBtn  = page.getByRole('button', { name: /coach/i }).first()
  const playerBtn = page.getByRole('button', { name: /player/i }).first()
  await expect(coachBtn).toBeVisible()
  await expect(playerBtn).toBeVisible()
})

test('signup page has Apple and Google buttons on role select screen', async ({ page }) => {
  await page.goto('/auth/signup')
  await expect(page.getByRole('button', { name: /continue with apple/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible()
})

test('PWA manifest is served', async ({ page }) => {
  const res = await page.goto('/manifest.webmanifest')
  expect(res?.status()).toBe(200)
  const body = await res?.text() ?? ''
  const manifest = JSON.parse(body)
  expect(manifest.name).toBe('Release Point')
  expect(manifest.display).toBe('standalone')
  expect(manifest.icons?.length).toBeGreaterThan(0)
})

test('service worker is served', async ({ page }) => {
  const res = await page.goto('/sw.js')
  expect(res?.status()).toBe(200)
  const ct = res?.headers()['content-type'] ?? ''
  expect(ct).toContain('javascript')
})

// ─── Authenticated coach flow ─────────────────────────────────────────────────

test.describe('Coach authenticated flow', () => {
  test.skip(!HAS_CREDS, 'Set COACH_EMAIL and COACH_PASSWORD env vars to run auth tests')

  test('coach can sign in and sees dashboard', async ({ page }) => {
    await signInAsCoach(page)
    await expect(page).toHaveURL(/dashboard/)
    // Roster or team content should be present
    const body = page.locator('body')
    await expect(body).not.toBeEmpty()
  })

  test('dashboard has no blank-data sections (no empty placeholders)', async ({ page }) => {
    await signInAsCoach(page)
    // The loading skeleton should never appear AFTER data has loaded
    const pulse = page.locator('.animate-pulse')
    // Give data a moment to resolve
    await page.waitForTimeout(2000)
    // If skeleton is still visible, data hasn't loaded — fail
    const pulseCount = await pulse.count()
    expect(pulseCount, 'Skeleton loaders still visible after 2s — data may not be loading').toBe(0)
  })

  test('coach can navigate to a clip detail page', async ({ page }) => {
    await signInAsCoach(page)

    // Find any clip link on the dashboard
    const clipLink = page.locator('a[href^="/clips/"]').first()
    const hasClips = await clipLink.count() > 0

    if (!hasClips) {
      test.info().annotations.push({ type: 'skip-reason', description: 'No clips on this account — upload one first' })
      return
    }

    await clipLink.click()
    await page.waitForURL('**/clips/**', { timeout: 10_000 })
    await expect(page.locator('video, [data-testid="video-player"]').first()).toBeVisible({ timeout: 10_000 })
  })

  test('coach can fill mechanics checklist and save it', async ({ page }) => {
    await signInAsCoach(page)

    const clipLink = page.locator('a[href^="/clips/"]').first()
    if (await clipLink.count() === 0) {
      test.info().annotations.push({ type: 'skip', description: 'No clips' })
      return
    }

    await clipLink.click()
    await page.waitForURL('**/clips/**')

    // Navigate to Mechanics tab
    const mechTab = page.getByRole('button', { name: /mech|mechanics/i })
    await expect(mechTab).toBeVisible()
    await mechTab.click()

    // Rate the first phase as "Good"
    const goodBtn = page.getByRole('button', { name: /^good$/i }).first()
    await expect(goodBtn).toBeVisible({ timeout: 8_000 })
    await goodBtn.click()

    // Add a note
    const noteInput = page.locator('input[placeholder*="note"]').first()
    if (await noteInput.count() > 0) {
      await noteInput.fill('E2E test note — front hip drives well')
    }

    // Save
    const saveBtn = page.getByRole('button', { name: /save checklist/i })
    await expect(saveBtn).toBeEnabled()
    await saveBtn.click()

    // Confirm saved state
    await expect(page.getByText(/✓ saved/i)).toBeVisible({ timeout: 8_000 })
  })

  test('AI Coach tab loads and accepts a message', async ({ page }) => {
    await signInAsCoach(page)

    const clipLink = page.locator('a[href^="/clips/"]').first()
    if (await clipLink.count() === 0) {
      test.info().annotations.push({ type: 'skip', description: 'No clips' })
      return
    }

    await clipLink.click()
    await page.waitForURL('**/clips/**')

    const aiTab = page.getByRole('button', { name: /ai|coach/i }).last()
    await aiTab.click()

    const input = page.locator('input[placeholder*="mechanics"]')
    await expect(input).toBeVisible()
    await input.fill('Does this pitcher show good hip-shoulder separation?')
    await page.getByRole('button', { name: /send/i }).click()

    // AI response should appear within 20s
    await expect(page.locator('[class*="assistant"], [class*="coach"]').last())
      .not.toBeEmpty({ timeout: 20_000 })
  })

  // ─── Regression checks ──────────────────────────────────────────────────────

  test('text is legible — no font-size below 11px on key surfaces', async ({ page }) => {
    await signInAsCoach(page)

    // Collect computed font sizes of all visible text nodes
    const tinyText = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT)
      const violations: string[] = []
      let node = walker.nextNode()
      while (node) {
        const el = node as HTMLElement
        if (el.offsetParent !== null) {
          const fs = parseFloat(window.getComputedStyle(el).fontSize)
          if (fs > 0 && fs < 11) {
            violations.push(`${el.tagName}${el.className ? '.' + el.className.split(' ').join('.') : ''}: ${fs}px`)
          }
        }
        node = walker.nextNode()
      }
      return violations.slice(0, 10)
    })

    expect(tinyText, `Elements with font-size < 11px found: ${tinyText.join(', ')}`).toHaveLength(0)
  })

  test('no broken navigation links (404s) on dashboard', async ({ page }) => {
    await signInAsCoach(page)

    // Collect all internal links
    const hrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href^="/"]'))
        .map((a) => (a as HTMLAnchorElement).href)
        .filter((h) => !h.includes('/clips/'))
        .slice(0, 15)
    )

    for (const href of hrefs) {
      const res = await page.request.get(href)
      expect(res.status(), `${href} returned ${res.status()}`).not.toBe(404)
    }
  })
})
