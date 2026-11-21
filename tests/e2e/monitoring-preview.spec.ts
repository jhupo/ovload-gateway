import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '../../web/node_modules/@playwright/test'

for (const mobile of [false, true]) {
  test(`operations monitoring ${mobile ? 'mobile' : 'desktop'}`, async ({ page }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' })
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en'))
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/monitoring')
    await expect(page).toHaveURL(/\/sign-in$/)
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill('preview')
    await page.getByLabel('Password', { exact: true }).fill('preview')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    if (mobile) await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Tasks', exact: true })).toHaveCount(0)
    await page.getByRole('link', { name: 'Operations monitoring', exact: true }).click()
    await expect(page).toHaveURL(/\/monitoring$/)
    const content = page.getByTestId('monitoring-content')
    const overview = content.getByTestId('request-overview')
    const system = content.getByTestId('system-status')
    const activeRequests = content.getByTestId('active-requests')
    const throughput = content.getByTestId('provider-throughput')
    const checkLayout = async (expectedActiveRows: number) => {
      await page.mouse.move(1, 1)
      await expect(content).toHaveCount(1)
      await expect(page.getByTestId('monitoring-panel')).toHaveCount(0)
      await expect(overview.getByTestId('request-metric')).toHaveCount(4)
      await expect(overview.getByRole('button', { name: /^(Details|明细):/ })).toHaveCount(4)
      for (const button of await overview.getByRole('button').all()) {
        const box = (await button.boundingBox())!
        expect(box.height).toBeGreaterThanOrEqual(36)
        expect(box.width).toBeGreaterThanOrEqual(36)
      }
      await expect(overview.locator('[data-kind="request-errors"]')).toHaveCount(1)
      await expect(overview.locator('[data-kind="upstream-errors"]')).toHaveCount(1)
      await expect(overview.locator('[data-kind="latency"]')).toHaveCount(1)
      const requestBoxes = await overview.getByTestId('request-metric').evaluateAll(nodes => nodes.map(node => {
        const { x, y } = node.getBoundingClientRect()
        return { x, y, fits: node.scrollWidth <= node.clientWidth }
      }))
      expect(new Set(requestBoxes.map(box => Math.round(box.x))).size).toBe(mobile ? 2 : 4)
      expect(new Set(requestBoxes.map(box => Math.round(box.y))).size).toBe(mobile ? 2 : 1)
      expect(requestBoxes.every(box => box.fits)).toBe(true)
      const requestTransitionDurations = await overview
        .getByTestId('request-metric')
        .evaluateAll(nodes =>
          nodes.map(node => getComputedStyle(node).transitionDuration)
        )
      expect(requestTransitionDurations.every(duration => duration === '0s')).toBe(true)
      await expect(system.getByTestId('system-card')).toHaveCount(6)
      const systemBoxes = await system.getByTestId('system-card').evaluateAll(nodes => nodes.map(node => {
        const { x, y } = node.getBoundingClientRect()
        return { x, y, fits: node.scrollWidth <= node.clientWidth }
      }))
      expect(new Set(systemBoxes.map(box => Math.round(box.x))).size).toBe(mobile ? 2 : 6)
      expect(new Set(systemBoxes.map(box => Math.round(box.y))).size).toBe(mobile ? 3 : 1)
      expect(systemBoxes.every(box => box.fits)).toBe(true)
      await expect(activeRequests.getByTestId('active-request-row')).toHaveCount(
        expectedActiveRows
      )
      const tableContainer = activeRequests.locator(
        '[data-slot="table-container"]'
      )
      expect(
        await tableContainer.evaluate(
          (element) => element.scrollWidth === element.clientWidth
        )
      ).toBe(true)
      if (expectedActiveRows === 6) {
        expect(
          await tableContainer.evaluate(
            (element) => element.scrollHeight > element.clientHeight
          )
        ).toBe(true)
      }
      await expect(throughput.getByRole('img').locator('svg')).toBeVisible()
      const overviewBox = await overview.boundingBox()
      const systemBox = await system.boundingBox()
      const activeRequestsBox = await activeRequests.boundingBox()
      const throughputBox = await throughput.boundingBox()
      if (mobile) {
        expect(activeRequestsBox!.height).toBeLessThanOrEqual(256)
        if (expectedActiveRows === 1) expect(activeRequestsBox!.height).toBeLessThan(200)
      } else {
        expect(Math.round(activeRequestsBox!.height)).toBe(310)
      }
      expect(Math.round(throughputBox!.height)).toBe(mobile ? 270 : 310)
      if (mobile) {
        expect(Math.round(activeRequestsBox!.y - (overviewBox!.y + overviewBox!.height))).toBe(16)
      } else {
        expect(Math.round(activeRequestsBox!.y - (overviewBox!.y + overviewBox!.height))).toBe(20)
      }
      if (mobile) {
        expect(
          Math.round(throughputBox!.y - (activeRequestsBox!.y + activeRequestsBox!.height))
        ).toBe(16)
      } else {
        expect(Math.round(throughputBox!.y - activeRequestsBox!.y)).toBe(0)
        expect(throughputBox!.width).toBeGreaterThan(activeRequestsBox!.width)
        expect(Math.round(throughputBox!.x - (activeRequestsBox!.x + activeRequestsBox!.width))).toBe(20)
      }
      const operationsRowBottom = Math.max(
        activeRequestsBox!.y + activeRequestsBox!.height,
        throughputBox!.y + throughputBox!.height
      )
      expect(Math.round(systemBox!.y - operationsRowBottom)).toBe(
        mobile ? 16 : 20
      )
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    const pageHeading = page.getByRole('heading', { name: 'Operations monitoring', exact: true })
    await expect(pageHeading).toBeVisible()
    await expect(content.getByRole('heading', { name: 'Operations monitoring', exact: true })).toHaveCount(0)
    expect(await pageHeading.evaluate((heading, monitoring) => monitoring?.contains(heading), await content.elementHandle())).toBe(false)
    await expect(page.getByText('Gateway traffic and runtime health.', { exact: true })).toHaveCount(0)
    await expect(activeRequests.getByRole('columnheader')).toHaveText([
      'User',
      'Provider',
      'Concurrent',
      'Status',
    ])
    await expect(activeRequests.getByText('Processing', { exact: true }).first()).toBeVisible()
    await expect(
      activeRequests.getByTestId('active-request-summary')
    ).toContainText(/^Users 6 · Threads \d+$/)
    await expect(throughput).toContainText('QPS')
    await expect(throughput).toContainText('TPS (k)')
    await expect
      .poll(async () => Number(await activeRequests.getAttribute('data-refresh-tick')))
      .toBeGreaterThan(0)
    const filters = page.getByTestId('monitoring-filters')
    await expect(filters.getByRole('combobox', { name: 'Provider', exact: true })).toHaveText('Providers')
    await expect(filters.getByRole('combobox', { name: 'Group', exact: true })).toHaveText('Groups')
    await expect(filters.getByRole('combobox', { name: 'Time range', exact: true })).toHaveText('1 hour')
    await overview.getByRole('button', { name: 'Details: SLA · excl. limits', exact: true }).click()
    await expect(page.getByRole('dialog').getByText('Metric details')).toHaveClass(/\bsr-only\b/)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await filters.getByRole('combobox', { name: 'Provider', exact: true }).click()
    await page.getByRole('option', { name: 'Grok', exact: true }).click()
    await expect(filters.getByRole('combobox', { name: 'Provider', exact: true })).toHaveText('Grok')
    await filters.getByRole('combobox', { name: 'Group', exact: true }).click()
    await page.getByRole('option', { name: 'Staging', exact: true }).click()
    await expect(filters.getByRole('combobox', { name: 'Group', exact: true })).toHaveText('Staging')
    await expect(activeRequests.getByTestId('active-request-row')).toHaveCount(1)
    await expect(activeRequests).toContainText('ava.sun')
    await expect(
      activeRequests.getByTestId('active-request-summary')
    ).toContainText(/^Users 1 · Threads \d+$/)
    await filters.getByRole('combobox', { name: 'Time range', exact: true }).click()
    await page.getByRole('option', { name: '7 days', exact: true }).click()
    await expect(filters.getByRole('combobox', { name: 'Time range', exact: true })).toHaveText('7 days')
    await expect(overview.getByRole('progressbar', { name: 'SLA' })).toHaveAttribute('aria-valuenow', String(100 - 15 / (1206 - 107) * 100))
    await checkLayout(1)
    await page.reload()
    await expect(content).toBeVisible()
    await page.screenshot({ path: join(tmpdir(), `ovload-monitoring-${mobile ? 'mobile' : 'desktop'}-light.png`), fullPage: true })
    await page.getByRole('button', { name: 'Toggle theme', exact: true }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.getByRole('button', { name: 'Language', exact: true }).click()
    await page.getByRole('menuitem', { name: '中文', exact: true }).click()
    await expect(page.getByRole('heading', { name: '运维监控', exact: true })).toBeVisible()
    await expect(activeRequests.getByRole('heading', { name: '实时请求', exact: true })).toBeVisible()
    await expect(
      activeRequests.getByTestId('active-request-summary')
    ).toContainText(/^用户 6 · 线程 \d+$/)
    await expect(throughput.getByRole('heading', { name: '厂商吞吐趋势', exact: true })).toBeVisible()
    for (const name of ['内存', '数据库', '协程', '后台任务']) {
      await expect(system.getByRole('heading', { name, exact: true })).toBeVisible()
    }
    await checkLayout(6)
    await page.screenshot({ path: join(tmpdir(), `ovload-monitoring-${mobile ? 'mobile' : 'desktop'}-dark-zh.png`), fullPage: true })
    await page.goto('/dashboard')
    await expect(page.getByTestId('request-overview')).toHaveCount(0)
    await expect(page.getByTestId('system-status')).toHaveCount(0)
    await expect(page.getByTestId('analytics-card')).toBeVisible()
    await page.goto('/tasks')
    await expect(content).toHaveCount(0)
    await expect(page.getByText('404', { exact: true })).toBeVisible()
    expect(errors).toEqual([])
  })
}
