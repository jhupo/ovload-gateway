import { expect, test } from '../../web/node_modules/@playwright/test'

for (const locale of ['en', 'zh']) {
  for (const width of [1440, 390]) {
    test(`settings content stays aligned when profile actions unmount: ${locale}, ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript((language) => {
        sessionStorage.setItem('ovload.admin-preview', 'active')
        localStorage.setItem('i18nextLng', language)
      }, locale)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto('/user/settings')
      const heading = page.locator('main > [data-slot=page-heading]')
      const navigation = page.getByRole('tablist', { name: locale === 'en' ? 'Settings' : '设置', exact: true })
      await expect(heading.getByRole('button', { name: locale === 'en' ? 'Save' : '保存', exact: true })).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      const original = await heading.boundingBox()
      const tabPosition = await navigation.boundingBox()
      const tabs = locale === 'en'
        ? ['My subscriptions', 'My orders', 'Redeem', 'Profile']
        : ['我的订阅', '我的订单', '兑换', '个人资料']
      for (const name of tabs) {
        await navigation.getByRole('tab', { name, exact: true }).click()
        await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
        await expect.poll(async () => (await heading.boundingBox())?.height).toBe(original!.height)
        expect((await navigation.boundingBox())!.y).toBe(tabPosition!.y)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true)
        const content = page.locator('[class*="@container/profile"]').locator('..')
        await content.evaluate((element) => { element.scrollTop = element.scrollHeight })
        await expect.poll(() => content.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThanOrEqual(1)
        expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true)
      }
    })
  }
}

test('CNY purchase prices and OVL quotas remain separate across the user flow', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('ovload.admin-preview', 'active')
    localStorage.setItem('i18nextLng', 'en')
  })
  await page.goto('/user/recharge')
  const summary = page.getByTestId('recharge-order-summary')
  await expect(summary.getByTestId('recharge-balance')).toHaveText('OVL 39.12')
  await expect(summary.getByTestId('recharge-payment-total')).toHaveText(/CNY\s10\.00/)
  await expect(summary.getByTestId('recharge-credit')).toHaveText('OVL 10.00')
  await expect(page.locator('main')).not.toContainText('USD')
  await page.getByRole('tab', { name: 'Subscription plans', exact: true }).click()
  const plan = page.getByTestId('available-plan').first()
  await expect(plan).toContainText(/CNY\s29\.00/)
  await expect(plan).toContainText('OVL 100.00')
  await page.goto('/user/subscriptions')
  await expect(page.locator('main')).toContainText(/CNY\s59\.00/)
  await expect(page.locator('main')).toContainText('OVL')
  await expect(page.locator('main')).not.toContainText('USD')
  await page.goto('/user/settings')
  await expect(page.getByTestId('profile-summary')).toContainText('OVL 39.12')
})
