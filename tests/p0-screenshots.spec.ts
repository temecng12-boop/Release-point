/**
 * P0 screenshots: clip page (mute, Voice, Pitching/Hitting, analysis),
 * mobile nav drawer, /about AI sentence. Desktop 1280 and iPhone WebKit 375.
 */
import { test, expect, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { E2E_CLIP_A } from '../src/lib/e2e-clip-fixture'

const SHOT = '/opt/cursor/artifacts/p0'

function isIphone(project: string) {
  return /safari|iphone|webkit|mobile/i.test(project)
}

function slug(project: string) {
  return project.toLowerCase().replace(/\s+/g, '-')
}

async function hideDevOverlay(page: Page) {
  await page.addInitScript(() => {
    const hide = () => {
      document.querySelectorAll('nextjs-portal').forEach((el) => el.remove())
    }
    hide()
    const obs = new MutationObserver(hide)
    obs.observe(document.documentElement, { childList: true, subtree: true })
  })
}

async function stubVoiceRecording(page: Page) {
  await page.addInitScript(() => {
    const track = { stop() {}, kind: 'audio', enabled: true }
    const stream = {
      getTracks() { return [track] },
      getAudioTracks() { return [track] },
      getVideoTracks() { return [] },
    }
    const gum = async () => stream as unknown as MediaStream
    try {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        get() { return { getUserMedia: gum, enumerateDevices: async () => [], getSupportedConstraints() { return {} } } as unknown as MediaDevices },
      })
    } catch { /* empty */ }
    class FakeRecorder {
      mimeType: string
      state = 'inactive'
      ondataavailable: ((e: { data: Blob }) => void) | null = null
      onstop: (() => void) | null = null
      constructor(_stream: unknown, opts?: { mimeType?: string }) {
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
    try {
      Object.defineProperty(window, 'MediaRecorder', { configurable: true, writable: true, value: FakeRecorder })
    } catch {
      ;(window as unknown as { MediaRecorder: typeof FakeRecorder }).MediaRecorder = FakeRecorder
    }
  })
}

test('clip page: mute, Voice tab, Pitching/Hitting toggle, analysis panel', async ({ page }, info) => {
  mkdirSync(SHOT, { recursive: true })
  const iphone = isIphone(info.project.name)
  const width = iphone ? 375 : 1280
  const tag = `${slug(info.project.name)}-${width}`
  await page.setViewportSize({ width, height: iphone ? 667 : 900 })
  await hideDevOverlay(page)
  await stubVoiceRecording(page)

  const res = await page.goto(`/clips/${E2E_CLIP_A}`, { waitUntil: 'domcontentloaded' })
  expect(res?.ok(), 'fixture clip loads').toBeTruthy()
  await expect(page.getByTestId('e2e-clip-page')).toBeVisible()

  await expect(page.getByTestId('clip-mute')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pitching' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Hitting' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Voice', exact: true })).toBeVisible()

  await page.screenshot({ path: `${SHOT}/clip-page-${tag}.png`, fullPage: true })

  await page.getByRole('button', { name: 'Voice', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Record', exact: true })).toBeVisible()
  await page.screenshot({ path: `${SHOT}/clip-page-voice-${tag}.png`, fullPage: true })

  await page.getByRole('button', { name: iphone ? 'AI' : 'AI Coach', exact: true }).click()
  await expect(page.getByText('Randy', { exact: true }).first()).toBeVisible()
  await page.screenshot({ path: `${SHOT}/clip-page-analysis-${tag}.png`, fullPage: true })
})

test('mobile nav drawer open', async ({ page }, info) => {
  mkdirSync(SHOT, { recursive: true })
  const iphone = isIphone(info.project.name)
  const width = iphone ? 375 : 1280
  const tag = `${slug(info.project.name)}-${width}`
  await page.setViewportSize({ width, height: iphone ? 667 : 900 })
  await hideDevOverlay(page)

  const res = await page.goto(`/clips/${E2E_CLIP_A}`, { waitUntil: 'domcontentloaded' })
  expect(res?.ok()).toBeTruthy()
  await expect(page.getByTestId('e2e-clip-page')).toBeVisible()

  await page.setViewportSize({ width: 375, height: 667 })
  await page.getByRole('button', { name: 'Open menu' }).click()
  await expect(page.getByRole('button', { name: 'Close menu' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'About Release Point' })).toBeVisible()
  // Framer-motion springs the drawer from the right; wait until it has settled
  // in-frame so WebKit does not capture the still-closed hamburger.
  await expect.poll(async () => {
    const box = await page.getByRole('button', { name: 'Close menu' }).boundingBox()
    return !!box && box.x > 180 && box.width > 20
  }).toBe(true)
  await page.screenshot({
    path: `${SHOT}/mobile-nav-${tag}.png`,
    animations: 'disabled',
  })
})

test('/about shows the exact AI sentence', async ({ page }, info) => {
  mkdirSync(SHOT, { recursive: true })
  const iphone = isIphone(info.project.name)
  const width = iphone ? 375 : 1280
  const tag = `${slug(info.project.name)}-${width}`
  await page.setViewportSize({ width, height: iphone ? 667 : 900 })
  await hideDevOverlay(page)

  const res = await page.goto('/about', { waitUntil: 'domcontentloaded' })
  expect(res?.ok()).toBeTruthy()
  const sentence = 'Both run on frontier-grade, enterprise-trusted AI models, set up with baseball biomechanics and pitching and hitting metric frameworks, and given the full context of each clip.'
  const el = page.getByText(sentence)
  await expect(el).toBeVisible()
  await el.scrollIntoViewIfNeeded()
  await expect(el).toBeInViewport()
  // Viewport, not full-page: the sentence has to be readable in the artifact.
  await page.screenshot({ path: `${SHOT}/about-ai-${tag}.png`, fullPage: false })
})
