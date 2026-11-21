import { expect, test } from '../../web/node_modules/@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('ovload.admin-preview', 'active')
    localStorage.setItem('i18nextLng', 'en')
  })
})

for (const [locale, title] of [['en', 'My orders'], ['zh', '我的订单']]) {
  test(`command search matches translated settings titles in ${locale}`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem('i18nextLng', value), locale)
    await page.goto('/user/dashboard')
    await expect(page.getByTestId('user-workspace-header')).toBeVisible()
    await page.keyboard.press('Control+k')
    const search = page.locator('[cmdk-input]')
    await search.fill(title)
    const result = page.getByRole('option').filter({ hasText: title })
    await expect(result).toHaveCount(1)
    await search.fill('orders')
    await expect(result).toHaveCount(1)
    await result.click()
    await expect(page).toHaveURL(/\/user\/orders$/)
  })
}

test('subscription history keeps keyboard focus after sorting in both directions', async ({ page }) => {
  await page.goto('/user/subscriptions')
  await page.getByRole('tab', { name: /Subscription history/ }).click()
  const table = page.getByRole('table', { name: 'Subscription history', exact: true })
  const sort = table.getByRole('button', { name: 'Expires (UTC)', exact: true })
  for (const [direction, first] of [['Asc', 'Starter'], ['Desc', 'Pro']]) {
    await sort.focus()
    await page.keyboard.press('Enter')
    await page.getByRole('menuitem', { name: direction, exact: true }).click()
    await expect(sort).toBeFocused()
    await expect(table.locator('tbody tr').first()).toContainText(first)
  }
})

for (const width of [1440, 390]) {
  for (const flow of ['orders', 'recharge']) {
    test(`${flow} retains content through dialog exit at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 })
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await page.goto(`/user/${flow}`)
      if (flow === 'recharge') {
        await page.evaluate(async () => {
          const { createPaymentDraft, paymentStorageKey } = await import('/src/features/payment-settings/draft.ts')
          const draft = createPaymentDraft()
          draft.enabled = true
          sessionStorage.setItem(paymentStorageKey, JSON.stringify(draft))
        })
        await page.reload()
      }
      const trigger = flow === 'orders'
        ? page.locator('[data-order-detail]').first()
        : page.getByTestId('recharge-order-summary').getByRole('button')
      const scroller = flow === 'orders' ? page.getByRole('table').locator('..') : null
      await scroller?.evaluate(element => { element.scrollLeft = element.scrollWidth })
      await trigger.click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.locator('dl')).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      await expect.poll(() => dialog.evaluate(element => getComputedStyle(element).opacity)).toBe('1')
      const height = await dialog.evaluate(element => (element as HTMLElement).offsetHeight)
      const frames = await dialog.evaluateHandle(element => {
        const snapshots: { height: number; hasContent: boolean }[] = []
        const sample = () => {
          if (element.isConnected && element.getAttribute('data-state') === 'closed') {
            snapshots.push({ height: (element as HTMLElement).offsetHeight, hasContent: !!element.querySelector('dl') })
          }
        }
        const observer = new MutationObserver(sample)
        observer.observe(element, { attributes: true, childList: true, subtree: true })
        const frame = () => {
          sample()
          if (element.isConnected) requestAnimationFrame(frame)
          else observer.disconnect()
        }
        requestAnimationFrame(frame)
        return snapshots
      })
      await page.keyboard.press('Escape')
      await expect(dialog).not.toBeAttached()
      const exit = await frames.jsonValue()
      await frames.dispose()
      expect(exit.length).toBeGreaterThan(0)
      expect(exit).toEqual(Array.from({ length: exit.length }, () => ({ height, hasContent: true })))
      await expect(trigger).toBeFocused()
      await trigger.click()
      await expect(page.getByRole('dialog').locator('dl')).toBeVisible()
      await page.mouse.click(1, 1)
      await expect(page.getByRole('dialog')).not.toBeAttached()
      await expect(trigger).toBeFocused()
    })
  }
}
