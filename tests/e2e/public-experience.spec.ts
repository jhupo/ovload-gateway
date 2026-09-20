import { expect, test } from '../../web/node_modules/@playwright/test'

test('particle homepage, theme, language and authentication presentation', async ({ page }, info) => {
  test.setTimeout(90000)
  const errors: string[] = []
  const writes: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'warning' && message.text().includes('Not found')) errors.push(message.text()) })
  page.on('request', request => { if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) writes.push(request.url()) })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Ovload Gateway 首页' })).toBeAttached()
  await expect(page.locator('.gateway-canvas canvas')).toBeVisible()
  await expect(page.locator('.connection-caption')).toHaveText('汇聚 · 路由 · 回流')
  await expect(page.locator('.network-center')).toHaveCount(0)
  await expect.poll(async () => page.evaluate(() => {
    const scene = (window as Window & { __ovloadHomepage?: { inspect(): {
      settled: boolean, centerPresence: number, trunkPresence: number, capturedRoutes: number,
      retiringRoutes: number, maxCapturedRoutes: number, providerCount: number, taskPaths: number,
    } } }).__ovloadHomepage
    return scene ? scene.inspect() : null
  }), { timeout: 25000 }).toMatchObject({
    settled: true,
    centerPresence: 1,
    trunkPresence: 1,
    capturedRoutes: 1,
    maxCapturedRoutes: 20,
    providerCount: 3,
    taskPaths: 3,
  })
  const sceneState = (await page.evaluate(() => (window as Window & { __ovloadHomepage?: { inspect(): { particles: number, captureLanes: number } } }).__ovloadHomepage?.inspect()))!
  expect(sceneState.particles).toBeGreaterThan(10000)
  expect(sceneState.captureLanes).toBeGreaterThanOrEqual(5)
  expect(sceneState.captureLanes).toBeLessThanOrEqual(10)

  await page.evaluate(() => {
    const scene = (window as Window & { __ovloadHomepage?: { reviewCaptureRetention(count: number): void } }).__ovloadHomepage
    scene?.reviewCaptureRetention(20)
  })
  await expect.poll(async () => page.evaluate(() => {
    const scene = (window as Window & { __ovloadHomepage?: { inspect(): { capturedRoutes: number, retiringRoutes: number } } }).__ovloadHomepage
    return scene?.inspect()
  })).toMatchObject({ capturedRoutes: 20 })
  expect(await page.evaluate(() => {
    const scene = (window as Window & { __ovloadHomepage?: { inspect(): { retiringRoutes: number } } }).__ovloadHomepage
    return scene?.inspect().retiringRoutes
  })).toBeGreaterThan(0)
  await expect.poll(async () => page.evaluate(() => {
    const scene = (window as Window & { __ovloadHomepage?: { inspect(): { retiringRoutes: number } } }).__ovloadHomepage
    return scene?.inspect().retiringRoutes
  }), { timeout: 5000 }).toBe(0)

  const initialTheme = await page.locator('html').getAttribute('data-theme')
  await page.getByRole('button', { name: /切换.*主题/ }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', initialTheme!)
  await page.getByRole('button', { name: '切换语言', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Create an account', exact: true }).click()
  await expect(dialog.getByRole('heading', { name: 'Create account', exact: true })).toBeVisible()
  await expect(dialog.getByLabel('Confirm password', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Create account', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/$/)
  await expect(dialog).not.toBeVisible()

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await expect(page.locator('.gateway-tools')).toHaveCSS('opacity', '1')
  await expect(page.locator('.gateway-canvas canvas')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `test-results/home-particles-${info.project.name}.png`, fullPage: true })
  expect(errors).toEqual([])
  expect(writes).toEqual([])
})
