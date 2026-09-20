import { expect, test } from '../../web/node_modules/@playwright/test'

test('theme and language preferences survive reload', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '切换语言', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  const before = await page.locator('html').getAttribute('data-theme')
  await page.getByRole('button', { name: /Switch to .* theme/ }).click()
  const after = await page.locator('html').getAttribute('data-theme')
  expect(after).not.toBe(before)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', after!)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
