import { expect, test } from '../../web/node_modules/@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('ovload.admin-preview', 'active')
    localStorage.setItem('i18nextLng', 'en')
  })
  await page.goto('/data-backup')
})

test('preserves form values across tabs without persisting or sending credentials', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (request) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
      requests.push(request.url())
    }
  })
  await expect(page.getByRole('heading', { name: 'Data backup', exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Storage configuration', exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Scheduled backup', exact: true })).toBeVisible()
  const storageHeader = page.locator('[data-slot="card-header"]').filter({ has: page.getByRole('heading', { name: 'S3 storage', exact: true }) })
  const storageSwitch = storageHeader.getByRole('switch', { name: 'Enable S3 storage', exact: true })
  await expect(storageSwitch).not.toBeChecked()
  await storageSwitch.check()
  await expect(page.getByRole('switch', { name: 'Enable async object storage', exact: true })).not.toBeChecked()
  await page.locator('#backup-endpoint').fill('https://storage.example.com')
  await page.locator('#backup-secret-key').fill('synthetic-secret-for-test')
  await expect(page.getByRole('button', { name: 'Test connection', exact: true }).first()).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Save', exact: true }).first()).toBeDisabled()

  await page.getByRole('tab', { name: 'Scheduled backup', exact: true }).click()
  await expect(page.getByRole('switch', { name: 'Enable scheduled backup', exact: true })).not.toBeChecked()
  await expect(page.getByLabel('Cron expression', { exact: true })).toHaveValue('0 2 * * *')
  await expect(page.locator('#backup-expiration')).toHaveValue('14')
  await expect(page.getByLabel('Backup expiration (days)', { exact: true })).toHaveCount(1)
  await expect(page.getByText('Timezone: UTC', { exact: true })).toHaveCount(0)
  await page.getByLabel('Maximum retained copies', { exact: true }).fill('0')
  await page.getByRole('switch', { name: 'Enable scheduled backup', exact: true }).click()

  await page.getByRole('tab', { name: 'Storage configuration', exact: true }).click()
  await expect(page.locator('#backup-endpoint')).toHaveValue('https://storage.example.com')
  await expect(page.locator('#backup-secret-key')).toHaveValue('synthetic-secret-for-test')
  await expect(storageSwitch).toBeChecked()
  await page.getByRole('tab', { name: 'Scheduled backup', exact: true }).click()
  await expect(page.getByLabel('Maximum retained copies', { exact: true })).toHaveValue('0')
  await expect(page.getByRole('switch', { name: 'Enable scheduled backup', exact: true })).toBeChecked()
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('synthetic-secret-for-test')
  expect(requests).toEqual([])

  await page.reload()
  await expect(page.locator('#backup-secret-key')).toHaveValue('')
  await expect(storageSwitch).not.toBeChecked()
})

test('keeps image storage independent without path-style or reuse options', async ({ page }) => {
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await page.getByRole('switch', { name: 'Enable async object storage', exact: true }).check()
  await expect(page.getByRole('switch', { name: 'Enable S3 storage', exact: true })).not.toBeChecked()
  await page.locator('#backup-endpoint').fill('https://backup-storage.example.com')
  await page.locator('#backup-bucket').fill('demo-backups')
  await page.locator('#image-bucket').fill('demo-images')
  await page.locator('#image-prefix').fill('generated/')
  await page.locator('#image-endpoint').fill('https://images-storage.example.com')
  await page.getByRole('tab', { name: 'Scheduled backup', exact: true }).click()
  await page.getByRole('tab', { name: 'Storage configuration', exact: true }).click()
  await expect(page.locator('#backup-endpoint')).toHaveValue('https://backup-storage.example.com')
  await expect(page.locator('#backup-bucket')).toHaveValue('demo-backups')
  await expect(page.locator('#image-bucket')).toHaveValue('demo-images')
  await expect(page.locator('#image-prefix')).toHaveValue('generated/')
  await expect(page.locator('#image-endpoint')).toHaveValue('https://images-storage.example.com')
})

test('filters synthetic records and keeps server operations unavailable', async ({ page }) => {
  await page.getByRole('tab', { name: 'Scheduled backup', exact: true }).click()
  const table = page.getByRole('table', { name: 'Backup records', exact: true })
  await expect(table.getByRole('row')).toHaveCount(4)
  await expect(page.getByText('Synthetic preview records; backup operations are not connected.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create backup', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Restore', exact: true }).first()).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Delete', exact: true }).first()).toBeDisabled()
  await page.getByRole('textbox', { name: 'Search backup files', exact: true }).fill('20261017')
  await expect(table.getByRole('row')).toHaveCount(2)
  await expect(table.getByText('ovload_20261017_020000.sql.gz', { exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'Search backup files', exact: true }).fill('no-matching-file')
  await expect(table.getByRole('row')).toHaveCount(2)
  await expect(table.getByText('No data', { exact: true })).toBeVisible()
})
