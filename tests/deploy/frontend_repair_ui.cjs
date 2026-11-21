const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const { chromium, expect } = createRequire('/src/web/package.json')('@playwright/test')
const live = process.argv.includes('live'), baseURL = `https://192.168.2.150:${live ? 19443 : 19444}`
const out = '/src/test-results/frontend-review', candidate = '/src/web/dist-review-candidate'

async function main() {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, locale: 'zh-CN', viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
  await context.addInitScript(() => { localStorage.setItem('i18nextLng', 'zh'); document.cookie = 'vite-ui-theme=dark; path=/' })
  const response = await context.request.post('/api/v1/auth/sessions', { headers: { Origin: baseURL }, data: { login: live ? 'ovload_test_admin' : 'ovload_usage_verify', password: fs.readFileSync('/verify/administrator.password', 'utf8').trim() } })
  assert.equal(response.status(), 200)
  const candidateRoute = async route => {
    const req = route.request(), url = new URL(req.url())
    if (url.origin !== baseURL || url.pathname.startsWith('/api/') || url.pathname === '/healthz') return route.continue()
    const file = req.resourceType() === 'document' ? path.join(candidate, 'index.html') : path.join(candidate, url.pathname)
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return route.fulfill({ path: file })
    return route.continue()
  }
  if (!live) await context.route('**/*', candidateRoute)
  const page = await context.newPage(), errors = [], bad = [], checks = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => { if (response.url().includes('/api/') && response.status() >= 500) bad.push(response.url()) })
  try {
    for (const [url, name] of [['/usage', 'usage'], ['/subscriptions', 'subscriptions'], ['/orders/plans', 'plans'], ['/orders/records', 'orders'], ['/orders/overview', 'payments'], ['/proxies', 'proxies']]) {
      await page.goto(url); await page.waitForLoadState('networkidle')
      await expect(page.locator('table:visible').first()).toBeVisible()
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name)
      await page.screenshot({ path: `${out}/${live ? 'live' : 'candidate'}-${name}-desktop.png`, fullPage: true })
      await page.setViewportSize({ width: 390, height: 844 })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name + ' mobile')
      await page.screenshot({ path: `${out}/${live ? 'live' : 'candidate'}-${name}-mobile.png`, fullPage: true })
      await page.setViewportSize({ width: 1440, height: 1000 })
    }
    checks.push('Usage, subscriptions, plans, orders and proxies render at desktop/mobile widths without document overflow')
    await page.goto('/usage'); await page.waitForLoadState('networkidle')
    const summaryRequest = page.waitForResponse(r => r.url().includes('/usage/records/summary?') && r.url().includes('userEmail=usage-demo-20261108') && r.status() === 200)
    await page.getByPlaceholder('用户邮箱').fill('usage-demo-20261108')
    const summary = (await (await summaryRequest).json()).data
    assert.ok(summary.averageFirstTokenMsValue !== null)
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出', exact: true }).click()
    const csv = await download; await csv.saveAs(`${out}/usage-export.csv`)
    assert.match(fs.readFileSync(`${out}/usage-export.csv`, 'utf8'), /usage-demo-20261108/)
    checks.push('Usage filter reaches summary endpoint and exports matching records as CSV')
    await page.goto('/channels/pricing'); await page.waitForURL('**/gateway-settings')
    checks.push('Old pricing bookmark redirects to gateway settings')
    if (!live) {
      const failure = await context.newPage()
      await failure.route('**/commerce/orders**', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'test_failure', message: 'test failure' } }) }))
      await failure.goto('/orders/records'); await expect(failure.getByRole('button', { name: '重试', exact: true })).toBeVisible()
      await expect(failure.locator('table')).toHaveCount(0)
      await failure.unroute('**/commerce/orders**')
      await failure.getByRole('button', { name: '重试', exact: true }).click()
      await expect(failure.locator('table:visible')).toBeVisible(); await failure.close()
      checks.push('Initial read failure renders retry instead of an empty table; retry restores the data')
      const clock = await context.newPage()
      await clock.route('**/commerce/subscriptions**', async route => {
        const reply = await route.fetch(), data = await reply.json()
        assert.ok(data.records.length)
        data.records = [data.records[0]]
        const record = data.records[0]; record.revoked = false
        record.start = new Date(Date.now() - 86400000).toISOString()
        record.end = new Date(Date.now() + 6000).toISOString()
        record.plan.name = '时钟回归'
        await route.fulfill({ response: reply, json: data })
      })
      await clock.goto('/subscriptions')
      const row = clock.locator('table:visible tbody tr').filter({ hasText: '时钟回归' })
      await expect(row).toBeVisible(); await expect(row).toContainText('生效')
      await expect(row).toContainText('已到期', { timeout: 12000 }); await clock.close()
      checks.push('Open subscription page changes from active to expired without navigation or a new request')
      const fixture = JSON.parse(fs.readFileSync('/verify/frontend-review-customers.json', 'utf8'))
      const customer = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, locale: 'zh-CN', viewport: { width: 1440, height: 1000 } })
      await customer.route('**/*', candidateRoute)
      const login = await customer.request.post('/api/v1/auth/sessions', { headers: { Origin: baseURL }, data: { login: fixture.users[0].email, password: fixture.password } })
      assert.equal(login.status(), 200)
      const personal = await customer.newPage()
      personal.on('pageerror', error => errors.push(error.message))
      personal.on('response', r => { if (r.url().includes('/api/') && r.status() >= 400) bad.push(r.url()) })
      for (const url of ['/user/orders', '/user/redeem', '/user/subscriptions']) {
        await personal.goto(url); await personal.waitForLoadState('networkidle')
        assert.equal(new URL(personal.url()).pathname, url)
        if (url.endsWith('/subscriptions')) await expect(personal.getByText('分页验证套餐', { exact: true })).toBeVisible()
        else await expect(personal.locator('table tbody tr').first()).not.toContainText('暂无')
        assert.ok(await personal.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      }
      await customer.close()
      checks.push('Customer order, redemption and subscription pages render actual isolated records without request failures')
    }
    assert.deepEqual(errors, []); assert.deepEqual(bad, [])
    fs.writeFileSync(`${out}/${live ? 'live-ui' : 'candidate-ui'}.json`, JSON.stringify({ passed: true, checks }, null, 2))
    console.log(checks.map(c => 'PASS ' + c).join('\n'))
  } finally {
    const login = await response.json()
    await context.request.delete('/api/admin/v1/auth/session', { headers: { Origin: baseURL, 'X-CSRF-Token': login.csrf_token } }).catch(() => {})
    await browser.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
