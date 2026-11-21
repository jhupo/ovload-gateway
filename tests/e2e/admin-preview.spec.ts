import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '../../web/node_modules/@playwright/test'

for (const mobile of [false, true]) {
  test(`administrator preview ${mobile ? 'mobile' : 'desktop'}`, async ({ page }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: mobile ? 'dark' : 'light' })
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en'))
    const errors: string[] = []
    const writes: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => {
      if (request.method() === 'POST') writes.push(request.url())
    })
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/sign-in$/)
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill('anything')
    await page.getByLabel('Password', { exact: true }).fill('preview-secret')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByRole('button', { name: 'Administrator', exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
    await expect(page.getByText('Demo data', { exact: true })).toBeVisible()
    await expect(page.getByRole('tab')).toHaveCount(0)
    const headingBox = await page
      .getByRole('heading', { name: 'Dashboard', exact: true })
      .boundingBox()
    const filterBox = await page.getByTestId('dashboard-filters').boundingBox()
    expect(headingBox).not.toBeNull()
    expect(filterBox).not.toBeNull()
    if (mobile) {
      expect(filterBox!.y).toBeGreaterThan(headingBox!.y + headingBox!.height)
    } else {
      expect(filterBox!.x).toBeGreaterThan(headingBox!.x + headingBox!.width)
    }
    expect(filterBox!.x + filterBox!.width).toBeLessThanOrEqual(
      (mobile ? 390 : 1440) - 15
    )
    await expect(page.getByTestId('overview-metrics')).toBeVisible()
    await expect(
      page.getByTestId('overview-metrics').locator('[data-slot="number-ticker"]')
    ).toHaveCount(4)
    await expect(page.getByTestId('overview-revenue')).toContainText('Revenue')
    await expect(page.getByTestId('overview-totalConsumption')).toContainText('Total consumption')
    await expect(page.getByTestId('overview-requests')).toContainText('Requests')
    await expect(page.getByTestId('overview-users')).toContainText('New users')
    await expect(page.getByTestId('overview-users')).toContainText('42')
    const userFooter = page.getByTestId('overview-users').locator('[data-slot="overview-footer"]')
    await expect(userFooter).toContainText('Total')
    await expect(userFooter).toContainText('654')
    await expect(page.getByTestId('overview-metrics').getByText('Today', { exact: true })).toHaveCount(0)
    await expect(page.getByTestId('monthly-orders')).toHaveCount(0)
    await expect(page.getByTestId('purchase-records')).toHaveCount(0)
    await expect(page.getByTestId('recent-activity')).toHaveCount(0)
    const overviewBoxes = await page.getByTestId('overview-metrics').locator('[data-testid^="overview-"]').evaluateAll(nodes =>
      nodes.map(node => {
        const { x, y } = node.getBoundingClientRect()
        return { x, y, fits: node.scrollWidth <= node.clientWidth }
      })
    )
    expect(new Set(overviewBoxes.map(box => Math.round(box.x))).size).toBe(mobile ? 2 : 4)
    expect(new Set(overviewBoxes.map(box => Math.round(box.y))).size).toBe(mobile ? 2 : 1)
    expect(overviewBoxes.every(box => box.fits)).toBe(true)
    await expect(page.getByRole('combobox', { name: 'Time range' })).toHaveText('Today')
    await expect(page.locator('[data-testid^="metric-"]')).toHaveCount(4)
    await expect(page.locator('[data-slot="sparkline"]')).toHaveCount(4)
    const reducedMotionSparklines = await page
      .locator('[data-slot="sparkline"] .sparkline-line')
      .evaluateAll((paths) => paths.map((path) => ({ dash: getComputedStyle(path).strokeDasharray, clip: getComputedStyle(path).clipPath })))
    expect(reducedMotionSparklines).toEqual(Array.from({ length: 4 }, () => ({ dash: 'none', clip: 'none' })))
    await expect(page.locator('[data-testid^="metric-"] [role="img"]')).toHaveCount(0)
    const assertMetricAlignment = async () => {
      const cards = await page.locator('[data-testid^="metric-"]').evaluateAll(nodes => nodes.map(node => {
        const card = node.getBoundingClientRect()
        const footerNode = node.querySelector('[data-slot="metric-footer"]')!
        const footer = footerNode.getBoundingClientRect()
        const footerItems = [...footerNode.children].map(item => item.getBoundingClientRect())
        const values = [...node.querySelectorAll('strong')].map(value => value.getBoundingClientRect().bottom - card.y)
        return {
          top: footer.y - card.y,
          height: footer.height,
          bottom: card.bottom - footer.bottom,
          values,
          oneLine: footerItems.every(item => Math.abs(item.y - footerItems[0].y) < 1),
          fits: footerNode.scrollWidth <= footerNode.clientWidth,
        }
      }))
      for (const card of cards) {
        expect(card.top).toBeCloseTo(cards[0].top, 0)
        expect(card.height).toBeCloseTo(cards[0].height, 0)
        expect(card.bottom).toBeCloseTo(cards[0].bottom, 0)
        expect(card.oneLine).toBe(true)
        expect(card.fits).toBe(true)
        for (const baseline of card.values) expect(baseline).toBeCloseTo(cards[0].values[0], 0)
      }
    }
    await assertMetricAlignment()
    await expect(page.getByTestId('request-overview')).toHaveCount(0)
    await expect(page.getByTestId('system-status')).toHaveCount(0)
    await expect(page.getByTestId('metric-avgResponse')).toContainText('Response')
    await expect(page.getByTestId('metric-success')).toContainText('Success rate')
    await expect(page.getByTestId('metric-tokens')).toContainText('Input')
    await expect(page.getByTestId('metric-tokens')).toContainText('Output')
    await expect(page.getByRole('heading', { name: 'Token usage trend', exact: true })).toHaveCount(0)
    await expect(page.getByRole('img', { name: 'Token usage trend', exact: true }).locator('svg')).toBeVisible()
    await expect(page.getByTestId('trend-legend').getByRole('button')).toHaveCount(5)
    for (const button of await page.getByTestId('trend-legend').getByRole('button').all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(36)
    }
    for (const label of ['Input', 'Output', 'Cache creation', 'Cache read', 'Cache hit ratio']) {
      await expect(page.getByRole('button', { name: `Toggle ${label}`, exact: true })).toHaveAttribute('aria-pressed', 'true')
    }
    const cacheLegend = page.getByRole('button', { name: 'Toggle Cache hit ratio', exact: true })
    await cacheLegend.click()
    await expect(cacheLegend).toHaveAttribute('aria-pressed', 'false')
    await cacheLegend.click()
    await expect(cacheLegend).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('analytics-card')).toHaveCount(1)
    await expect(page.getByTestId('analytics-card').getByRole('img', { name: 'Token usage trend', exact: true })).toHaveCount(1)
    const before = {
      revenue: await page.getByTestId('overview-revenue').innerText(),
      consumption: await page.getByTestId('overview-totalConsumption').innerText(),
      requests: await page.getByTestId('overview-requests').innerText(),
      users: await page.getByTestId('overview-users').innerText(),
      tokens: await page.getByTestId('metric-tokens').innerText(),
    }
    await page.getByRole('combobox', { name: 'Time range' }).click()
    await page.getByRole('option', { name: 'Last 24 hours', exact: true }).click()
    await page.getByRole('combobox', { name: 'Time range' }).click()
    await page.getByRole('option', { name: 'Last 7 days', exact: true }).click()
    await expect(page.getByTestId('overview-revenue')).not.toHaveText(before.revenue, { useInnerText: true })
    await expect(page.getByTestId('overview-totalConsumption')).not.toHaveText(before.consumption, { useInnerText: true })
    await expect(page.getByTestId('overview-requests')).not.toHaveText(before.requests, { useInnerText: true })
    await expect(page.getByTestId('overview-users')).not.toHaveText(before.users, { useInnerText: true })
    await expect(page.getByTestId('metric-tokens')).not.toHaveText(before.tokens, { useInnerText: true })
    await expect(userFooter).toContainText('Total')
    await expect(userFooter).toContainText('654')
    const weekly = await page.getByTestId('metric-tokens').innerText()
    await page.getByRole('combobox', { name: 'Granularity' }).click()
    await page.getByRole('option', { name: 'Hourly', exact: true }).click()
    await expect(page.getByTestId('metric-tokens')).toHaveText(weekly, { useInnerText: true })
    await expect(page.getByText('Model distribution', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Request health timeline', { exact: true })).toHaveCount(0)
    await expect(page.getByText('User usage ranking', { exact: true })).toHaveCount(0)
    await expect(page.locator('[data-sidebar=footer]')).toHaveCount(0)
    await expect(page.locator('.public-scenery')).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Administrator', exact: true })).toBeVisible({ timeout: 15_000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: join(tmpdir(), `ovload-admin-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: true })
    await page.getByRole('button', { name: 'Toggle theme', exact: true }).click()
    await expect(page.locator('html')).toHaveClass(mobile ? /light/ : /dark/)
    await expect(page.getByRole('img', { name: 'Token usage trend', exact: true }).locator('svg')).toBeVisible()
    await page.getByRole('button', { name: 'Language', exact: true }).click()
    await page.getByRole('menuitem', { name: '中文', exact: true }).click()
    await expect(page.getByText('Token 使用趋势', { exact: true })).toHaveCount(0)
    if (!mobile) {
      await expect(page.getByRole('link', { name: '仪表盘', exact: true })).toBeVisible()
    }
    await assertMetricAlignment()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: join(tmpdir(), `ovload-admin-${mobile ? 'mobile-light' : 'desktop-dark'}-zh.png`), fullPage: true })
    await page.getByRole('button', { name: '语言', exact: true }).click()
    await page.getByRole('menuitem', { name: 'English', exact: true }).click()
    const persisted = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie, url: location.href }))
    expect(persisted).not.toContain('anything')
    expect(persisted).not.toContain('preview-secret')
    await page.getByRole('button', { name: 'Administrator', exact: true }).click()
    await page.getByRole('menuitem', { name: /Sign out/ }).click()
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page).toHaveURL(/\/sign-in$/)
    expect(await page.evaluate(() => sessionStorage.getItem('ovload.admin-preview'))).toBeNull()
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/sign-in$/)
    expect(writes).toEqual([])
    expect(errors).toEqual([])
  })
}

test('animates the token trend when its time range changes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'light' })
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en'))
  await page.goto('/dashboard')
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('anything')
  await page.getByLabel('Password', { exact: true }).fill('preview-secret')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.getByRole('link', { name: 'Operations monitoring', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Operations monitoring', exact: true })).toBeVisible()
  await page.evaluate(() => {
    const testWindow = window as Window & {
      __workspaceViewTransitions: number
    }
    testWindow.__workspaceViewTransitions = 0
    const start = document.startViewTransition.bind(document)
    document.startViewTransition = callback => {
      testWindow.__workspaceViewTransitions += 1
      return start(callback)
    }
  })
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  const dashboardContent = page.getByTestId('dashboard-content')
  await expect(dashboardContent).toBeVisible()
  const chart = page.getByRole('img', {
    name: 'Token usage trend',
    exact: true,
  })
  await expect(chart).toHaveAttribute('data-ready', 'false')
  const revenueTicker = page
    .getByTestId('overview-revenue')
    .locator('[data-slot="number-ticker"]')
  const tickerSamples: string[] = []
  for (let index = 0; index < 8; index += 1) {
    tickerSamples.push(await revenueTicker.innerText())
    await page.waitForTimeout(60)
  }
  expect(new Set(tickerSamples).size).toBeGreaterThan(1)
  expect(
    await page.evaluate(
      () =>
        (window as Window & { __workspaceViewTransitions: number })
          .__workspaceViewTransitions
    )
  ).toBe(1)
  expect(
    await page
      .locator('[data-slot="workspace-route"]')
      .evaluate(element => getComputedStyle(element).viewTransitionName)
  ).toBe('workspace-route')
  await expect(page.locator('[data-slot="sparkline"]')).toHaveCount(4)
  await expect(page.locator('[data-testid^="metric-"] [role="img"]')).toHaveCount(0)
  const sparklineAnimation = await page
    .locator('[data-slot="sparkline"] .sparkline-line')
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element)
      return { name: style.animationName, duration: style.animationDuration }
    })
  expect(sparklineAnimation).toEqual({
    name: 'telemetry-sparkline-draw',
    duration: '0.9s',
  })
  const pathSignature = () =>
    chart.locator('svg path').evaluateAll(paths =>
      paths.map(path => ({
        d: path.getAttribute('d'),
        fill: path.getAttribute('fill'),
        stroke: path.getAttribute('stroke'),
      }))
    )

  await expect(chart.locator('svg')).toBeVisible()
  const before = await pathSignature()
  await page.getByRole('combobox', { name: 'Time range' }).click()
  await page.getByRole('option', { name: 'Last 7 days', exact: true }).click()
  await page.waitForTimeout(80)
  const during = await pathSignature()
  await page.waitForTimeout(140)
  const later = await pathSignature()

  expect(during).not.toEqual(before)
  expect(later).not.toEqual(during)
})

test('renders the dashboard before the chart runtime finishes loading', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => {
    sessionStorage.setItem('ovload.admin-preview', 'active')
    localStorage.setItem('i18nextLng', 'en')
  })

  let releaseRuntime!: () => void
  const runtimeGate = new Promise<void>((resolve) => {
    releaseRuntime = resolve
  })
  let runtimeRequested = false
  await page.route(/telemetry-chart-runtime\.ts/, async (route) => {
    runtimeRequested = true
    await runtimeGate
    await route.continue()
  })

  try {
    await page.goto('/dashboard')
    await expect(
      page.getByRole('heading', { name: 'Dashboard', exact: true })
    ).toBeVisible()
    await expect(page.getByTestId('overview-metrics')).toBeVisible()
    await expect.poll(() => runtimeRequested).toBe(true)
    await expect(
      page.getByRole('img', { name: 'Token usage trend', exact: true })
    ).toHaveAttribute('data-ready', 'false')
  } finally {
    releaseRuntime()
  }

  await expect(
    page
      .getByRole('img', { name: 'Token usage trend', exact: true })
      .locator('svg')
  ).toBeVisible()
  await expect(
    page.getByRole('img', { name: 'Token usage trend', exact: true })
  ).toHaveAttribute('data-ready', 'true')
})
