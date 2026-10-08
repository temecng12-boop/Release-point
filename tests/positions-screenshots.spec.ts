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
})
