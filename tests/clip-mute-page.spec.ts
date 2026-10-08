/**
 * Real clip page (/clips/[id], coach) and compare: mute button next to speed,
 * no 375 overflow, video.muted on tap / 0.5x / voice note / reload.
 * Requires PLAYWRIGHT_CLIP_FIXTURE=1 on the Next server (playwright.config webServer).
 */
import { test, expect, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { E2E_CLIP_A, E2E_CLIP_B } from '../src/lib/e2e-clip-fixture'

const SHOT = '/opt/cursor/artifacts/screenshots'

function isIphone(project: string) {
  return /safari|iphone|webkit|mobile/i.test(project)
}

function slug(project: string) {
  return project.toLowerCase().replace(/\s+/g, '-')
}

async function stubVoiceRecording(page: Page) {
  await page.addInitScript(() => {
    const track = { stop() {}, kind: 'audio', enabled: true }
    const stream = {
      getTracks() { return [track] },
      getAudioTracks() { return [track] },
      getVideoTracks() { return [] },
    }
    const devices = navigator.mediaDevices ?? (navigator as Navigator & { mediaDevices: MediaDevices }).mediaDevices
    if (!navigator.mediaDevices) {
      Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true })
    }
    navigator.mediaDevices.getUserMedia = async () => stream as MediaStream
    void devices

    class FakeRecorder {
      mimeType: string
      state = 'inactive'
      ondataavailable: ((e: { data: Blob }) => void) | null = null
      onstop: (() => void) | null = null
      onerror: ((e: Event) => void) | null = null
      constructor(_stream: MediaStream, opts?: { mimeType?: string }) {
        this.mimeType = opts?.mimeType ?? 'audio/webm'
      }
      start() { this.state = 'recording' }
      stop() {
        this.state = 'inactive'
        this.ondataavailable?.({ data: new Blob([new Uint8Array([1])], { type: this.mimeType }) })
        this.onstop?.()
      }
      static isTypeSupported() { return true }
    }
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, writable: true, value: FakeRecorder })
  })
}

async function videoMuted(page: Page) {
  return page.locator('video').first().evaluate((v: HTMLVideoElement) => v.muted)
}

async function assertNoHorizontalOverflow(page: Page, width: number) {
  const box = await page.getByTestId('clip-mute').boundingBox()
  expect(box, 'mute button is on screen').toBeTruthy()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1)
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth }
  })
  expect(overflow.scrollWidth, 'nothing overflowing horizontally').toBeLessThanOrEqual(overflow.clientWidth + 1)
}

test.describe('real clip page mute', () => {
  test('button beside speed, tap, 0.5x, voice note, reload', async ({ page }, info) => {
    mkdirSync(SHOT, { recursive: true })
    const iphone = isIphone(info.project.name)
    const width = iphone ? 375 : 1280
    await page.setViewportSize({ width, height: iphone ? 667 : 720 })
    await stubVoiceRecording(page)
    await page.addInitScript(() => { try { localStorage.removeItem('rp.clipMuted') } catch { /* empty */ } })

    await page.goto(`/clips/${E2E_CLIP_A}`)
    await expect(page.getByTestId('e2e-clip-page')).toBeVisible()
    const btn = page.getByTestId('clip-mute')
    await expect(btn).toBeVisible()
    await expect(page.getByRole('button', { name: '1x', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '.5x', exact: true })).toBeVisible()

    const muteBox = await btn.boundingBox()
    const speedBox = await page.getByRole('button', { name: '1x', exact: true }).boundingBox()
    expect(muteBox && speedBox, 'mute and speed are laid out').toBeTruthy()
    expect(Math.abs(muteBox!.y - speedBox!.y), 'button sits with the speed controls').toBeLessThan(80)

    if (iphone) await assertNoHorizontalOverflow(page, 375)

    const tag = slug(info.project.name)
    const size = iphone ? '375' : '1280'
    const controls = page.locator('div').filter({ has: btn }).filter({ has: page.getByRole('button', { name: '1x', exact: true }) }).first()
    await controls.screenshot({ path: `${SHOT}/clip-page-${tag}-${size}-unmuted.png` })

    const before = await videoMuted(page)
    await btn.click()
    await expect.poll(async () => videoMuted(page)).toBe(!before)
    await controls.screenshot({ path: `${SHOT}/clip-page-${tag}-${size}-muted.png` })

    // Saved choice unmuted, then 0.5x mutes and 1x restores.
    if (await videoMuted(page)) await btn.click()
    await expect.poll(async () => videoMuted(page)).toBe(false)
    await page.getByRole('button', { name: '.5x', exact: true }).click()
    await expect.poll(async () => videoMuted(page)).toBe(true)
    await page.getByRole('button', { name: '1x', exact: true }).click()
    await expect.poll(async () => videoMuted(page)).toBe(false)

    await page.getByRole('button', { name: 'Record', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Stop Recording' })).toBeVisible()
    await expect.poll(async () => videoMuted(page)).toBe(true)

    await page.getByRole('button', { name: 'Stop Recording' }).click()
    await expect.poll(async () => videoMuted(page)).toBe(false)

    await btn.click()
    await expect.poll(async () => videoMuted(page)).toBe(true)
    await page.reload()
    await expect(page.getByTestId('clip-mute')).toBeVisible()
    await expect.poll(async () => videoMuted(page)).toBe(true)
    await expect(page.getByTestId('clip-mute')).toHaveAttribute('aria-label', 'Unmute')
  })

  test('compare at 375: button beside speed, nothing overflowing', async ({ page }, info) => {
    mkdirSync(SHOT, { recursive: true })
    await page.setViewportSize({ width: 375, height: 667 })
    await page.addInitScript(() => { try { localStorage.removeItem('rp.clipMuted') } catch { /* empty */ } })
    await page.goto(`/clips/compare?a=${E2E_CLIP_A}&b=${E2E_CLIP_B}`)
    await expect(page.getByTestId('e2e-compare-page')).toBeVisible()
    const btn = page.getByTestId('clip-mute')
    await expect(btn).toBeVisible()
    await expect(page.getByRole('button', { name: '1x', exact: true })).toBeVisible()
    await assertNoHorizontalOverflow(page, 375)

    const tag = slug(info.project.name)
    const controls = page.locator('div').filter({ has: btn }).filter({ has: page.getByRole('button', { name: '1x', exact: true }) }).first()
    await controls.screenshot({ path: `${SHOT}/compare-${tag}-375.png` })
    void info
  })
})
