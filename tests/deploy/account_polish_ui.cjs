const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { chromium, expect } = require('node:module').createRequire('/src/web/package.json')('@playwright/test')
const baseURL = 'https://192.168.2.150:19443'
const out = '/src/test-results/account-polish'
const live = process.argv.includes('--live')
;(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const ctx = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } })
  await ctx.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'))
  let session
  try {
    const login = await ctx.request.post('/api/v1/auth/sessions', {
      headers: { Origin: baseURL },
      data: { login: 'ovload_test_admin', password: fs.readFileSync('/verify/administrator.password', 'utf8').trim() },
    })
    assert.equal(login.status(), 200)
    session = await login.json()
    if (!live) await ctx.route('**/*', (route) => {
      const url = new URL(route.request().url())
      if (url.origin !== baseURL || url.pathname.startsWith('/api/')) return route.continue()
      let file = path.join('/src/web/dist-account-polish', url.pathname)
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = '/src/web/dist-account-polish/index.html'
      return route.fulfill({ path: file })
    })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/accounts')
    const row = page.locator('table:visible').getByRole('row').nth(1)
    await row.getByRole('button', { name: '更多', exact: true }).click()
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    await menu.getByRole('menuitem', { name: '连接测试', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const prompt = dialog.locator('#account-test-prompt')
    await expect(prompt).toHaveValue(/.+/)
    await expect(dialog.getByText('测试进度', { exact: true })).toBeVisible()
    await expect(dialog.locator('[role="progressbar"]')).toBeVisible()
    await expect(dialog.locator('#account-test-mode')).toBeVisible()
    await page.screenshot({ path: `${out}/connection-test.png`, fullPage: false })
    assert.deepEqual(errors, [])
    fs.writeFileSync(`${out}/${live ? 'live' : 'browser'}.json`, JSON.stringify({ passed: true, errors }, null, 2))
  } finally {
    if (session) await ctx.request.delete('/api/admin/v1/auth/session', { headers: { Origin: baseURL, 'X-CSRF-Token': session.csrf_token } })
    await browser.close()
  }
})().catch((error) => { console.error(error.stack); process.exitCode = 1 })
