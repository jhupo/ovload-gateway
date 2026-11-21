const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const { chromium, expect } = createRequire('/src/web/package.json')('@playwright/test')
const live = process.argv.includes('live'), baseURL = 'https://192.168.2.150:19443'
const out = '/src/test-results/dashboard-users'

async function main() {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, locale: 'zh-CN', viewport: { width: 1920, height: 1080 } })
  await context.addInitScript(() => { localStorage.setItem('i18nextLng', 'zh'); document.cookie = 'vite-ui-theme=dark; path=/' })
  let response
  for (let attempt = 0; attempt < 5; attempt++) {
    response = await context.request.post('/api/v1/auth/sessions', { headers: { Origin: baseURL }, data: { login: 'ovload_test_admin', password: fs.readFileSync('/verify/administrator.password', 'utf8').trim() } })
    if (response.status() !== 429) break
    const retry = response.headers()['retry-after']
    const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : retry ? Math.max(1, (Date.parse(retry) - Date.now()) / 1000) : 60
    console.log(`Login throttled; retry after ${seconds} seconds`)
    await new Promise(resolve => setTimeout(resolve, seconds * 1000))
  }
  if (response.status() !== 200) { await browser.close(); assert.equal(response.status(), 200) }
  const auth = await response.json()
  if (!live) await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin !== baseURL || url.pathname.startsWith('/api/')) return route.continue()
    const file = path.join('/src/web/dist-dashboard-users', route.request().resourceType() === 'document' ? 'index.html' : url.pathname)
    return fs.existsSync(file) && fs.statSync(file).isFile() ? route.fulfill({ path: file }) : route.continue()
  })
  const page = await context.newPage(), errors = [], failed = [], checks = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('response', r => { if (r.url().includes('/api/') && r.status() >= 500) failed.push(r.url()) })
  try {
    await page.goto('/'); await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('overview-users')).toBeVisible()
    const card = page.getByTestId('overview-users')
    await expect(card).toContainText('新增用户')
    await expect(card).toContainText('总用户')
    await expect(page.getByTestId('overview-actualCost')).toHaveCount(0)
    const verify = async () => {
      const response = await context.request.get('/api/admin/dashboard/summary?period=7d', {headers: {Origin:baseURL, 'X-CSRF-Token':auth.csrf_token}})
      assert.equal(response.status(), 200)
      const users = (await response.json()).data.cards.users
      assert.equal(await card.locator('strong').last().innerText(), new Intl.NumberFormat('zh').format(users.totalUsers))
    }
    await verify()
    await page.screenshot({path: `${out}/${live ? 'live' : 'candidate'}-desktop.png`})
    await page.setViewportSize({width:390,height:844})
    await expect(card).toBeVisible()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await page.screenshot({path: `${out}/${live ? 'live' : 'candidate'}-mobile.png`})
    checks.push('Customer card restored; total agrees with API; desktop and mobile render without overflow')
    assert.deepEqual(errors, []); assert.deepEqual(failed, [])
    fs.writeFileSync(`${out}/${live ? 'live' : 'candidate'}.json`, JSON.stringify({ passed: true, checks }, null, 2))
    console.log(checks.map(c => 'PASS ' + c).join('\n'))
  } finally {
    await context.request.delete('/api/admin/v1/auth/session', { headers: { Origin: baseURL, 'X-CSRF-Token': auth.csrf_token } }).catch(() => {})
    await browser.close()
  }
}
main().catch(e => { console.error(e); process.exitCode = 1 })
