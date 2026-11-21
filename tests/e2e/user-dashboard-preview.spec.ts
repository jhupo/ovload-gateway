import { expect, test } from '../../web/node_modules/@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('ovload.admin-preview', 'active')
    localStorage.setItem('i18nextLng', 'en')
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

for (const width of [1440, 390]) {
  test(`user dashboard filters, charts and navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/user/dashboard')
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
    await expect(page.getByText('Demo data', { exact: true })).toBeVisible()
    await expect(page.getByRole('table', { name: 'Recent requests' }).locator('tbody tr')).toHaveCount(6)
    await expect(page.getByRole('img', { name: 'Usage trend · Consumption', exact: true }).locator('svg')).toBeVisible()
    const balance = await page.getByTestId('user-metric-balance').innerText()
    const dailyQuota = await page.getByTestId('user-subscription').innerText()
    const requests = await page.getByTestId('user-metric-requests').innerText()
    await page.getByRole('combobox', { name: 'Time range' }).click()
    await page.getByRole('option', { name: 'Last 30 days', exact: true }).click()
    await expect(page.getByTestId('user-metric-requests')).not.toHaveText(requests, { useInnerText: true })
    await expect(page.getByTestId('user-metric-balance')).toHaveText(balance, { useInnerText: true })
    await expect(page.getByTestId('user-subscription')).toHaveText(dailyQuota, { useInnerText: true })
    await page.getByRole('tab', { name: 'Requests', exact: true }).click()
    await expect(page.getByRole('img', { name: 'Usage trend · Requests', exact: true }).locator('svg')).toBeVisible()
    await page.getByRole('tab', { name: 'Token usage', exact: true }).click()
    await expect(page.getByRole('img', { name: 'Usage trend · Token usage', exact: true }).locator('svg')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const boxes = await page.getByTestId('user-overview').locator('[data-slot=card]').evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect()
      return { x: Math.round(box.x), fits: node.scrollWidth <= node.clientWidth }
    }))
    expect(new Set(boxes.map((box) => box.x)).size).toBe(width === 390 ? 2 : 4)
    expect(boxes.every((box) => box.fits)).toBe(true)
    if (width === 390) await page.getByRole('button', { name: 'Open navigation' }).click()
    const sidebar = width === 390 ? page.getByRole('dialog') : page.locator('[data-slot=sidebar-inner]')
    await expect(sidebar.getByRole('link', { name: 'API keys', exact: true })).toHaveAttribute('href', '/user/api-keys')
    await expect(sidebar.getByRole('button', { name: 'Settings', exact: true })).toHaveAttribute('data-state', 'open')
    await expect(sidebar.getByRole('link', { name: 'My orders', exact: true })).toHaveAttribute('href', '/user/orders')
    await expect(sidebar.getByText('Model pricing', { exact: true })).toHaveCount(0)
    await expect(sidebar.getByText('User management', { exact: true })).toHaveCount(0)
    await sidebar.getByRole('link', { name: 'Channel status', exact: true }).click()
    await expect(page).toHaveURL(/\/user\/channel-status$/)
    await expect(page.getByRole('button', { name: 'My account', exact: true })).toBeVisible()
    expect(errors).toEqual([])
  })
}

test('profile edits stay in their workspace and preview switching restores the correct menu', async ({ page }) => {
  await page.goto('/user/settings')
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  await expect(page.getByRole('tab')).toHaveCount(5)
  await expect(page.getByRole('tab', { name: 'Profile', exact: true })).toHaveAttribute('data-state', 'active')
  await expect(page.getByRole('tab', { name: 'My subscriptions', exact: true })).toBeEnabled()
  for (const name of ['My orders', 'Redeem', 'Referral Rewards']) {
    await expect(page.getByRole('tab', { name, exact: true })).toBeEnabled()
  }
  await expect(page.getByTestId('profile-summary')).toContainText('alex@example.com')
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill('Alex Studio')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByTestId('profile-summary')).toContainText('Alex Studio')
  await page.getByRole('button', { name: 'My account', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Administrator view', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.getByRole('button', { name: 'Administrator', exact: true }).click()
  await expect(page.getByRole('menu')).toContainText('admin@example.com')
  await expect(page.getByRole('menu')).not.toContainText('Alex Studio')
  await page.getByRole('menuitem', { name: 'User view', exact: true }).click()
  await expect(page).toHaveURL(/\/user\/dashboard$/)
  await page.getByRole('button', { name: 'My account', exact: true }).click()
  await expect(page.getByRole('menu')).toContainText('Alex Studio')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+k')
  await expect(page.getByRole('option', { name: 'Settings My orders', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).not.toContainText('User management')
  await expect(page.getByRole('option', { name: 'Channel status' })).toBeVisible()
})

test('disabled user pages redirect within the user workspace', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('ovload.channel-monitoring.preview', 'false')
    sessionStorage.setItem('ovload.lottery.preview', 'false')
  })
  await page.goto('/user/channel-status')
  await expect(page).toHaveURL(/\/user\/dashboard$/)
  await expect(page.locator('[data-slot=sidebar-inner]').getByRole('link', { name: 'Channel status', exact: true })).toHaveCount(0)
  await page.goto('/user/lottery')
  await expect(page).toHaveURL(/\/user\/dashboard$/)
})

test('collapsed sidebar settings retains user destinations', async ({ page }) => {
  await page.goto('/user/dashboard')
  await page.locator('[data-slot=sidebar-inner] [data-slot=sidebar-trigger]').click()
  await page.locator('[data-slot=sidebar-inner]').getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: 'My orders', exact: true })).toHaveAttribute('href', '/user/orders')
  await page.getByRole('menuitem', { name: 'Profile', exact: true }).click()
  await expect(page).toHaveURL(/\/user\/settings$/)
  await expect(page.getByTestId('profile-summary')).toContainText('alex@example.com')
})

test('user routes require the development session', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.removeItem('ovload.admin-preview'))
  await page.goto('/user/dashboard')
  await expect(page).toHaveURL(/\/sign-in$/)
})

test('user settings tabs follow referral visibility on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => sessionStorage.setItem('ovload.feature-settings.preview', JSON.stringify({ referrals: false, security_audit: true })))
  await page.goto('/user/settings')
  await expect(page.getByRole('tablist', { name: 'Settings', exact: true })).toHaveAttribute('aria-orientation', 'horizontal')
  await expect(page.getByRole('tab')).toHaveCount(4)
  await expect(page.getByRole('tab', { name: 'Referral Rewards', exact: true })).toHaveCount(0)
  await expect(page.getByTestId('profile-summary')).toContainText('alex@example.com')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await expect(page.getByRole('dialog').getByText('Referral Rewards', { exact: true })).toHaveCount(0)
})
