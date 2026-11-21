import { expect, test } from '../../web/node_modules/@playwright/test'

for (const width of [1440, 390]) {
  test(`user header persists and nested subscription tabs stay horizontal at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.addInitScript(() => {
      sessionStorage.setItem('ovload.admin-preview', 'active')
      localStorage.setItem('i18nextLng', 'en')
    })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/user/settings')
    const header = page.getByTestId('user-workspace-header')
    const originalHeader = await header.elementHandle()
    const originalHeaderTop = (await header.boundingBox())!.y
    const settings = page.getByRole('tablist', { name: 'Settings', exact: true })
    const originalSettings = await settings.elementHandle()
    const animation = page.evaluate(async () => {
      const samples: string[] = []
      const start = performance.now()
      while (performance.now() - start < 1200) {
        const indicator = document.querySelector('[data-slot=tabs-active-background]')
        if (indicator) samples.push(getComputedStyle(indicator).transform)
        await new Promise(requestAnimationFrame)
      }
      return samples
    })
    await page.getByRole('tab', { name: 'My subscriptions', exact: true }).click()
    await expect(page).toHaveURL(/\/user\/subscriptions$/)
    expect(await originalSettings!.evaluate((element) => element.isConnected)).toBe(true)
    expect((await animation).some((transform) => transform !== 'none' && transform !== 'matrix(1, 0, 0, 1, 0, 0)')).toBe(true)
    const views = page.getByRole('tablist', { name: 'Subscription views', exact: true })
    await expect(views).toHaveAttribute('aria-orientation', 'horizontal')
    await expect(views).toHaveCSS('flex-direction', 'row')
    const current = await views.getByRole('tab', { name: /Current subscriptions/ }).boundingBox()
    const history = await views.getByRole('tab', { name: /Subscription history/ }).boundingBox()
    expect(Math.abs(current!.y - history!.y)).toBeLessThan(2)
    expect(history!.x).toBeGreaterThan(current!.x)

    for (const name of ['API keys', 'Dashboard', 'Channel status']) {
      if (width === 390) await page.getByRole('button', { name: 'Open navigation' }).click()
      const navigation = width === 390 ? page.getByRole('dialog') : page.locator('[data-slot=sidebar-inner]')
      await navigation.getByRole('link', { name, exact: true }).click()
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
      await expect(page.locator('header')).toHaveCount(1)
      expect(await originalHeader!.evaluate((element) => element.isConnected)).toBe(true)
      const theme = header.getByRole('button', { name: 'Toggle theme', exact: true })
      const language = header.getByRole('button', { name: 'Language', exact: true })
      const account = header.getByRole('button', { name: 'My account', exact: true })
      await expect(theme).toBeVisible()
      await expect(language).toBeVisible()
      const boxes = await Promise.all([theme.boundingBox(), language.boundingBox(), account.boundingBox()])
      expect(boxes[0]!.x).toBeGreaterThan(width - 180)
      expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x)
      expect(boxes[1]!.x).toBeLessThan(boxes[2]!.x)
      expect((await header.boundingBox())!.y).toBe(originalHeaderTop)
    }
    await header.getByRole('button', { name: 'Language', exact: true }).click()
    await page.getByRole('menuitem', { name: '中文', exact: true }).click()
    await expect(header.getByRole('button', { name: '语言', exact: true })).toBeVisible()
    await header.getByRole('button', { name: '切换主题', exact: true }).click()
  })
}
