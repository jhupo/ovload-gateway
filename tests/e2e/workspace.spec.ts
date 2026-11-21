import { expect, test } from '../../web/node_modules/@playwright/test'

test('theme and language preferences survive reload', async ({ page }) => {
  await page.addInitScript(() => {
    if (!window.localStorage.getItem('i18nextLng')) {
      window.localStorage.setItem('i18nextLng', 'en')
    }
    if (!window.localStorage.getItem('vite-ui-theme')) {
      window.localStorage.setItem('vite-ui-theme', 'light')
    }
  })
  await page.goto('/sign-in')

  await page.getByRole('button', { name: 'Language' }).click()
  await page.getByRole('menuitem', { name: '中文' }).click()

  const before = await page.locator('html').getAttribute('class')
  await page.getByRole('button', { name: '切换主题' }).click()
  const after = await page.locator('html').getAttribute('class')
  expect(after).not.toBe(before)

  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark|light/)
  await expect(page.getByRole('button', { name: '语言' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true
  )
})
