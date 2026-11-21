// Run against the deployed app; no routes are mocked and no account data is changed.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { chromium, expect } = require('node:module').createRequire('/src/web/package.json')('@playwright/test')

const baseURL = process.env.ACCOUNT_QUOTA_BASE_URL || 'https://192.168.2.150:19443'
const accountId = 'acct_01a1daf7af217688b3e6a31c4a0ea9e2'
const out = process.env.ACCOUNT_QUOTA_OUTPUT || '/src/test-results/account-quota-live'
const accountPath = /^\/api\/admin(?:\/v1)?\/accounts(?:\/|$)/
const report = { passed: false, accountId, baseURL, checks: [], responses: [], requests: [], pageErrors: [] }
fs.mkdirSync(out, { recursive: true })

function matchesEndpoint(value, suffix, target = true) {
  const url = new URL(value)
  return new RegExp(`^/api/admin(?:/v1)?/accounts${suffix}$`).test(url.pathname) &&
    (!target || url.searchParams.get('accountId') === accountId)
}

async function readResponse(response, label) {
  assert.equal(response.status(), 200, `${label}: HTTP ${response.status()}`)
  const payload = await response.json()
  assert.equal(payload.code, 200, `${label}: API code ${payload.code}`)
  assert.ok(payload.data, `${label}: response has no data`)
  report.checks.push({ label, status: response.status(), apiCode: payload.code })
  return payload.data
}

async function assertQuotaWindows(scope, label) {
  for (const name of ['5小时额度', '周额度']) {
    const progress = scope.getByRole('progressbar', { name: new RegExp(name) })
    await expect(progress).toHaveCount(1, { timeout: 30000 })
    await expect(progress).toBeVisible()
    const rawValue = await progress.getAttribute('aria-valuenow')
    assert.notEqual(rawValue, null, `${label}: ${name} has no numeric progress value`)
    const value = Number(rawValue)
    assert.ok(Number.isFinite(value) && value >= 0 && value <= 100, `${label}: ${name} has invalid value`)
    report.checks.push({ label: `${label}: ${name}`, value })
  }
}

function observe(page, viewport) {
  page.on('pageerror', (error) => report.pageErrors.push({ viewport, message: error.message }))
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (accountPath.test(url.pathname)) report.requests.push({
      viewport, method: request.method(), path: url.pathname,
      accountId: url.searchParams.get('accountId'), at: Date.now(),
    })
  })
  page.on('response', (response) => {
    const url = new URL(response.url())
    if (accountPath.test(url.pathname)) report.responses.push({
      viewport, method: response.request().method(), path: url.pathname,
      accountId: url.searchParams.get('accountId'), status: response.status(), at: Date.now(),
    })
  })
}

async function openPanel(page, row, label, endpoint) {
  await row.getByRole('button', { name: '更多', exact: true }).click()
  const item = page.getByRole('menu').getByRole('menuitem', { name: label, exact: true })
  await expect(item).toBeEnabled()
  const pending = page.waitForResponse((response) => matchesEndpoint(response.url(), endpoint), { timeout: 45000 })
  await item.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: label, exact: true })).toBeVisible()
  const data = await readResponse(await pending, label)
  return { dialog, data }
}

async function closeDialog(page) {
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).toHaveCount(0)
}

;(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const ctx = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } })
  await ctx.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'))
  let session
  let page
  try {
    const login = await ctx.request.post('/api/v1/auth/sessions', {
      headers: { Origin: baseURL },
      data: { login: 'ovload_test_admin', password: fs.readFileSync('/verify/administrator.password', 'utf8').trim() },
    })
    assert.equal(login.status(), 200, 'management login failed')
    const loginPayload = await login.json()
    session = loginPayload.data || loginPayload
    page = await ctx.newPage()
    observe(page, 'desktop')
    const listing = page.waitForResponse((response) => matchesEndpoint(response.url(), '', false), { timeout: 45000 })
    await page.goto('/accounts')
    const directory = await readResponse(await listing, 'desktop account list')
    const account = directory.items.find((item) => item.id === accountId)
    assert.ok(account, `target account ${accountId} is not on the initial account page`)
    assert.equal(account.authenticationKind, 'oauth')
    assert.equal(account.provider, 'openai')
    const identity = account.email || account.name
    const row = page.locator('table:visible').getByRole('row').filter({ hasText: identity })
    await expect(row).toHaveCount(1)
    await assertQuotaWindows(row, 'desktop account list')
    await page.screenshot({ path: path.join(out, 'accounts-desktop.png') })

    const usage = await openPanel(page, row, '用量详情', '/detail')
    assert.equal(usage.data.account.id, accountId, 'detail returned a different account')
    const windows = usage.data.account.quota.windows
    assert.ok(windows.some((window) => window.windowSeconds === 18000), 'detail is missing the 5-hour quota window')
    assert.ok(windows.some((window) => window.windowSeconds === 604800), 'detail is missing the weekly quota window')
    await assertQuotaWindows(usage.dialog, 'desktop usage details')
    await page.screenshot({ path: path.join(out, 'usage-desktop.png') })
    await closeDialog(page)

    for (const [label, endpoint, filename] of [
      ['个人信息', '/personal-info', 'profile-desktop.png'],
      ['额度预测', '/quota-forecast', 'forecast-desktop.png'],
      ['额度重置', '/reset-credits', 'reset-desktop.png'],
    ]) {
      await openPanel(page, row, label, endpoint)
      await page.screenshot({ path: path.join(out, filename) })
      await closeDialog(page)
    }

    const pollingStart = report.requests.length
    const firstConcurrency = page.waitForResponse((response) => matchesEndpoint(response.url(), '/concurrency'), { timeout: 30000 })
    await row.getByRole('button', { name: /并发明细/ }).click()
    const concurrency = page.getByRole('dialog')
    await expect(concurrency).toBeVisible()
    await readResponse(await firstConcurrency, 'concurrency initial request')
    await expect(concurrency.getByText('实时并发', { exact: true }).first()).toBeVisible()
    await expect.poll(() => report.responses.filter((entry) => entry.viewport === 'desktop' &&
      entry.path.endsWith('/concurrency') && entry.accountId === accountId).length, { timeout: 12000 }).toBeGreaterThanOrEqual(3)
    const polls = report.requests.slice(pollingStart).filter((entry) => entry.path.endsWith('/concurrency') && entry.accountId === accountId)
    const intervals = polls.slice(1).map((entry, index) => entry.at - polls[index].at)
    assert.ok(intervals.length >= 2, 'concurrency did not refresh twice')
    assert.ok(intervals.every((ms) => ms >= 1250 && ms <= 6000), `unexpected concurrency polling intervals: ${intervals}`)
    report.checks.push({ label: 'concurrency live polling', requests: polls.length, intervalsMs: intervals })
    await page.screenshot({ path: path.join(out, 'concurrency-desktop.png') })
    await closeDialog(page)

    const phone = await ctx.newPage()
    await phone.setViewportSize({ width: 390, height: 844 })
    observe(phone, 'phone')
    const phoneListing = phone.waitForResponse((response) => matchesEndpoint(response.url(), '', false), { timeout: 45000 })
    await phone.goto('/accounts')
    await readResponse(await phoneListing, 'phone account list')
    const card = phone.locator('article:visible').filter({ hasText: identity })
    await expect(card).toHaveCount(1)
    await assertQuotaWindows(card, 'phone account list')
    await card.scrollIntoViewIfNeeded()
    await phone.screenshot({ path: path.join(out, 'accounts-phone.png') })
    const phoneUsage = await openPanel(phone, card, '用量详情', '/detail')
    assert.equal(phoneUsage.data.account.id, accountId)
    await assertQuotaWindows(phoneUsage.dialog, 'phone usage details')
    await phone.screenshot({ path: path.join(out, 'usage-phone.png') })
    await closeDialog(phone)
    await phone.close()

    assert.deepEqual(report.pageErrors, [], 'browser encountered JavaScript errors')
    assert.ok(report.requests.every((entry) => entry.method === 'GET'), 'the UI sent a mutating account request')
    const targetResponses = report.responses.filter((entry) => entry.accountId === accountId)
    assert.ok(targetResponses.every((entry) => entry.status === 200), 'a target-account request did not return 200')
    report.passed = true
    console.log(JSON.stringify({ passed: true, accountId, checks: report.checks, output: out }, null, 2))
  } catch (error) {
    report.error = error.stack || String(error)
    if (page && !page.isClosed()) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {})
    throw error
  } finally {
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(report, null, 2))
    if (session) await ctx.request.delete('/api/admin/v1/auth/session', { headers: { Origin: baseURL, 'X-CSRF-Token': session.csrf_token } }).catch(() => {})
    await browser.close()
  }
})().catch((error) => { console.error(error.stack); process.exitCode = 1 })
