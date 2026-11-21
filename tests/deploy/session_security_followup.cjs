const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { randomUUID } = require('node:crypto')
const { chromium, expect } = createRequire('/src/web/package.json')('@playwright/test')
const base = 'https://192.168.2.150:19444'
const priv = JSON.parse(fs.readFileSync('/test-runtime/private.json', 'utf8'))
const out = '/src/test-results/session-security'
fs.mkdirSync(out, { recursive: true })
const checks = [], errors = [], sessions = new Map()
let browser, admin, customer, anonymous
const mark = (name) => { checks.push(name); console.log('PASS ' + name) }
const headers = (context, extra = {}) => ({ Origin: base, 'X-CSRF-Token': sessions.get(context)?.csrf_token ?? '', ...extra })
async function result(response, status = 200) {
  assert.equal(response.status(), status, `${response.url()}: ${await response.text()}`)
  return status === 204 ? null : response.json()
}
async function login(context, name = 'ovload_session_verify', password = priv.administratorPassword) {
  const response = await context.request.post('/api/v1/auth/sessions', { headers: { Origin: base }, data: { login: name, password } })
  const value = await result(response)
  sessions.set(context, value)
  return response
}
async function get(context, suffix) { return result(await context.request.get('/api/admin/v1' + suffix)) }
async function security(values, secrets = {}, status = 200, revision) {
  const doc = await get(admin, '/security-settings')
  return result(await admin.request.patch('/api/admin/v1/security-settings', { headers: headers(admin, { 'If-Match': `"${revision ?? doc.revision}"` }), data: { values, secrets } }), status)
}
async function control(route, data = {}) {
  return result(await admin.request.post('http://172.24.0.1:19096' + route, { headers: { 'X-Fixture-Token': priv.fixtureToken }, data }))
}
async function command(context, body, status = 200, management = false) {
  return result(await context.request.post(`/api/${management ? 'admin/' : ''}v1/engagement`, { headers: headers(context), data: body }), status)
}
async function main() {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-features=BackForwardCache', '--disk-cache-size=33554432'] })
  const options = { baseURL: base, ignoreHTTPSErrors: true, locale: 'zh-CN', viewport: { width: 1440, height: 1000 } }
  admin = await browser.newContext(options); customer = await browser.newContext(options); anonymous = await browser.newContext(options)
  for (const context of [admin, customer, anonymous]) await context.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'))
  const response = await login(admin)
  const cookieHeader = response.headersArray().find(h => h.name.toLowerCase() === 'set-cookie' && !h.value.includes('Max-Age=0'))?.value
  assert.ok(cookieHeader && cookieHeader.includes('HttpOnly') && cookieHeader.includes('Secure'), 'Login issues a durable 30-day browser cookie')
  assert.ok(Number(cookieHeader.match(/Max-Age=(\d+)/)[1]) >= 2591900)
  let doc = await get(admin, '/security-settings')
  assert.equal(doc.values.accessTokenMinutes, 0)
  assert.equal(doc.values.refreshTokenDays, 30)
  await security({ ...doc.values, authRateLimit: 1000, invalidAuthThreshold: 10 })
  const user = await result(await admin.request.post('/api/admin/v1/users', { headers: headers(admin), data: { email: `session-${Date.now()}@example.com`, display_name: '会话验证用户', password: priv.customerPassword, max_concurrency: 5, requests_per_minute: 1000, notes: 'Disposable verification' } }), 201)
  await login(customer, user.email, priv.customerPassword)
  // A fresh browser context has no local storage or in-memory identity, only saved cookies.
  for (const [context, expected] of [[admin, /\/dashboard\/?$/], [customer, /\/user\/dashboard\/?$/]]) {
    const reopened = await browser.newContext({ ...options, storageState: { cookies: await context.cookies(), origins: [] } })
    await reopened.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'))
    const page = await reopened.newPage()
    page.on('pageerror', error => errors.push(error.message))
    for (const route of ['/', '/sign-in']) { await page.goto(route); await expect(page).toHaveURL(expected); await expect(page.locator('main')).toBeVisible() }
    await reopened.close()
  }
  const loginPage = await anonymous.newPage(); await loginPage.goto('/'); await expect(loginPage.getByRole('textbox').first()).toBeVisible(); assert.equal(new URL(loginPage.url()).pathname, '/'); await loginPage.close()
  mark('Persistent HttpOnly cookies restore both audiences from home and sign-in after browser restart; anonymous visitors can still sign in')

  await control('/expire-idle', { session: sessions.get(admin).id })
  await get(admin, '/session')
  await control('/policy-idle', { minutes: 5 })
  await control('/expire-idle', { session: sessions.get(admin).id })
  await result(await admin.request.get('/api/admin/v1/session'), 401)
  await control('/policy-idle', { minutes: 0 })
  await result(await admin.request.get('/api/admin/v1/session'), 401)
  await login(admin)
  await control('/expire-lifetime', { session: sessions.get(admin).id })
  await result(await admin.request.get('/api/admin/v1/session'), 401)
  await login(admin)
  mark('Idle expiry defaults off, configured idle expiry revokes permanently, and absolute expiry still rejects access')

  const keyURL = '/api/admin/v1/security-settings/admin-key'
  assert.equal((await get(admin, '/security-settings/admin-key')).exists, false)
  await result(await anonymous.request.get(keyURL), 401)
  await result(await customer.request.get(keyURL), 401)
  await result(await admin.request.post(keyURL, { headers: { Origin: base } }), 403)
  const page = await admin.newPage(); page.on('pageerror', error => errors.push(error.message))
  await page.goto('/security-authentication')
  await expect(page.locator('main')).toContainText('未生成')
  await page.getByRole('button', { name: '生成密钥', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '生成密钥', exact: true }).click()
  await expect(page.getByRole('dialog').locator('input[readonly]')).toBeVisible()
  const key = await page.getByRole('dialog').locator('input[readonly]').inputValue()
  assert.ok(key.length >= 32)
  await admin.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base })
  await page.getByRole('button', { name: '复制管理员密钥', exact: true }).click()
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), key)
  const status = await get(admin, '/security-settings/admin-key')
  assert.equal(status.exists, true); assert.ok(status.expiresAt); assert.ok(!JSON.stringify(status).includes(key))
  const tokenClient = await browser.newContext(options)
  await result(await tokenClient.request.get('/api/admin/settings', { headers: { Authorization: 'Bearer ' + key } }))
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '重新生成', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '重新生成', exact: true }).click()
  await expect(page.getByRole('dialog').locator('input[readonly]')).toBeVisible()
  const nextKey = await page.getByRole('dialog').locator('input[readonly]').inputValue()
  await result(await tokenClient.request.get('/api/admin/settings', { headers: { Authorization: 'Bearer ' + key } }), 401)
  await result(await tokenClient.request.get('/api/admin/settings', { headers: { Authorization: 'Bearer ' + nextKey } }))
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '删除密钥', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '删除密钥', exact: true }).click()
  await expect(page.locator('main')).toContainText('未生成')
  await result(await tokenClient.request.get('/api/admin/settings', { headers: { Authorization: 'Bearer ' + nextKey } }), 401)
  await tokenClient.close()
  mark('Administrator key UI generates once, shows status, rotates and deletes; old keys stop working immediately; status never exposes the secret')

  doc = await get(admin, '/security-settings')
  await security({ ...doc.values, accessTokenMinutes: 43201 }, {}, 400)
  await security({ ...doc.values, authRateLimit: 999 })
  await security(doc.values, {}, 409, doc.revision)
  doc = await get(admin, '/security-settings')
  await security({ ...doc.values, stepUpVerification: true })
  await page.reload()
  await page.locator('#access-token-minutes').fill('120')
  await page.getByRole('button', { name: '保存', exact: true }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByLabel('登录密码', { exact: true }).fill(priv.administratorPassword)
  await page.getByRole('button', { name: '验证并继续' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect.poll(async () => (await get(admin, '/security-settings')).values.accessTokenMinutes).toBe(120)
  await page.screenshot({ path: path.join(out, 'security-basic.png'), fullPage: true })
  await page.getByRole('tab', { name: '登录防护', exact: true }).click()
  await expect(page.locator('#auth-rate-limit')).toBeEnabled()
  await page.screenshot({ path: path.join(out, 'security-protection.png'), fullPage: true })
  await page.getByRole('tab', { name: '快捷登录', exact: true }).click()
  await expect(page.locator('#github-secret')).toBeEnabled()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: path.join(out, 'security-mobile.png'), fullPage: true })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  doc = await get(admin, '/security-settings')
  await security({ ...doc.values, accessTokenMinutes: 0, stepUpVerification: false, humanVerification: true, captchaSiteKey: 'fixture-site' }, { captcha: 'fixture-secret' })
  for (const [endpoint, data] of [['/auth/sessions', { login: 'missing', password: 'missing' }], ['/auth/registrations', { email: 'a@example.com', password: 'password', display_name: 'a' }], ['/auth/password-reset', { email: 'a@example.com' }], ['/auth/oauth/github/start', {}]]) {
    await result(await anonymous.request.post('/api/v1' + endpoint, { headers: { Origin: base }, data }), 403)
  }
  await security({ ...doc.values, accessTokenMinutes: 0, stepUpVerification: false })
  mark('Security settings persist real writes, enforce revision/CSRF/validation and password confirmation, protect public writes, and fit mobile')

  const previous = (await get(admin, '/engagement/lottery')).current
  if (previous) await command(admin, { op: 'end_lottery', round_id: previous.id }, 200, true)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/lottery'); await page.getByRole('button', { name: '发起抽奖', exact: true }).click()
  for (const [name, value] of [['reward', '1.25'], ['winnerCount', '1'], ['participantTarget', '1'], ['minimumRecharge', '0']]) await page.getByRole('dialog').locator(`[name="${name}"]`).fill(value)
  await page.getByRole('dialog').getByRole('button', { name: '发起抽奖', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const round = (await get(admin, '/engagement/lottery')).current
  assert.ok(round); assert.equal(round.rewardCents, 125)
  await page.screenshot({ path: path.join(out, 'lottery-published.png'), fullPage: true })
  await command(customer, { op: 'start_lottery', key: randomUUID(), reward_cents: 100, winner_count: 1, participant_target: 1, minimum_recharge_cents: 0, human_verification: false }, 403)
  const before = Number((await result(await customer.request.get('/api/v1/billing/balance'))).settled_usd)
  await command(customer, { op: 'join_lottery', round_id: round.id })
  const lottery = await get(admin, '/engagement/lottery')
  assert.equal(lottery.current, null)
  assert.equal(lottery.winners.filter(w => w.round === round.id).length, 1)
  assert.equal(Number((await result(await customer.request.get('/api/v1/billing/balance'))).settled_usd), before + 1.25)
  await command(admin, { op: 'end_lottery', round_id: round.id }, 200, true)
  assert.equal(Number((await result(await customer.request.get('/api/v1/billing/balance'))).settled_usd), before + 1.25)
  mark('Administrator publishes a lottery directly from its activity page; a customer joins, the draw pays once, and customers cannot publish')

  await page.goto('/payment-settings')
  await expect(page.locator('main')).toContainText('订阅费率 %')
  assert.ok(!(await page.locator('main').innerText()).includes('paymentSettings.'))
  await page.screenshot({ path: path.join(out, 'payment-translation.png'), fullPage: true })
  const gateway = await result(await admin.request.get('/api/admin/settings'))
  fs.writeFileSync(path.join(out, 'gateway-settings-structure.json'), JSON.stringify({ keys: Object.keys(gateway.data ?? {}) }, null, 2))
  mark('Payment labels render in Chinese without untranslated keys; gateway settings load from the actual backend')

  // Login switches audience on a shared browser; logout removes both cookies.
  await login(admin, user.email, priv.customerPassword)
  assert.ok(!(await admin.cookies()).some(c => c.name.includes('management')))
  await result(await admin.request.delete('/api/v1/auth/session', { headers: headers(admin) }), 204)
  assert.ok(!(await admin.cookies()).some(c => c.name.includes('session')))
  await page.goto('/'); await expect(page.getByRole('textbox').first()).toBeVisible()
  mark('Switching identity clears the previous audience cookie, and logout cannot silently restore another old identity')
  assert.deepEqual(errors, [])
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ checks, errors }, null, 2))
  await page.close()
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => { if (browser) await browser.close() })
