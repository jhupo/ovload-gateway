// Runs against the isolated deployment, with credentials supplied by a mounted file.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const webRequire = createRequire(path.resolve(__dirname, '../../web/package.json'))
const { chromium, expect } = webRequire('@playwright/test')

const baseURL = process.env.OVLOAD_TEST_URL || 'https://192.168.2.150:19443'
const credentials = JSON.parse(fs.readFileSync(process.env.OVLOAD_TEST_PRIVATE_FILE, 'utf8'))
const output = path.resolve(__dirname, '../../test-results/workspace-settings-restored')
fs.mkdirSync(output, { recursive: true })
const sessions = new Map()
const checks = []
const errors = []
let browser
let admin
let customer
let originalFeatures
let originalPages

function checked(name) { checks.push(name); console.log('PASS ' + name) }
function watch(page) {
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => {
    const url = new URL(response.url())
    if (url.pathname.startsWith('/api/') && response.status() >= 400)
      errors.push(`${response.request().method()} ${url.pathname}: ${response.status()}`)
  })
}
async function login(context, login, password) {
  const response = await context.request.post('/api/v1/auth/sessions', {
    headers: { Origin: baseURL }, data: { login, password },
  })
  assert.equal(response.status(), 200, 'Unified login status')
  sessions.set(context, await response.json())
}
function headers(context, revision, csrf = true) {
  return {
    Origin: baseURL,
    ...(csrf ? { 'X-CSRF-Token': sessions.get(context).csrf_token } : {}),
    ...(revision === undefined ? {} : { 'If-Match': `"${revision}"` }),
  }
}
async function read(kind) {
  const response = await admin.request.get(`/api/admin/v1/workspace/settings/${kind}`)
  assert.equal(response.status(), 200, kind + ' GET')
  const document = await response.json()
  assert.equal(response.headers().etag, `"${document.revision}"`)
  return document
}
async function patch(kind, document, expected = 200, csrf = true, context = admin) {
  const response = await context.request.patch(`/api/admin/v1/workspace/settings/${kind}`, {
    headers: headers(context, document.revision, csrf), data: { values: document.values },
  })
  assert.equal(response.status(), expected, kind + ' PATCH')
  return expected === 200 ? response.json() : null
}
async function visibility(context = admin) {
  const response = await context.request.get('/api/v1/workspace/visibility')
  assert.equal(response.status(), 200)
  return response.json()
}
async function open(page, route) {
  await page.goto(route)
  try {
    await page.locator('main h1').waitFor()
  } catch (error) {
    console.error('Page did not open', route, page.url(), (await page.locator('body').innerText()).slice(0, 1500))
    await page.screenshot({ path: path.join(output, 'failed-page.png') }).catch(() => {})
    throw error
  }
  await page.waitForTimeout(350)
}
async function screenshot(page, name) {
  console.log('SCREENSHOT ' + name)
  await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true })
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
  assert.ok(fits, name + ' viewport overflow')
}
async function saved(page, action, kind) {
  const result = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().endsWith('/workspace/settings/' + kind))
  await action()
  assert.equal((await result).status(), 200, kind + ' UI save')
  await expect(page.getByRole('button', { name: '保存', exact: true }).filter({ visible: true })).toBeDisabled()
}

async function main() {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-features=BackForwardCache', '--disk-cache-size=33554432'] })
  const options = { baseURL, ignoreHTTPSErrors: true, locale: 'zh-CN', viewport: { width: 1440, height: 1000 } }
  admin = await browser.newContext(options)
  customer = await browser.newContext(options)
  for (const context of [admin, customer]) {
    await context.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'))
  }
  await login(admin, process.env.OVLOAD_TEST_ADMIN || 'ovload_test_admin', credentials.administratorPassword)
  checked('unified administrator login')
  originalFeatures = await read('features')
  originalPages = await read('pages')
  fs.writeFileSync(path.join(output, 'baseline.json'), JSON.stringify({ features: originalFeatures, pages: originalPages }, null, 2))
  checked('settings revisions and ETags')
  await patch('pages', originalPages, 403, false)
  checked('CSRF protection')
  const invalid = structuredClone(originalPages)
  invalid.values.monitoring.thresholds.errorWarning = '101'
  await patch('pages', invalid, 400)
  invalid.values = { ...originalPages.values, lotteryEnabled: 'false' }
  await patch('pages', invalid, 400)
  const invalidGroup = structuredClone(originalPages)
  invalidGroup.values.monitoring.groupIds = ['grp_00000000000000000000000000000000']
  await patch('pages', invalidGroup, 400)
  assert.equal((await read('pages')).revision, originalPages.revision)
  checked('invalid types, thresholds and nonexistent groups rejected atomically')
  const invalidFeatures = structuredClone(originalFeatures)
  invalidFeatures.values.referral.rate = '100.01'
  await patch('features', invalidFeatures, 400)
  invalidFeatures.values.referral.rate = '1'
  invalidFeatures.values.referral.overrides = [{ userId: '00000000-0000-0000-0000-000000000000', invitationCode: 'TESTONLY', rate: '2' }]
  await patch('features', invalidFeatures, 400)
  assert.equal((await read('features')).revision, originalFeatures.revision)
  checked('invalid referral rates and nonexistent users rejected atomically')

  const featureDraft = structuredClone(originalFeatures)
  featureDraft.values.referral.enabled = true
  const features = await patch('features', featureDraft)
  await patch('features', featureDraft, 409)
  assert.equal(features.revision, originalFeatures.revision + 1)
  checked('feature persistence and stale revision conflict')
  const largeFeatures = structuredClone(features)
  largeFeatures.values.audit.shared.keywords = '\u4e2d'.repeat(16000)
  const largeSaved = await patch('features', largeFeatures)
  assert.equal((await read('features')).values.audit.shared.keywords.length, 16000)
  await patch('features', { ...largeSaved, values: features.values })
  checked('large valid audit configuration accepted by HTTP body limit')

  const pageDraft = structuredClone(originalPages)
  pageDraft.values.channelStatusEnabled = false
  pageDraft.values.lotteryEnabled = false
  await patch('pages', pageDraft)
  assert.deepEqual(await visibility(), { securityAudit: features.values.audit.prompt.enabled || features.values.audit.content.enabled, referral: true, channelStatus: false, lottery: false })
  checked('saved flags exposed without private configuration')

  await login(customer, process.env.OVLOAD_TEST_CUSTOMER || 'server-test@example.invalid', credentials.customerPassword)
  const forbidden = await customer.request.get('/api/admin/v1/workspace/settings/features')
  assert.ok([401, 403].includes(forbidden.status()))
  const denied = await customer.request.patch('/api/admin/v1/workspace/settings/pages', { headers: headers(customer, 1), data: { values: originalPages.values } })
  assert.ok([401, 403].includes(denied.status()))
  checked('customer cannot manage global settings')

  const page = await admin.newPage()
  const customerPage = await customer.newPage()
  for (const tab of [page, customerPage]) watch(tab)
  await open(page, '/feature-settings')
  await page.getByRole('button', { name: '检测设置', exact: true }).click()
  await page.getByRole('dialog').locator('[name="shared.sampleRate"]').fill('99.5')
  await page.getByRole('dialog').getByRole('button', { name: '应用到草稿', exact: true }).click()
  await saved(page, () => page.getByRole('button', { name: '保存', exact: true }).filter({ visible: true }).click(), 'features')
  await page.reload()
  await page.getByRole('button', { name: '检测设置', exact: true }).click()
  await expect(page.getByRole('dialog').locator('[name="shared.sampleRate"]')).toHaveValue('99.5')
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
  checked('audit configuration dialog saves and reloads persisted values')
  await page.getByRole('tab', { name: '邀请返利', exact: true }).click()
  await expect(page.getByRole('switch', { name: '启用邀请返利', exact: true })).toBeChecked()
  await page.locator('#referral-rate').fill('12.34')
  await saved(page, () => page.getByRole('button', { name: '保存', exact: true }).filter({ visible: true }).click(), 'features')
  await page.reload()
  await page.getByRole('tab', { name: '邀请返利', exact: true }).click()
  await expect(page.locator('#referral-rate')).toHaveValue('12.34')
  checked('feature form save survives browser reload')
  await screenshot(page, 'features-desktop')

  await page.goto('/channel-status')
  await expect(page).toHaveURL(/\/dashboard\/?$/)
  await customerPage.goto('/user/lottery')
  await expect(customerPage).toHaveURL(/\/user\/dashboard\/?$/)
  for (const tab of [page, customerPage]) {
    await expect(tab.locator('[data-sidebar="sidebar"] a[href$="/channel-status"]')).toHaveCount(0)
    await expect(tab.locator('[data-sidebar="sidebar"] a[href$="/lottery"]')).toHaveCount(0)
  }
  checked('disabled pages removed from both menus and direct routes redirected')
  await customerPage.close()

  await open(page, '/page-settings')
  await page.locator('[name="thresholds.samples"]').fill('25')
  await page.getByRole('switch', { name: '渠道状态页面', exact: true }).click()
  await saved(page, () => page.getByRole('button', { name: '保存', exact: true }).filter({ visible: true }).click(), 'pages')
  await page.reload()
  await expect(page.locator('[name="thresholds.samples"]')).toHaveValue('25')
  await expect(page.getByRole('switch', { name: '渠道状态页面', exact: true })).toBeChecked()
  await page.getByRole('tab', { name: '抽奖活动', exact: true }).click()
  await page.getByRole('switch', { name: '抽奖活动页面', exact: true }).click()
  await saved(page, () => page.getByRole('button', { name: '保存', exact: true }).filter({ visible: true }).click(), 'pages')
  assert.equal((await visibility()).lottery, true)
  checked('page switches and monitoring parameters save through UI')

  const to = new Date().toISOString()
  const from = new Date(Date.now() - 7 * 86400000).toISOString()
  const params = new URLSearchParams({ from, to, provider: 'openai' })
  const monitor = await admin.request.get('/api/admin/v1/monitoring?' + params)
  assert.equal(monitor.status(), 200, 'monitoring GET')
  const snapshot = await monitor.json()
  assert.ok(Array.isArray(snapshot.points) && Array.isArray(snapshot.active))
  assert.ok(snapshot.points.every(point => point.latencySamples <= point.requests && point.firstTokenSamples <= point.requests))
  const elapsed = (Date.parse(to) - Date.parse(from)) / 1000
  assert.ok(Math.abs(snapshot.points.reduce((total, point) => total + point.seconds, 0) - elapsed) < 0.01)
  const groupSnapshot = await admin.request.get('/api/admin/v1/monitoring?' + new URLSearchParams({ from, to, group_id: 'grp_00000000000000000000000000000000' }))
  assert.equal(groupSnapshot.status(), 200)
  assert.ok((await groupSnapshot.json()).points.every(point => point.requests === 0))
  const ranking = await admin.request.get('/api/admin/v1/usage/ranking?period=7d')
  assert.equal(ranking.status(), 200, 'ranking GET')
  assert.ok(Array.isArray((await ranking.json()).items))
  checked('real monitoring and user-ranking queries')

  await open(page, '/monitoring')
  const filter = page.getByTestId('monitoring-filters').getByRole('combobox').first()
  await expect(filter).toBeEnabled()
  await filter.click()
  const filtered = page.waitForResponse(r => r.url().includes('/api/admin/v1/monitoring?') && new URL(r.url()).searchParams.get('provider') === 'openai')
  await page.getByRole('option', { name: 'Codex', exact: true }).click()
  assert.equal((await filtered).status(), 200)
  await expect(page.getByTestId('system-status').getByRole('progressbar')).toHaveCount(2)
  const chart = page.getByTestId('provider-throughput').locator('svg').first()
  await expect(chart).toBeVisible()
  await expect.poll(() => chart.locator('path').count()).toBeGreaterThan(3)
  checked('monitoring filters and progress tracks restored')

  await open(page, '/usage')
  await page.route('**/api/admin/v1/usage/ranking?*', async route => {
    const response = await route.fetch()
    const payload = await response.json()
    // Exercise drilldown even when the deployment has no customer-owned usage yet.
    const owner = sessions.get(customer)
    await route.fulfill({ response, json: { items: payload.items.length ? payload.items : [{ user_id: owner.user_id, tenant_id: owner.tenant_id, user: 'Ranking regression fixture', email: 'regression@example.invalid', requests: 1, tokens: null, charge_usd: null, cost_usd: null }] } })
  })
  await page.locator('main').getByRole('combobox').first().click()
  await page.getByRole('option').filter({ hasText: '7' }).first().click()
  const rankingResponse = page.waitForResponse(r => r.url().includes('/usage/ranking?') && r.request().method() === 'GET')
  await page.getByRole('tab', { name: '用户排行', exact: true }).click()
  const rankingRows = (await (await rankingResponse).json()).items
  if (rankingRows.length) {
    const drilldown = page.waitForResponse(r => r.url().includes('/usage/records?') && new URL(r.url()).searchParams.get('userId') === rankingRows[0].user_id)
    await page.locator('main').getByRole('button', { name: rankingRows[0].user, exact: true }).click()
    assert.equal((await drilldown).status(), 200)
    checked('ranking user opens live filtered request records (browser fixture if empty)')
  }
  await page.unroute('**/api/admin/v1/usage/ranking?*')
  await expect(page.locator('main')).toContainText('用户排行')
  await open(page, '/lottery')
  await expect(page.getByTestId('recent-winners-list')).toBeVisible()
  await expect(page.getByTestId('personal-winnings-list')).toBeVisible()
  checked('lottery winner list and personal card containers restored')
  await open(page, '/dashboard')
  const dashboardMetrics = await admin.request.get('/api/admin/usage/records/summary?period=today')
  assert.equal(dashboardMetrics.status(), 200)
  await expect(page.getByTestId('metric-avgResponse')).toContainText((await dashboardMetrics.json()).data.averageLatencyMs)
  await expect(page.getByTestId('metric-avgResponse')).not.toContainText('账号')
  await expect(page.getByTestId('metric-success')).not.toContainText('缓存')
  checked('dashboard response and success cards retain their metric meanings')
  const granularity = page.getByTestId('dashboard-filters').getByRole('combobox').nth(1)
  await expect(granularity).toBeEnabled()
  await page.getByTestId('dashboard-filters').getByRole('combobox').first().click()
  const dayTrend = page.waitForResponse(r => r.url().includes('/dashboard/trend?') && new URL(r.url()).searchParams.get('granularity') === 'day' && new URL(r.url()).searchParams.get('period') === '7d')
  await page.getByRole('option').filter({ hasText: '7' }).first().click()
  const dayResponse = await dayTrend
  assert.equal(dayResponse.status(), 200)
  const dayPoints = (await dayResponse.json()).data.points.length
  assert.ok(dayPoints > 0 && dayPoints <= 8, 'Daily aggregation of seven days')
  await granularity.click()
  const hourTrend = page.waitForResponse(r => r.url().includes('/dashboard/trend?') && new URL(r.url()).searchParams.get('granularity') === 'hour' && new URL(r.url()).searchParams.get('period') === '7d')
  await page.getByRole('option', { name: '按小时', exact: true }).click()
  const hourResponse = await hourTrend
  assert.equal(hourResponse.status(), 200)
  assert.ok((await hourResponse.json()).data.points.length > dayPoints, 'Hour aggregation has finer buckets')
  const invalidGranularity = await admin.request.get('/api/admin/dashboard/trend?period=today&granularity=minute')
  assert.equal(invalidGranularity.status(), 400)
  const excessiveHourlyRange = await admin.request.get('/api/admin/dashboard/trend?' + new URLSearchParams({ startTime: new Date(Date.now() - 60 * 86400000).toISOString(), endTime: new Date().toISOString(), granularity: 'hour' }))
  assert.equal(excessiveHourlyRange.status(), 400)
  checked('dashboard hour/day control requests backend aggregation')
  await page.close()

  for (const [width, height, suffix] of [[1440, 1000, 'desktop'], [390, 844, 'mobile']]) {
    for (const [route, name] of [['/dashboard', 'dashboard'], ['/monitoring', 'monitoring'], ['/usage', 'usage'], ['/lottery', 'lottery'], ['/page-settings', 'pages'], ['/feature-settings', 'features'], ['/mail-settings', 'mail'], ['/payment-settings', 'payment']]) {
      const capture = await admin.newPage()
      watch(capture)
      try {
        await capture.setViewportSize({ width, height })
        await open(capture, route)
        if (name === 'mail' || name === 'payment') assert.ok(await capture.locator('main input:not([disabled])').count(), name + ' editable fields')
        await screenshot(capture, name + '-' + suffix)
      } finally { await capture.close() }
    }
  }
  checked('eight restored pages fit desktop and mobile viewports')
  await admin.addCookies([{ name: 'vite-ui-theme', value: 'dark', url: baseURL }])
  for (const [width, height, suffix] of [[1440, 1000, 'desktop'], [390, 844, 'mobile']]) {
    for (const route of ['/dashboard', '/monitoring', '/page-settings', ...(suffix === 'mobile' ? ['/payment-settings'] : [])]) {
      const capture = await admin.newPage()
      watch(capture)
      try {
        await capture.setViewportSize({ width, height })
        await open(capture, route)
        await expect(capture.locator('html')).toHaveClass(/dark/)
        await screenshot(capture, route.slice(1) + '-' + suffix + '-dark')
      } finally { await capture.close() }
    }
  }
  checked('dark dashboard, monitoring and settings layouts fit both viewports')
  assert.deepEqual(errors, [], 'Browser runtime exceptions')
  checked('no browser runtime exceptions')
}

main().catch(error => { console.error(error.stack); process.exitCode = 1 }).finally(async () => {
  for (const context of [admin, customer]) {
    if (context) await Promise.all(context.pages().map(page => page.close()))
  }
  for (const [kind, original] of [['features', originalFeatures], ['pages', originalPages]]) {
    if (!original) continue
    try { const current = await read(kind); await patch(kind, { ...current, values: original.values }) }
    catch (error) { console.error('Failed to restore ' + kind + ': ' + error.message); process.exitCode = 1 }
  }
  for (const context of [admin, customer]) {
    if (!context || !sessions.has(context)) continue
    try {
      const prefix = sessions.get(context).audience === 'management' ? '/api/admin/v1' : '/api/v1'
      const response = await context.request.delete(prefix + '/auth/session', { headers: headers(context) })
      assert.equal(response.status(), 204, 'Test session logout')
    } catch (error) { console.error('Logout failed: ' + error.message); process.exitCode = 1 }
  }
  if (browser) await browser.close()
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ checks, errors, success: !process.exitCode }, null, 2))
})
