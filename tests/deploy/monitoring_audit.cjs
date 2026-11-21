const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const { chromium, expect } = createRequire('/src/web/package.json')('@playwright/test')
const live = true, baseURL = 'https://192.168.2.150:19443'
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
    const calls = []
    page.on('response', async r => { if(r.url().includes('/api/')) calls.push({url:r.url(),status:r.status()}) })
    await page.goto('/monitoring'); await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('monitoring-content')).toBeVisible()
    await page.screenshot({path: `${out}/monitoring-desktop.png`,fullPage:true})
    const snapshot = {calls, system:await page.getByTestId('system-status').innerText(), alerts:await page.getByTestId('alert-events').innerText(), logs:await page.getByTestId('system-logs').innerText()}
    const before = calls.length
    await page.getByTestId('alert-events').locator('button:has(svg.lucide-refresh-cw)').click()
    await page.waitForTimeout(500)
    snapshot.alertRefreshCalls = calls.slice(before)
    fs.writeFileSync(`${out}/monitoring-audit.json`,JSON.stringify(snapshot,null,2))
    checks.push('Monitoring page captured and API requests inspected')
    assert.deepEqual(errors, []); assert.deepEqual(failed, [])
    fs.writeFileSync(`${out}/monitoring-check.json`, JSON.stringify({ passed: true, checks }, null, 2))
    console.log(checks.map(c => 'PASS ' + c).join('\n'))
  } finally {
    await context.request.delete('/api/admin/v1/auth/session', { headers: { Origin: baseURL, 'X-CSRF-Token': auth.csrf_token } }).catch(() => {})
    await browser.close()
  }
}
main().catch(e => { console.error(e); process.exitCode = 1 })
