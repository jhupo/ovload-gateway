import { expect, test } from '../../web/node_modules/@playwright/test'

test('home scene, shadcn controls and sign-in route', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const errors: string[] = []
  const writes: string[] = []

  await page.addInitScript(() => {
    window.localStorage.setItem('i18nextLng', 'en')
    window.localStorage.removeItem('vite-ui-theme')
  })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('request', (request) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
      writes.push(request.url())
    }
  })

  await page.goto('/')
  await page.waitForFunction(() => '__ovloadHomepage' in window, undefined, {
    timeout: 15000,
  })
  // Keep the rendered scene stable while measuring the real DOM transition.
  await page.evaluate(() => {
    const state = window as unknown as { __ovloadHomepage: { finishIntro(): void; setPaused(value: boolean): void }; savedScene?: unknown; savedCanvas?: Element | null }
    state.__ovloadHomepage.finishIntro()
    state.__ovloadHomepage.setPaused(true)
    state.savedScene = state.__ovloadHomepage
    state.savedCanvas = document.querySelector('.public-scenery canvas')
  })
  await expect(
    page.getByRole('heading', { name: 'Ovload Gateway' })
  ).toBeAttached()
  await expect(page.locator('.public-scenery canvas')).toBeAttached()
  await expect(page.locator('.gateway-tools')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(page.locator('.gateway-tools')).toHaveCSS('border-top-width', '0px')
  await expect(page.locator('.tools-separator')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Language' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Toggle theme' })).toBeVisible()

  await page.getByRole('button', { name: 'Language' }).click()
  await expect(page.getByRole('menuitem', { name: '中文' })).toBeVisible()
  await page.getByRole('menuitem', { name: '中文' }).click()
  await expect(page.getByRole('button', { name: '语言' })).toBeVisible()
  await expect(page.locator('.connection-caption')).toHaveText('汇聚 · 路由 · 回流')

  await page.getByRole('button', { name: '语言' }).click()
  await page.getByRole('menuitem', { name: 'English' }).click()
  await expect(page.getByRole('button', { name: 'Language' })).toBeVisible()

  await page.getByRole('button', { name: 'Toggle theme' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)

  await page.evaluate(() => {
    const state = window as unknown as { motionSamples: number[]; stopSampling: boolean }
    state.motionSamples = []
    state.stopSampling = false
    const sample = () => {
      const host = document.querySelector('.public-scenery')!
      state.motionSamples.push(new DOMMatrix(getComputedStyle(host).transform).m41)
      if (!state.stopSampling && state.motionSamples.length < 240) requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/sign-in$/)
  await expect(
    page.getByRole('textbox', { name: 'Email', exact: true })
  ).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: 'Language' })).toBeVisible()
  const translation = () => page.locator('.public-scenery').evaluate(element => new DOMMatrix(getComputedStyle(element).transform).m41)
  const targetX = -(page.viewportSize()!.width * 0.08)
  await expect.poll(translation).toBeCloseTo(targetX, 0)
  const motion = await page.evaluate(() => {
    const state = window as unknown as { motionSamples: number[]; stopSampling: boolean; savedCanvas: Element; savedScene: unknown; __ovloadHomepage: unknown }
    state.stopSampling = true
    const matrix = new DOMMatrix(getComputedStyle(document.querySelector('.public-scenery')!).transform)
    return { samples: state.motionSamples, scaleX: matrix.a, scaleY: matrix.d, sameCanvas: state.savedCanvas === document.querySelector('.public-scenery canvas'), sameScene: state.savedScene === state.__ovloadHomepage }
  })
  expect(motion.sameCanvas).toBe(true)
  expect(motion.sameScene).toBe(true)
  expect(motion.scaleX).toBe(1)
  expect(motion.scaleY).toBe(1)
  expect(motion.samples.some(x => x < -1 && x > targetX + 1)).toBe(true)
  await expect(page.locator('.auth-surface')).toHaveCSS('opacity', '1')
  await page.getByRole('link', { name: 'Ovload', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect.poll(translation).toBeCloseTo(0, 0)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/sign-in$/)
  await page.getByRole('link', { name: 'Create an account', exact: true }).click()
  await expect(page).toHaveURL(/\/sign-up$/)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(translation).toBeCloseTo(0, 0)
  const card = await page.locator('.auth-card').boundingBox()
  expect(card!.x + card!.width / 2).toBeCloseTo(195, 0)
  expect(await page.evaluate(() => {
    const state = window as unknown as { savedCanvas: Element }
    return state.savedCanvas === document.querySelector('.public-scenery canvas')
  })).toBe(true)

  expect(errors).toEqual([])
  expect(writes).toEqual([])
})
