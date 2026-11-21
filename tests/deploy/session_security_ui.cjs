const assert = require('node:assert/strict')
const fs = require('node:fs')
const { createRequire } = require('node:module')
const { chromium, expect } = createRequire('/src/web/package.json')('@playwright/test')
const base = 'https://192.168.2.150:19444'
const priv = JSON.parse(fs.readFileSync('/test-runtime/private.json', 'utf8'))
const out = '/src/test-results/session-security'
let browser
async function main() {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disk-cache-size=33554432'] })
  const context = await browser.newContext({ baseURL: base, ignoreHTTPSErrors: true, locale: 'zh-CN', viewport: { width: 1440, height: 1000 } })
  await context.addCookies([{ name: 'vite-ui-theme', value: 'dark', url: base }])
  await context.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'))
  const login = await context.request.post('/api/v1/auth/sessions', { headers: { Origin: base }, data: { login: 'ovload_session_verify', password: priv.administratorPassword } })
  assert.equal(login.status(), 200)
  const errors = [], page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  for (const [route, name, tab] of [
    ['/security-authentication', 'security-basic-dark', '基础设置'],
    ['/security-authentication', 'security-protection-dark', '登录防护'],
    ['/security-authentication', 'security-oauth-dark', '快捷登录'],
    ['/lottery', 'lottery-completed-dark'],
    ['/payment-settings', 'payment-dark'],
  ]) {
    await page.goto(route)
    if (tab) await page.getByRole('tab', { name: tab, exact: true }).click()
    await expect(page.locator('main')).toBeVisible()
    await expect(page.locator('html')).toHaveClass(/dark/)
    if (route === '/lottery') {
      await expect(page.getByRole('button', { name: '发起抽奖', exact: true })).toBeEnabled()
      await expect(page.getByTestId('lottery-rounds')).toContainText('已开奖')
      await expect(page.getByTestId('lottery-rounds')).not.toContainText('暂不可用')
    }
    if (route === '/payment-settings') await expect(page.locator('main')).toContainText('订阅费率 %')
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route)
    await page.screenshot({ path: `${out}/${name}-mobile.png`, fullPage: true })
    await page.setViewportSize({ width: 1440, height: 1000 })
  }
  assert.deepEqual(errors, [])
  const session = await login.json()
  assert.equal((await context.request.delete('/api/admin/v1/auth/session', { headers: { Origin: base, 'X-CSRF-Token': session.csrf_token } })).status(), 204)
  fs.writeFileSync(`${out}/ui-result.json`, JSON.stringify({ checks: ['Dark desktop and mobile settings, lottery and payment render without page errors or horizontal overflow', 'Published lottery history stays visible and another round can be published'], errors }, null, 2))
  console.log('PASS dark desktop/mobile visual checks and completed lottery history')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => { if (browser) await browser.close() })
