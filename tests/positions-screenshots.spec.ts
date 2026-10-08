import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const OUT = process.env.POSITIONS_SHOT_DIR ?? '/opt/cursor/artifacts/positions-screenshots'

test.describe('position chips and clip toggle', () => {
  test.beforeAll(() => {
    mkdirSync(OUT, { recursive: true })
  })

  test('invite chips, edit-player chips, and clip toggle', async ({ page }, info) => {
    const project = info.project.name === 'Mobile Safari' ? 'iphone' : 'desktop'

    await page.goto('/dev/positions-shot?shot=invite')
    const invite = page.getByTestId('invite-positions')
    await expect(invite).toBeVisible()
    await expect(invite.getByRole('button', { name: 'Catcher' })).toBeVisible()
    await invite.screenshot({ path: join(OUT, `${project}-invite-chips.png`) })

    await page.goto('/dev/positions-shot?shot=edit')
    const edit = page.getByTestId('edit-player-positions')
    await expect(edit).toBeVisible()
    await expect(edit.getByRole('button', { name: 'Catcher' })).toHaveAttribute('aria-pressed', 'true')
    await edit.screenshot({ path: join(OUT, `${project}-edit-player-chips.png`) })

    await page.goto('/dev/positions-shot?shot=toggle')
    const toggle = page.getByTestId('clip-kind-toggle')
    await expect(toggle).toBeVisible()
    await expect(toggle.getByRole('button', { name: 'Pitching' })).toHaveAttribute('aria-pressed', 'true')
    await expect(toggle.getByRole('button', { name: 'Hitting' })).toHaveAttribute('aria-pressed', 'false')
    await toggle.screenshot({ path: join(OUT, `${project}-clip-toggle.png`) })
  })

  test('player opens settings from home, picks Catcher + Hitter + Infield, save persists', async ({ page }, info) => {
    const project = info.project.name === 'Mobile Safari' ? 'iphone' : 'desktop'

    await page.goto('/dev/player-positions')
    await page.evaluate(() => sessionStorage.removeItem('dev-player-positions'))
    await page.reload()

    const homeLink = page.getByRole('link', { name: 'My Profile' }).last()
    await expect(homeLink).toBeVisible()
    await page.locator('main').screenshot({ path: join(OUT, `${project}-player-home-settings-link.png`) })
    await homeLink.click()

    await expect(page.getByText('Positions (pick any)')).toBeVisible()
    const chips = page.getByTestId('settings-positions')
    await expect(chips.getByRole('button', { name: 'Pitcher' })).toHaveAttribute('aria-pressed', 'true')

    await chips.getByRole('button', { name: 'Pitcher' }).click()
    await chips.getByRole('button', { name: 'Catcher' }).click()
    await chips.getByRole('button', { name: 'Hitter' }).click()
    await chips.getByRole('button', { name: 'Infield' }).click()

    await page.getByRole('button', { name: 'Save Profile' }).click()
    await expect(page.getByRole('status')).toContainText('Profile saved.')
    await expect(chips.getByRole('button', { name: 'Catcher' })).toHaveAttribute('aria-pressed', 'true')
    await expect(chips.getByRole('button', { name: 'Hitter' })).toHaveAttribute('aria-pressed', 'true')
    await expect(chips.getByRole('button', { name: 'Infield' })).toHaveAttribute('aria-pressed', 'true')
    await expect(chips.getByRole('button', { name: 'Pitcher' })).toHaveAttribute('aria-pressed', 'false')
    await chips.screenshot({ path: join(OUT, `${project}-player-settings-positions.png`) })

    await page.reload()
    const after = page.getByTestId('settings-positions')
    await expect(page.getByText('Positions (pick any)')).toBeVisible()
    await expect(after.getByRole('button', { name: 'Catcher' })).toHaveAttribute('aria-pressed', 'true')
    await expect(after.getByRole('button', { name: 'Hitter' })).toHaveAttribute('aria-pressed', 'true')
    await expect(after.getByRole('button', { name: 'Infield' })).toHaveAttribute('aria-pressed', 'true')
    await expect(after.getByRole('button', { name: 'Pitcher' })).toHaveAttribute('aria-pressed', 'false')
    await after.screenshot({ path: join(OUT, `${project}-player-settings-persisted.png`) })
  })
})
