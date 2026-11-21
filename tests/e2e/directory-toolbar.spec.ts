import { expect, test } from '../../web/node_modules/@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('ovload.admin-preview', 'active')
    localStorage.setItem('i18nextLng', 'en')
  })
})
const cases = [
  { url: '/orders/records', filter: 'Status', option: 'Completed' },
  { url: '/subscriptions', filter: 'Status', option: 'Expired' },
  { url: '/orders/plans', filter: 'Status', option: 'Published' },
  { url: '/accounts', filter: 'Provider', option: 'xAI' },
  { url: '/proxies', filter: 'Protocol', option: 'SOCKS5' },
  { url: '/redemption-codes', filter: 'Status', option: 'Disabled' },
  { url: '/announcements', filter: 'Status', option: 'Draft' },
  { url: '/channels/pricing', filter: 'Status', option: 'Disabled' },
]
for (const item of cases) {
  test(
    item.url + ' uses shared categorical filter, view and pagination',
    async ({ page }) => {
      await page.goto(item.url)
      const trigger = page.getByLabel(item.filter, { exact: true })
      await expect(trigger).toBeVisible()
      expect((await trigger.boundingBox())!.height).toBe(32)
      await expect(
        page.getByRole('button', { name: 'View', exact: true }),
      ).toBeVisible()
      await expect(
        page.getByRole('combobox', { name: item.filter, exact: true }),
      ).toHaveCount(0)
      await trigger.click()
      await page.getByRole('option', { name: item.option, exact: true }).click()
      await expect(trigger).toContainText(item.option)
      await expect(trigger).toBeFocused()
      if (item.url === '/accounts') {
        await expect(page).toHaveURL(/provider=xAI/)
        await page.reload()
        await expect(trigger).toContainText('xAI')
      }
      await trigger.click()
      await page
        .getByRole('option', { name: 'Clear filters', exact: true })
        .click()
      await expect(trigger).not.toContainText(item.option)
      await expect(
        page.getByRole('combobox', { name: 'Rows per page', exact: true }),
      ).toBeVisible()
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      await page.setViewportSize({ width: 390, height: 844 })
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
    },
  )
}
test('order filters apply to records and integrate view in the same toolbar on wrapped layouts', async ({
  page,
}) => {
  await page.goto('/orders/records')
  await page.getByLabel('Status', { exact: true }).click()
  await page.getByRole('option', { name: 'Pending', exact: true }).click()
  const table = page.getByRole('table', {
    name: 'Order management',
    exact: true,
  })
  await expect(
    table.getByRole('cell', { name: 'Pending', exact: true }),
  ).not.toHaveCount(0)
  await expect(
    table.getByRole('cell', { name: 'Completed', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'View', exact: true }).click()
  await page
    .getByRole('menuitemcheckbox', { name: 'Payment method', exact: true })
    .click()
  await page.keyboard.press('Escape')
  await expect(
    table.getByRole('columnheader', { name: 'Payment method', exact: true }),
  ).toHaveCount(0)
  await page.setViewportSize({ width: 1024, height: 800 })
  const toolbar = page.locator('[data-slot=table-toolbar]')
  const box = (await toolbar.boundingBox())!
  const view = (await page
    .getByRole('button', { name: 'View', exact: true })
    .boundingBox())!
  expect(view.y).toBeGreaterThanOrEqual(box.y)
  expect(view.y + view.height).toBeLessThanOrEqual(box.y + box.height + 1)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.getByLabel('Status', { exact: true }).click()
  await page.getByRole('option', { name: 'Clear filters', exact: true }).click()
  await expect(page.getByLabel('Status', { exact: true })).toBeFocused()
})

test('usage and monitoring categorical filters retain their filtering behavior', async ({
  page,
}) => {
  await page.goto('/usage')
  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  await page.getByLabel('Provider', { exact: true }).click()
  await page.getByRole('option', { name: 'OpenAI', exact: true }).click()
  await expect(page.getByLabel('Provider', { exact: true })).toContainText(
    'OpenAI',
  )
  await page.getByLabel('Provider', { exact: true }).click()
  await page.getByRole('option', { name: 'Clear filters', exact: true }).click()
  await page.goto('/monitoring')
  const alerts = page.getByTestId('alert-events')
  await alerts.getByLabel('Severity', { exact: true }).click()
  await page.getByRole('option', { name: 'P0', exact: true }).click()
  await expect(
    alerts.getByRole('cell').getByText('P1', { exact: true }),
  ).toHaveCount(0)
  const logs = page.getByTestId('system-logs')
  await logs.getByLabel('Level', { exact: true }).click()
  await page.getByRole('option', { name: 'WARN', exact: true }).click()
  await expect(
    logs.getByRole('cell').getByText('WARN', { exact: true }),
  ).toHaveCount(1)
  await expect(
    logs.getByRole('cell').getByText('ERROR', { exact: true }),
  ).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})
