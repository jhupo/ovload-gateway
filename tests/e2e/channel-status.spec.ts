import { expect, test } from '../../web/node_modules/@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('ovload.admin-preview', 'active')
    localStorage.setItem('i18nextLng', 'en')
  })
  await page.goto('/channel-status')
})

test('user-facing status board groups channels and switches observation windows', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Channel status', exact: true })).toBeVisible()
  await expect(page.getByText('Sample data', { exact: true })).toBeVisible()
  await expect(page.getByText(/Sample time/)).toBeVisible()
  await expect(page.getByRole('heading', { level: 3 })).toHaveCount(14)
  await expect(page.getByRole('heading', { name: 'OpenAI API', exact: true })).toBeVisible()
  const platformInsets = await page.getByRole('heading', { name: 'OpenAI API', exact: true }).evaluate((heading) => {
    const style = getComputedStyle(heading.parentElement!.parentElement!)
    return { top: style.paddingTop, bottom: style.paddingBottom }
  })
  expect(platformInsets.top).toBe(platformInsets.bottom)
  await expect(page.getByRole('heading', { name: 'Codex', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Grok API', level: 2, exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: '90m', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '90m', exact: true }).click()
  const firstHistory = page.locator('[role="img"]').first()
  await expect(firstHistory).toHaveAttribute('aria-label', /18 status intervals/)
  await firstHistory.locator('[data-slot="tooltip-trigger"]').first().hover()
  await expect(page.getByRole('tooltip')).toContainText('Availability')
  await expect(page.getByRole('tooltip')).toContainText('First token')
  await expect(page.getByRole('link', { name: 'Monitoring settings', exact: true })).toHaveCount(0)
})

test('status cards remain aligned on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await expect(page.getByRole('heading', { level: 3 })).toHaveCount(14)
  await expect(page.getByRole('button', { name: /View status details/ })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
})

test('invalid saved drafts remain untouched while the board uses visible defaults', async ({ page }) => {
  await page.evaluate(() => sessionStorage.setItem('ovload.channel-monitoring.draft', '{invalid'))
  await page.reload()
  await expect(page.getByRole('heading', { level: 3 })).toHaveCount(14)
  expect(await page.evaluate(() => sessionStorage.getItem('ovload.channel-monitoring.draft'))).toBe('{invalid')
})
