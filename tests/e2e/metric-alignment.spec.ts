import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Locator, type Page } from '../../web/node_modules/@playwright/test'

const captures = join(tmpdir(), 'ovload-table-alignment-20261025')

async function expectAligned(metrics: Locator) {
  expect(await metrics.count()).toBeGreaterThan(0)
  for (const metric of await metrics.all()) {
    const rows = await metric.evaluate((element) => {
      const labels = Array.from(element.querySelectorAll('dt'))
      return Array.from(element.querySelectorAll('dd')).map((value, index) => {
        const range = document.createRange()
        range.selectNodeContents(value)
        const amount = range.getBoundingClientRect()
        const label = labels[index].getBoundingClientRect()
        const container = element.getBoundingClientRect()
        return { end: amount.right, start: amount.left, labelEnd: label.right, containerEnd: container.right }
      })
    })
    for (const row of rows) {
      expect(Math.abs(row.start - rows[0].start)).toBeLessThan(1)
      expect(row.start - row.labelEnd).toBeGreaterThanOrEqual(7)
      expect(row.end).toBeLessThanOrEqual(row.containerEnd + 1)
    }
  }
}

async function capture(page: Page, metric: Locator, name: string) {
  await mkdir(captures, { recursive: true })
  await metric.first().scrollIntoViewIfNeeded()
  const box = (await metric.first().boundingBox())!
  const viewport = page.viewportSize()!
  await page.screenshot({
    path: join(captures, `${name}.png`),
    animations: 'disabled',
    clip: {
      x: Math.max(0, box.x - 16),
      y: Math.max(0, box.y - 45),
      width: Math.min(box.width + 32, viewport.width - Math.max(0, box.x - 16)),
      height: Math.min(380, viewport.height - Math.max(0, box.y - 45)),
    },
  })
}

for (const locale of ['zh', 'en']) {
  for (const width of [1440, 390]) {
    test(`API usage values align for ${locale} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
      await page.addInitScript((language) => {
        sessionStorage.setItem('ovload.admin-preview', 'active')
        localStorage.setItem('i18nextLng', language)
      }, locale)
      await page.goto('/user/api-keys')
      const metrics = page.getByRole('table').locator('tbody dl')
      await expect(metrics).toHaveCount(6)
      await page.evaluate(() => document.fonts.ready)
      await expectAligned(metrics)
      const starts = await metrics.locator('dd:first-of-type').evaluateAll((values) => values.map((value) => value.getBoundingClientRect().left))
      expect(Math.max(...starts) - Math.min(...starts)).toBeLessThan(1)
      const headerOffset = await metrics.first().evaluate((element) => {
        const cell = element.closest('td')!
        const table = cell.closest('table')!
        const header = table.tHead!.rows[0].cells[cell.cellIndex]
        const title = header.querySelector('button span')!
        const label = element.querySelector('dt')!
        return title.getBoundingClientRect().left - label.getBoundingClientRect().left
      })
      expect(Math.abs(headerOffset)).toBeLessThan(1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      if (width === 390) {
        await metrics.first().scrollIntoViewIfNeeded()
        // Put the full metric between the two sticky columns, as a horizontal swipe does.
        await metrics.first().evaluate((element) => {
          const scroller = element.closest('[data-slot=table-container]')!
          const row = element.closest('tr')!
          scroller.scrollLeft += element.getBoundingClientRect().left - row.cells[0].getBoundingClientRect().right - 8
        })
        const metric = (await metrics.first().boundingBox())!
        const cells = page.locator('tbody tr').first().locator('td')
        expect(metric.x).toBeGreaterThanOrEqual((await cells.first().boundingBox())!.x + (await cells.first().boundingBox())!.width)
        expect(metric.x + metric.width).toBeLessThanOrEqual((await cells.last().boundingBox())!.x)
        if (locale === 'en') {
          await mkdir(captures, { recursive: true })
          const viewport = (await page.getByTestId('api-key-viewport').boundingBox())!
          await page.screenshot({ path: join(captures, 'api-en-mobile-visible.png'), animations: 'disabled', clip: { x: viewport.x, y: viewport.y, width: viewport.width, height: Math.min(viewport.height, 450) } })
        }
      }
      if (locale === 'zh' && width === 1440)
        await capture(page, metrics, `api-${locale}-${width}`)
    })
  }
}

for (const scenario of [
  { path: '/groups', name: 'group-usage-values', width: 1440, selector: 'tbody dl', hasText: 'OVL' },
  { path: '/orders/plans', name: 'plan-quotas', width: 1440, selector: 'tbody dl', hasText: 'OVL' },
  { path: '/referrals/rebates', name: 'referral-payments', width: 1440, selector: 'tbody dl', hasText: 'OVL' },
  { path: '/usage', name: 'request-billing-values', width: 1440, selector: 'tbody dl.tabular-nums', hasText: 'OVL' },
  { path: '/usage', name: 'request-metrics-mobile', width: 390, selector: '[role=list] dl.tabular-nums', hasText: undefined },
]) {
  test(`${scenario.name} keep labels clear and values aligned`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
    await page.addInitScript(() => {
      sessionStorage.setItem('ovload.admin-preview', 'active')
      localStorage.setItem('i18nextLng', 'en')
    })
    await page.goto(scenario.path)
    const metrics = page.locator(scenario.selector).filter({ visible: true })
    await expect(metrics.first()).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await expectAligned(metrics)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const captureTargets = metrics.filter({ hasText: scenario.hasText })
    if (scenario.name === 'group-usage-values' || scenario.name === 'request-billing-values')
      await capture(page, captureTargets, scenario.name)
  })
}
