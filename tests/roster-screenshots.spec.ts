/**
 * Roster add + later email attach + Privacy/About copy.
 * Desktop 1280 and iPhone WebKit 375 → /opt/cursor/artifacts/roster/
 */
import { test, expect, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const OUT = process.env.ROSTER_SHOT_DIR ?? '/opt/cursor/artifacts/roster'

function isIphone(project: string) {
  return /safari|iphone|webkit|mobile/i.test(project)
}

async function hideDevOverlay(page: Page) {
  await page.addInitScript(() => {
    const hide = () => {
      document.querySelectorAll('nextjs-portal, [data-next-badge-root]').forEach((el) => el.remove())
    }
    hide()
    const obs = new MutationObserver(hide)
    obs.observe(document.documentElement, { childList: true, subtree: true })
  })
}

test.describe('roster screenshots', () => {
  test.beforeAll(() => {
    mkdirSync(OUT, { recursive: true })
  })

  test.beforeEach(async ({ page }, info) => {
    const iphone = isIphone(info.project.name)
    await page.setViewportSize({ width: iphone ? 375 : 1280, height: iphone ? 667 : 720 })
    await hideDevOverlay(page)
  })

  test('add-player modal: optional email, then 13–17 consent radios', async ({ page }, info) => {
    const tag = isIphone(info.project.name) ? '375' : '1280'
    await page.goto('/dev/roster-shot?shot=add')
    await page.getByRole('button', { name: '+ Add Player' }).click()
    const form = page.getByTestId('add-player-form')
    await expect(form).toBeVisible()
    await expect(form.getByText('Player Email (optional)')).toBeVisible()
    await expect(form.getByText('Adds this player to the roster without creating an account')).toBeVisible()
    await expect(page.getByTestId('minor-consent')).toHaveCount(0)
    await form.screenshot({ path: join(OUT, `add-player-${tag}.png`) })

    await form.locator('select[name="birth_month"]').selectOption('1')
    await form.locator('input[name="birth_year"]').fill('2011')
    const consent = page.getByTestId('minor-consent')
    await expect(consent).toBeVisible()
    await expect(consent.getByText("I'm this player's parent/guardian.")).toBeVisible()
    await expect(consent.getByText('I have written permission from this player\'s parent/guardian to upload video.')).toBeVisible()
    await form.screenshot({ path: join(OUT, `add-player-consent-${tag}.png`) })
  })

  test('attach email later with Send invite now', async ({ page }, info) => {
    const tag = isIphone(info.project.name) ? '375' : '1280'
    await page.goto('/dev/roster-shot?shot=attach')
    const form = page.getByTestId('attach-email-form')
    await expect(form).toBeVisible()
    await expect(form.getByText('Add an email')).toBeVisible()
    await expect(form.getByText('Send invite now')).toBeVisible()
    await expect(form.getByRole('checkbox', { name: 'Send invite now' })).toBeChecked()
    await form.screenshot({ path: join(OUT, `attach-email-${tag}.png`) })

    await page.goto('/dev/roster-shot?shot=attach-linked')
    const linked = page.getByTestId('attach-email-form')
    await expect(linked.getByText('Player email')).toBeVisible()
    await expect(linked.getByRole('checkbox', { name: 'Send invite now' })).not.toBeChecked()
    await linked.screenshot({ path: join(OUT, `attach-email-linked-${tag}.png`) })
  })

  test('Privacy and About mention assistant coaches and roster-only players', async ({ page }, info) => {
    const tag = isIphone(info.project.name) ? '375' : '1280'
    await page.goto('/privacy')
    await expect(page.getByText('including assistant coaches').first()).toBeVisible()
    await expect(page.getByText('Roster-only players', { exact: true })).toBeVisible()
    await page.getByText('Roster-only players', { exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(OUT, `privacy-roster-${tag}.png`), fullPage: false })

    await page.goto('/about')
    await expect(page.getByText('including assistant coaches').first()).toBeVisible()
    await page.getByText('including assistant coaches').first().scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(OUT, `about-assistants-${tag}.png`), fullPage: false })
  })
})
