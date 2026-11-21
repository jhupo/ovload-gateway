import { expect, test } from '../../web/node_modules/@playwright/test'

const key = 'ovload.channel-monitoring.draft'
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('ovload.admin-preview', 'active')
    localStorage.setItem('i18nextLng', 'en')
  })
  await page.goto('/page-settings')
  await page.getByRole('tab', { name: 'Channel monitoring', exact: true }).click()
})

test('group and error selections apply to tables without duplicates, and save across reload', async ({ page }) => {
  const save = page.getByRole('button', { name: 'Save', exact: true }).filter({ visible: true })
  const groups = page.getByTestId('channel-monitoring-groups')
  const errors = page.getByTestId('channel-monitoring-errors')
  await expect(save).toBeDisabled()
  await expect(groups.getByText('No entries', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Add monitoring group', exact: true }).click()
  let dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Add to draft' })).toBeDisabled()
  await dialog.getByRole('combobox').click()
  await page.getByRole('option', { name: 'OpenAI Standard', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Add to draft' }).click()
  await expect(page.getByRole('button', { name: 'Add monitoring group', exact: true })).toBeFocused()
  await expect(groups.getByRole('cell', { name: 'OpenAI Standard', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Add monitoring group', exact: true }).click()
  await dialog.getByRole('combobox').click()
  await expect(page.getByRole('option', { name: 'OpenAI Standard', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Add ignored error', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByRole('combobox').click()
  await page.getByRole('option', { name: 'Timeout', exact: true }).click()
  await dialog.getByRole('button', { name: 'Add to draft' }).click()
  await expect(errors.getByRole('cell', { name: 'Timeout', exact: true })).toBeVisible()
  await groups.getByRole('textbox').fill('missing')
  await expect(groups.getByRole('cell', { name: 'OpenAI Standard', exact: true })).toHaveCount(0)
  await groups.getByRole('textbox').fill('')
  await save.click()
  await expect(save).toBeDisabled()
  expect(await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), key)).toMatchObject({ version: 1, groupIds: ['group-1'], ignoredErrors: ['timeout'] })
  await page.reload()
  await page.getByRole('tab', { name: 'Channel monitoring', exact: true }).click()
  await expect(groups.getByRole('cell', { name: 'OpenAI Standard', exact: true })).toBeVisible()
  await expect(errors.getByRole('cell', { name: 'Timeout', exact: true })).toBeVisible()
  const remove = groups.getByRole('button', { name: 'Remove OpenAI Standard', exact: true })
  await remove.click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(remove).toBeFocused()
  await remove.click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove from draft' }).click()
  await expect(page.getByRole('button', { name: 'Add monitoring group', exact: true })).toBeFocused()
  await expect(groups.getByRole('cell', { name: 'OpenAI Standard', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Discard changes', exact: true }).filter({ visible: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Discard changes', exact: true }).click()
  await expect(groups.getByRole('cell', { name: 'OpenAI Standard', exact: true })).toBeVisible()
})

test('threshold validation focuses errors and permits boundary values', async ({ page }) => {
  const save = page.getByRole('button', { name: 'Save', exact: true }).filter({ visible: true })
  for (const item of [
    { label: 'Minimum samples', invalid: ['0', '0.5', '1000001', ''], valid: '1000000' },
    { label: 'Error warning %', invalid: ['-1', '101', '0.001'], valid: '5.25' },
    { label: 'TTFT target ms', invalid: ['-1', '0.5', '3600001'], valid: '0' },
  ]) {
    for (const bad of item.invalid) {
      await page.getByLabel(item.label, { exact: true }).fill(bad)
      await save.click()
      await expect(page.getByLabel(item.label, { exact: true })).toHaveAttribute('aria-invalid', 'true')
      await expect(page.getByLabel(item.label, { exact: true })).toBeFocused()
      expect(await page.evaluate((key) => sessionStorage.getItem(key), key)).toBeNull()
    }
    await page.getByLabel(item.label, { exact: true }).fill(item.valid)
  }
  await page.getByLabel('Cache critical %', { exact: true }).fill('90')
  await save.click()
  await expect(page.getByLabel('Cache warning %', { exact: true })).toBeFocused()
  await page.getByLabel('Cache critical %', { exact: true }).fill('60')
  await save.click()
  await expect(save).toBeDisabled()
  await page.getByLabel('Minimum samples', { exact: true }).fill('99')
  await page.getByRole('link', { name: 'Channel status', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Keep editing', exact: true }).click()
  await expect(page).toHaveURL(/page-settings/)
})

test('storage failures keep the monitoring draft unsaved', async ({ page }) => {
  const save = page.getByRole('button', { name: 'Save', exact: true }).filter({ visible: true })
  await page.getByLabel('Minimum samples', { exact: true }).fill('51')
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'ovload.channel-monitoring.draft') throw new DOMException('storage blocked', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  await save.click()
  await expect(save).toBeEnabled()
  expect(await page.evaluate((key) => sessionStorage.getItem(key), key)).toBeNull()
  await page.getByRole('tab', { name: 'Channel monitoring', exact: true }).click()
  await expect(page.getByLabel('Minimum samples', { exact: true })).toHaveValue('51')
})

test('malformed stored drafts are reported and preserved', async ({ page }) => {
  await page.evaluate((key) => sessionStorage.setItem(key, '{'), key)
  await page.reload()
  await page.getByRole('tab', { name: 'Channel monitoring', exact: true }).click()
  await expect(page.getByLabel('Minimum samples', { exact: true })).toHaveValue('50')
  await expect(page.getByText('The stored monitoring draft could not be loaded. Defaults are shown; stored data has been preserved.', { exact: true })).toBeVisible()
  expect(await page.evaluate((key) => sessionStorage.getItem(key), key)).toBe('{')
})

test('page switch immediately controls navigation and direct access, and persists across reload', async ({ page }) => {
  const toggle = page.getByRole('switch', { name: 'Channel status page', exact: true })
  const statusLink = page.getByRole('link', { name: 'Channel status', exact: true })
  await expect(toggle).toBeChecked()
  await expect(statusLink).toBeVisible()
  await toggle.click()
  await expect(toggle).not.toBeChecked()
  await expect(statusLink).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Save', exact: true }).filter({ visible: true })).toBeDisabled()
  await page.reload()
  await expect(toggle).not.toBeChecked()
  await page.goto('/channel-status')
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(statusLink).toHaveCount(0)
  await page.goto('/page-settings')
  await toggle.click()
  await expect(statusLink).toBeVisible()
  await statusLink.click()
  await expect(page.getByRole('heading', { name: 'Channel status', exact: true })).toBeVisible()
  await page.goto('/feature-settings')
  await expect(page.getByRole('tab', { name: 'Channel monitoring', exact: true })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Security audit', exact: true })).toHaveAttribute('data-state', 'active')
  await expect(page.getByRole('tab', { name: 'Model pricing', exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: 'Page switches', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Page switches', exact: true })).toBeVisible()
})

test('switch storage failure preserves the enabled page and pending threshold changes', async ({ page }) => {
  await page.getByLabel('Minimum samples', { exact: true }).fill('51')
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'ovload.channel-monitoring.preview') throw new DOMException('storage blocked', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  await page.getByRole('switch', { name: 'Channel status page', exact: true }).click()
  await expect(page.getByRole('switch', { name: 'Channel status page', exact: true })).toBeChecked()
  await expect(page.getByRole('link', { name: 'Channel status', exact: true })).toBeVisible()
  await expect(page.getByText('Unable to save the switch. Check browser storage permissions', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Minimum samples', { exact: true })).toHaveValue('51')
  await expect(page.getByRole('button', { name: 'Save', exact: true }).filter({ visible: true })).toBeEnabled()
})
