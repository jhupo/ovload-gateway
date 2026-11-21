// Run in the server browser image against an isolated database and operator.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { chromium, expect } = createRequire('/src/web/package.json')('@playwright/test')
const language = process.env.OVLOAD_SCROLL_LANGUAGE === 'en' ? 'en' : 'zh'
const labels = require(`/src/web/src/i18n/locales/${language}.json`)

const base = process.env.OVLOAD_TEST_URL || 'https://192.168.2.150:19444'
const assets = process.env.OVLOAD_SCROLL_ASSETS || '/src/test-results/settings-scroll/web-dist'
const output = process.env.OVLOAD_SCROLL_OUTPUT || '/src/test-results/settings-scroll'
fs.mkdirSync(output, { recursive: true })
const routes = [
  '/gateway-settings', '/general-settings', '/feature-settings', '/page-settings',
  '/security-authentication', '/mail-settings', '/payment-settings', '/data-backup', '/settings',
]

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({ baseURL: base, ignoreHTTPSErrors: true })
  let session
  const checks = [], errors = []
  try {
    await context.addCookies([{ name: 'vite-ui-theme', value: 'dark', url: base }])
    await context.addInitScript((language) => {
      try { localStorage.setItem('i18nextLng', language) } catch { /* Sandboxed email previews have no storage. */ }
    }, language)
    const login = await context.request.post('/api/v1/auth/sessions', {
      headers: { Origin: base },
      data: {
        login: process.env.OVLOAD_SCROLL_OPERATOR || 'ovload_settings_scroll_verify',
        password: fs.readFileSync('/test-runtime/administrator.password', 'utf8').trim(),
      },
    })
    assert.equal(login.status(), 200, 'Isolated operator sign-in')
    session = await login.json()
    await context.route('**/*', async (route) => {
      const request = route.request(), url = new URL(request.url())
      if (url.origin !== base || url.pathname.startsWith('/api/') || url.pathname.startsWith('/v1/')) return route.continue()
      if (process.env.OVLOAD_SCROLL_LIVE === '1') {
        const target = 'https://192.168.2.150:19443' + (request.isNavigationRequest() ? '/' : url.pathname + url.search)
        return route.fulfill({ response: await context.request.get(target) })
      }
      const file = request.isNavigationRequest() ? assets + '/index.html' : path.resolve(assets, '.' + decodeURIComponent(url.pathname))
      if (!file.startsWith(assets + '/') || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.continue()
      const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
      return route.fulfill({ path: file, contentType: types[path.extname(file)] || 'application/octet-stream' })
    })
    const page = await context.newPage()
    page.on('pageerror', (error) => errors.push(error.message))
    const viewports = process.env.OVLOAD_SCROLL_COMPACT_ONLY === '1'
      ? [{ width: 320, height: 740 }]
      : [{ width: 1920, height: 911 }, { width: 1366, height: 768 }, { width: 390, height: 844 }]
    for (const viewport of viewports) {
      await page.setViewportSize(viewport)
      for (const route of routes) {
        await page.goto(route)
        await expect(page.locator('[data-slot="settings-content"]')).toBeVisible()
        const tabs = page.locator('main [data-slot="tabs-list"]').first().getByRole('tab')
        const count = await tabs.count()
        for (const index of [...Array(count).keys(), ...Array(count).keys()].reverse()) {
          const trigger = tabs.nth(index)
          if (await trigger.isDisabled()) continue
          const content = page.locator('[data-slot="settings-content"]')
          const previousId = await page.getByRole('tabpanel').getAttribute('id')
          await content.evaluate((node) => { node.scrollTop = node.scrollHeight })
          await trigger.click()
          const currentId = await page.getByRole('tabpanel').getAttribute('id')
          if (currentId !== previousId) await expect.poll(() => content.evaluate((node) => node.scrollTop)).toBe(0)
          await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), {
            message: `${route}, ${await trigger.innerText()}, ${viewport.width}x${viewport.height}: document height`,
          }).toBe(true).catch(async (error) => {
            await page.screenshot({ path: output + '/failure.png', fullPage: true })
            const overflow = await page.evaluate(() => {
              const main = document.querySelector('main')
              const before = document.documentElement.scrollHeight
              const absolute = [...main.querySelectorAll('*')].filter((node) => getComputedStyle(node).position === 'absolute' && node.getBoundingClientRect().bottom > innerHeight).map((node) => ({ tag: node.tagName, className: node.className, offsetParent: node.offsetParent?.dataset.slot || node.offsetParent?.tagName }))
              main.style.position = 'relative'
              return { before, after: document.documentElement.scrollHeight, viewport: innerHeight, absolute }
            })
            console.log(JSON.stringify(overflow))
            throw error
          })
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route + ': document width')
          assert.equal(await content.evaluate((node) => node.scrollWidth > node.clientWidth + 1), false, route + ': content width')
          checks.push({ route, width: viewport.width, tab: (await trigger.innerText()).trim(), ...await page.evaluate(() => ({ documentHeight: document.documentElement.scrollHeight, viewportHeight: innerHeight })) })
        }
        await tabs.first().click()
        await page.screenshot({ path: `${output}/${process.env.OVLOAD_SCROLL_LIVE === '1' ? 'live' : 'fixed'}-${route.slice(1)}-${viewport.width}.png`, fullPage: true })
      }
      await page.goto('/gateway-settings')
      await page.getByRole('tab', { name: labels.gatewaySettings.modelPricing, exact: true }).click()
      const scroll = page.getByTestId('model-pricing-table-scroll')
      await expect(scroll).toBeVisible()
      const size = page.getByRole('combobox', { name: labels.data_table.rows_per_page, exact: true })
      await size.click()
      await page.getByRole('option', { name: '50', exact: true }).click()
      await expect.poll(() => scroll.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true)
      await expect(page.getByRole('button', { name: labels.data_table.next_page, exact: true })).toBeInViewport()
      await scroll.evaluate((node) => { node.scrollTop = node.scrollHeight; node.scrollLeft = node.scrollWidth })
      assert.equal(await page.locator('[data-slot="settings-content"]').evaluate((node) => node.scrollHeight > node.clientHeight + 1), false, 'Pricing must not create an outer scroller')
      await expect(page.getByRole('button', { name: labels.data_table.next_page, exact: true })).toBeInViewport()
      assert(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1))
      await page.screenshot({ path: `${output}/pricing-${viewport.width}.png`, fullPage: true })
    }
    assert.deepEqual(errors, [])
    const report = { checks, errors, documentOverflow: false, tabScrollReset: true, pricingHasSingleScroller: true }
    fs.writeFileSync(output + '/' + (process.env.OVLOAD_SCROLL_LIVE === '1' ? 'live-result.json' : 'result.json'), JSON.stringify(report, null, 2))
    console.log(`PASS ${checks.length} setting tab/viewport checks; no outer overflow, tab scroll resets, pricing scrolls internally`)
  } finally {
    if (session) await context.request.delete('/api/admin/v1/auth/session', { headers: { Origin: base, 'X-CSRF-Token': session.csrf_token } })
    await browser.close()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
