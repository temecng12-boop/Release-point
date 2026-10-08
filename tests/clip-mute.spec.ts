/**
 * Mute button: visible 44px tap target on desktop and 375px iPhone WebKit,
 * screenshots of muted and unmuted. Uses a fixture that matches the clip
 * player's speaker button (same test id, aria-label, 44px target).
 */
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const html = readFileSync(join(process.cwd(), 'tests/fixtures/clip-mute.html'), 'utf8')
const shotDir = join(process.cwd(), 'tests/screenshots')

function slug(project: string) {
  return project.toLowerCase().replace(/\s+/g, '-')
}

test.describe('clip mute button', () => {
  test('muted and unmuted screenshots, 44px target visible at 375', async ({ page }, info) => {
    const isIphone = /safari|iphone|webkit|mobile/i.test(info.project.name)
    if (isIphone) await page.setViewportSize({ width: 375, height: 667 })
    else await page.setViewportSize({ width: 1280, height: 720 })

    await page.setContent(html, { waitUntil: 'domcontentloaded' })
    const btn = page.getByTestId('clip-mute')
    await expect(btn).toBeVisible()
    await expect(btn).toHaveAttribute('aria-label', 'Mute')
    const box = await btn.boundingBox()
    expect(box, 'button is on screen').toBeTruthy()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
    if (isIphone) {
      expect(box!.x + box!.width).toBeLessThanOrEqual(375)
      expect(box!.x).toBeGreaterThanOrEqual(0)
    }

    const tag = slug(info.project.name)
    const bar = page.locator('.bar')
    await bar.screenshot({ path: join(shotDir, `clip-mute-${tag}-unmuted.png`) })

    await btn.click()
    await expect(btn).toHaveAttribute('aria-label', 'Unmute')
    await expect(btn).toHaveAttribute('aria-pressed', 'true')
    await bar.screenshot({ path: join(shotDir, `clip-mute-${tag}-muted.png`) })
  })
})
