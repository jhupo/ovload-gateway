import { expect, test } from '../../web/node_modules/@playwright/test'

test('library catalog filters, validates and handles overlays without writes', async ({ page }) => {
  test.setTimeout(90000)
  const mutations: string[] = []
  page.on('request', request => { if (['POST','PUT','PATCH','DELETE'].includes(request.method())) mutations.push(request.url()) })
  await page.goto('/test.html')
  await expect(page.getByRole('heading', { name: /让每一次交互，\s*都有恰好的回应。/ })).toBeVisible()
  await page.getByRole('textbox', { name: '搜索示例账号' }).fill('missing')
  await expect(page.getByRole('heading', { name: '没有匹配的账号' })).toBeVisible()
  await page.getByRole('button', { name: '清除筛选' }).click()
  await expect(page.locator('tbody tr')).toHaveCount(3)
  await page.getByLabel('通知邮箱').fill('demo@example.com')
  await expect(page.getByLabel('通知邮箱')).toHaveAttribute('aria-invalid', 'false')
  await page.getByRole('switch', { name: '自动刷新' }).uncheck()
  await expect(page.getByRole('switch', { name: '自动刷新' })).not.toBeChecked()
  const trigger = page.getByRole('button', { name: '预览新建弹窗' })
  await trigger.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await page.locator('.p-dialog-mask').evaluate(el => getComputedStyle(el).backdropFilter)).toContain('blur(12px)')
  await page.screenshot({ path: `test-results/material-modal-${test.info().project.name}.png` })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(trigger).toBeFocused()
  await trigger.click()
  await page.getByRole('button', { name: '确认示例操作' }).click()
  await expect(page.getByText('示例操作已确认', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '打开详情抽屉' }).click()
  await expect(page.getByRole('dialog')).toContainText('账号详情预览')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '状态切换', exact: true }).click()
  await expect(page.getByRole('heading', { name: /自然切换，\s*保持专注。/ })).toBeVisible()
  await page.getByRole('button', { name: '玻璃层次', exact: true }).click()
  expect(await page.locator('.glass-specimen').evaluate(el => getComputedStyle(el).backdropFilter)).toContain('blur(22px)')
  const rippleButton = page.getByRole('button', { name: '体验点击波纹' })
  await rippleButton.evaluate(el => {
    const ink = el.querySelector('[data-p-ink]')
    if (!ink) throw new Error('Library ripple is not mounted')
    const observer = new MutationObserver(() => {
      if (ink.getAttribute('data-p-ink-active') === 'true') {
        el.setAttribute('data-test-ripple-observed', 'true')
        observer.disconnect()
      }
    })
    observer.observe(ink, { attributes: true, attributeFilter: ['data-p-ink-active'] })
  })
  // Wait for the animated card to settle before clicking; observe the brief
  // library state change without depending on assertion polling within 400ms.
  await rippleButton.click()
  await expect(rippleButton).toHaveAttribute('data-test-ripple-observed', 'true')
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await expect(page.getByText('确认配置')).toBeVisible()
  await page.getByRole('button', { name: '确认并继续' }).click()
  await expect(page.getByText('已完成')).toBeVisible()
  await page.getByRole('button', { name: '重新体验' }).click()
  for (const theme of ['dark','light']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: /切换.*主题/ }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/material-${test.info().project.name}-${theme}.png`, fullPage: true })
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await page.locator('.p-skeleton').first().evaluate(el => getComputedStyle(el, '::after').animationName)).toBe('none')
  expect(mutations).toEqual([])
})
