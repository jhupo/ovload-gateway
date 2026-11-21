const fs = require('node:fs')
const assert = require('node:assert/strict')
const { chromium, expect } = require('node:module').createRequire('/src/web/package.json')('@playwright/test')
const baseURL = 'https://192.168.2.150:19443'
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
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    let polls = 0
    const responses = []
    page.on('response', (response) => {
      if (response.url().includes('/accounts/concurrency')) responses.push(response.status())
    })
    page.on('request', (request) => {
      if (request.url().includes('/accounts/concurrency')) polls++
    })
    await page.goto('/accounts')
    await page.waitForTimeout(3000)
    await page.screenshot({ path: '/src/test-results/account-polish/concurrency-before.png' })
    fs.writeFileSync('/src/test-results/account-polish/concurrency-before.txt', await page.locator('body').innerText())
    const button = page.locator('button[aria-label^="并发明细"]').first()
    await expect(button).toBeVisible({ timeout: 30000 })
    await button.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('实时并发', { exact: true }).first()).toBeVisible()
    await page.waitForTimeout(2300)
    assert.ok(polls >= 2, `expected polling, got ${polls}`)
    assert.ok(responses.length >= 2 && responses.every((status) => status === 200), `unexpected concurrency responses: ${responses}`)
    assert.deepEqual(errors, [])
    await page.screenshot({ path: '/src/test-results/account-polish/concurrency-live.png' })
    fs.writeFileSync('/src/test-results/account-polish/concurrency-live.json', JSON.stringify({ passed: true, polls, responses, errors }, null, 2))
  } finally {
    if (session) await ctx.request.delete('/api/admin/v1/auth/session', { headers: { Origin: baseURL, 'X-CSRF-Token': session.csrf_token } })
    await browser.close()
  }
})().catch((error) => { console.error(error.stack); process.exitCode = 1 })
