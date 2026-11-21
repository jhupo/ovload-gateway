import { expect, test } from '../../web/node_modules/@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('ovload.admin-preview', 'active')
    localStorage.setItem('i18nextLng', 'en')
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/user/recharge')
  await page.evaluate(async () => {
    const { createPaymentDraft, paymentStorageKey } = await import('/src/features/payment-settings/draft.ts')
    const draft = createPaymentDraft()
    draft.enabled = true
    sessionStorage.setItem(paymentStorageKey, JSON.stringify(draft))
  })
})

for (const width of [1440, 390]) {
  test(`settings and recharge share navigation and editor spacing at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    async function bounds() {
      const nav = await page.getByRole('tablist').locator('..').boundingBox()
      const heading = await page.locator('main h3').first().locator('..').boundingBox()
      return { nav, heading }
    }
    await page.goto('/user/settings')
    await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible()
    const settings = await bounds()
    await page.goto('/user/recharge')
    await expect(page.getByRole('textbox', { name: 'Custom amount', exact: true })).toBeVisible()
    const recharge = await bounds()
    for (const part of ['nav', 'heading'] as const) {
      for (const dimension of ['x', 'y', 'width', 'height'] as const) {
        expect(Math.abs(settings[part]![dimension] - recharge[part]![dimension])).toBeLessThan(1)
      }
    }
    const presets = await page.getByRole('radiogroup', { name: 'Preset amounts' }).boundingBox()
    const custom = await page.getByRole('textbox', { name: 'Custom amount', exact: true }).boundingBox()
    expect(Math.abs(presets!.width - custom!.width)).toBeLessThan(1)
    const scroll = page.locator('main .faded-bottom')
    expect(await scroll.evaluate(element => element.scrollWidth - element.clientWidth)).toBe(0)
    if (width === 1440) {
      const summary = await page.getByTestId('recharge-order-summary').boundingBox()
      const methods = await page.getByRole('radiogroup', { name: 'Payment method', exact: true }).boundingBox()
      const orderHeading = await page.getByRole('heading', { name: 'Order details', exact: true }).boundingBox()
      const amountHeading = await page.getByRole('radiogroup', { name: 'Preset amounts' }).locator('..').locator('legend').boundingBox()
      expect(summary!.width).toBeLessThanOrEqual(384)
      expect(Math.abs(summary!.x - presets!.x - presets!.width - 48)).toBeLessThan(1)
      expect(Math.abs(summary!.y - presets!.y)).toBeLessThan(1)
      expect(Math.abs(orderHeading!.y - amountHeading!.y)).toBeLessThan(1)
      expect(Math.abs(summary!.y + summary!.height - methods!.y - methods!.height)).toBeLessThan(1)
    }
    await page.getByRole('tab', { name: 'Subscription plans', exact: true }).click()
    const subscriptions = await bounds()
    expect(subscriptions.heading!.height).toBe(recharge.heading!.height)
    expect(subscriptions.heading!.y).toBe(recharge.heading!.y)
  })
}

test('recharge validates amounts and reviews orders without payments or balance changes', async ({ page }) => {
  const writes: string[] = []
  page.on('request', (request) => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url()) })
  await page.goto('/user/dashboard')
  await page.getByRole('link', { name: 'Recharge / Subscribe', exact: true }).click()
  await expect(page).toHaveURL(/\/user\/recharge$/)
  const balance = await page.getByTestId('recharge-balance').innerText()
  const amount = page.getByRole('textbox', { name: 'Custom amount', exact: true })
  const preview = page.getByRole('button', { name: /^Confirm payment/ })
  const presets = page.getByRole('radiogroup', { name: 'Preset amounts' })
  await expect(presets.getByRole('radio')).toHaveCount(12)
  const rows = await presets.getByRole('radio').evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().top)))
  expect(new Set(rows).size).toBe(4)
  await expect(page.getByTestId('recharge-order-summary').getByTestId('recharge-credit')).toContainText('OVL 10.00')
  for (const [value, label] of [['5000', 'CNY 5,000.00'], ['8000', 'CNY 8,000.00'], ['10000', 'CNY 10,000.00']]) {
    const preset = presets.getByRole('radio', { name: label, exact: true })
    await preset.check()
    await expect(preset).toBeChecked()
    await expect(amount).toHaveValue(value)
    await expect(page.getByTestId('recharge-payment-total')).toContainText(label)
  }
  for (const value of ['0', '1.001', '10000.01']) {
    await amount.fill(value)
    await preview.click()
    await expect(amount).toHaveAttribute('aria-invalid', 'true')
    await expect(amount).toBeFocused()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByTestId('recharge-payment-total')).toHaveText('—')
    await expect(page.getByTestId('recharge-credit')).toHaveText('—')
  }
  await page.getByRole('radio', { name: 'CNY 200.00', exact: true }).check()
  await expect(amount).toHaveValue('200')
  await preview.click()
  const dialog = page.getByRole('dialog', { name: 'Order details', exact: true })
  await expect(dialog).toContainText('CNY 200.00')
  await expect(dialog.getByTestId('recharge-credit')).toContainText('OVL 200.00')
  await expect(dialog.getByRole('button', { name: 'Pay now', exact: true })).toBeDisabled()
  await expect(dialog).toContainText('Payment API not connected')
  await page.keyboard.press('Escape')
  await expect(preview).toBeFocused()
  await expect(page.getByTestId('recharge-balance')).toHaveText(balance)
  await preview.click()
  await page.mouse.click(5, 5)
  await expect(dialog).not.toBeVisible()
  expect(writes).toEqual([])
})

test('published catalog plans open immutable reviews and link to owned subscriptions', async ({ page }) => {
  await page.goto('/user/recharge')
  await page.getByRole('tab', { name: 'Subscription plans', exact: true }).click()
  const plans = page.getByTestId('available-plan')
  await expect(plans).toHaveCount(9)
  await expect(plans.first()).toContainText('Standard')
  await expect(plans.nth(1)).toContainText('Pro')
  await expect(plans.last()).toContainText('Enterprise')
  await expect(plans.first().locator('del')).toHaveText('CNY 39.00')
  await expect(plans.first()).toContainText('Save CNY 10.00')
  await expect(plans.first()).toContainText('Daily quota resets at 00:00 (Asia/Shanghai).')
  await expect(plans.nth(1).locator('del')).toHaveText('CNY 79.00')
  await expect(plans.nth(1)).toContainText('Save CNY 20.00')
  await expect(page.getByRole('heading', { name: 'Starter', exact: true })).toHaveCount(0)
  const preview = plans.first().getByRole('button', { name: 'Preview order', exact: true })
  await preview.click()
  const dialog = page.getByRole('dialog', { name: 'Order details', exact: true })
  await expect(dialog).toContainText('Standard')
  await expect(dialog).toContainText('30 days')
  await expect(dialog).toContainText('CNY 29.00')
  await expect(dialog.getByRole('button', { name: 'Pay now' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Close', exact: true }).last().click()
  await expect(preview).toBeFocused()
  await page.evaluate(async () => {
    const { usePlanCatalog } = await import('/src/features/subscriptions/plan-catalog.ts')
    usePlanCatalog.getState().setPlans((plans) => plans.map((plan, index) => ({
      ...plan,
      originalPriceCents: index === 0 ? 0 : plan.priceCents,
      notes: index === 0 ? 'Public purchase remarks\nSecond line with purchase terms.' : '',
    })))
  })
  await expect(plans.locator('del')).toHaveCount(0)
  await expect(plans.getByText(/^Save CNY/)).toHaveCount(0)
  await expect(plans.first()).toContainText('Public purchase remarks\nSecond line with purchase terms.')
  await expect(plans.last().getByRole('heading', { name: 'Plan remarks', exact: true })).toHaveCount(0)
  await page.evaluate(async () => {
    const { usePlanCatalog } = await import('/src/features/subscriptions/plan-catalog.ts')
    usePlanCatalog.getState().setPlans((plans) => plans.map((plan) => ({ ...plan, published: false })))
  })
  await expect(plans).toHaveCount(0)
  await expect(page.getByText('No subscription plans available', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'My subscriptions', exact: true }).last().click()
  await expect(page).toHaveURL(/\/user\/subscriptions$/)
  await expect(page.getByRole('tab', { name: /Current subscriptions/ })).toContainText('2')
})

test('saved payment policy controls local estimates and disabled or invalid settings are explicit', async ({ page }) => {
  await page.goto('/user/recharge')
  await page.evaluate(async () => {
    // Use the same Vite module as the settings editor to create a valid saved draft.
    const module = await import('/src/features/payment-settings/draft.ts')
    const draft = module.createPaymentDraft()
    draft.enabled = true
    draft.rechargeMultiplier = '0.15'
    draft.feeRate = '2'
    draft.tiers = [{ id: crypto.randomUUID(), amount: '100', percent: '10' }]
    sessionStorage.setItem(module.paymentStorageKey, JSON.stringify(draft))
  })
  await page.reload()
  await page.getByRole('textbox', { name: 'Custom amount' }).fill('100')
  await page.getByRole('button', { name: /^Confirm payment/ }).click()
  await expect(page.getByRole('dialog').getByTestId('recharge-credit')).toContainText('OVL 16.50')
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: 'Subscription plans', exact: true }).click()
  await page.getByTestId('available-plan').first().getByRole('button', { name: 'Preview order' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('CNY 29.58')
  await expect(dialog.getByRole('button', { name: 'Pay now' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await page.evaluate(() => {
    const draft = JSON.parse(sessionStorage.getItem('ovload.payment-settings.v1')!)
    draft.balanceEnabled = false
    sessionStorage.setItem('ovload.payment-settings.v1', JSON.stringify(draft))
  })
  await page.reload()
  await expect(page.getByText('Balance recharge is disabled', { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Custom amount' })).toHaveCount(0)
  await page.evaluate(() => sessionStorage.setItem('ovload.payment-settings.v1', '{invalid'))
  await page.reload()
  await expect(page.locator('[data-sonner-toast]')).toContainText('The saved payment settings could not be fully loaded.')
  await expect(page.getByRole('textbox', { name: 'Custom amount' })).toHaveValue('10')
})

test('mobile tabs, amounts, review and shared header fit without document overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/user/recharge')
  await expect(page.getByTestId('user-workspace-header').getByRole('button', { name: 'Toggle theme', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('textbox', { name: 'Custom amount' }).fill('123.45')
  await page.getByRole('button', { name: /^Confirm payment/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: 'Subscription plans', exact: true }).click()
  await expect(page.getByTestId('available-plan')).toHaveCount(9)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('tab', { name: 'Balance recharge', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Custom amount' })).toHaveValue('123.45')
})

test('saved Alipay and WeChat availability controls selection and every review', async ({ page }) => {
  await page.goto('/payment-settings')
  await page.getByRole('tab', { name: 'WeChat Pay', exact: true }).click()
  await page.getByRole('switch', { name: 'Enable WeChat Pay', exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('[data-sonner-toast]')).toContainText('Payment settings draft saved')
  await page.goto('/user/recharge')
  const methods = page.getByRole('radiogroup', { name: 'Payment method', exact: true })
  await expect(methods.getByRole('radio')).toHaveCount(2)
  await expect(methods.getByRole('radio', { name: 'Alipay', exact: true })).toBeChecked()
  await methods.getByRole('radio', { name: 'WeChat Pay', exact: true }).check()
  await expect(page.getByTestId('recharge-selected-method')).toHaveText('WeChat Pay')
  await page.getByRole('textbox', { name: 'Custom amount', exact: true }).fill('200')
  await expect(page.getByTestId('recharge-payment-total')).toContainText('CNY 200.00')
  await page.getByRole('button', { name: /^Confirm payment/ }).click()
  await expect(page.getByRole('dialog')).toContainText('WeChat Pay')
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: 'Subscription plans', exact: true }).click()
  await page.getByTestId('available-plan').first().getByRole('button', { name: 'Preview order', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('radio', { name: 'WeChat Pay', exact: true })).toBeChecked()
  await dialog.getByRole('radio', { name: 'Alipay', exact: true }).check()
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: 'Balance recharge', exact: true }).click()
  await expect(methods.getByRole('radio', { name: 'Alipay', exact: true })).toBeChecked()
  await expect(page.getByRole('textbox', { name: 'Custom amount', exact: true })).toHaveValue('200')
  await page.evaluate(() => {
    const key = 'ovload.payment-settings.v1'
    const draft = JSON.parse(sessionStorage.getItem(key)!)
    draft.enabled = false
    sessionStorage.setItem(key, JSON.stringify(draft))
  })
  await page.reload()
  await expect(methods.getByRole('radio')).toHaveCount(1)
  await expect(methods.getByRole('radio', { name: 'WeChat Pay', exact: true })).toBeChecked()
  await page.evaluate(() => {
    const key = 'ovload.payment-settings.v1'
    const draft = JSON.parse(sessionStorage.getItem(key)!)
    draft.wechatEnabled = false
    sessionStorage.setItem(key, JSON.stringify(draft))
  })
  await page.reload()
  await expect(page.getByText('No payment methods available', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Confirm payment/ })).toBeDisabled()
})
