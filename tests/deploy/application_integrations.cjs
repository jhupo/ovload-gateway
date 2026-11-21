const assert = require('node:assert/strict')
const fs = require('node:fs')
const { createRequire } = require('node:module')
const { randomUUID, createPublicKey } = require('node:crypto')
const { chromium, expect } = createRequire('/src/web/package.json')('@playwright/test')
const base = 'https://192.168.2.150:19444'
const priv = JSON.parse(fs.readFileSync('/test-runtime/private.json', 'utf8'))
const out = '/src/test-results/settings-completion'
const sessions = new Map(), checks = []
let browser, admin, customer, anonymous
const mark = (name) => { checks.push(name); console.log('PASS ' + name) }
const headers = (context, extra = {}) => ({ Origin: base, 'X-CSRF-Token': sessions.get(context)?.csrf_token ?? '', ...extra })
async function result(response, status = 200) {
  assert.equal(response.status(), status, `${response.url()} ${await response.text()}`)
  return status === 204 ? null : response.json()
}
async function login(context, name, password) {
  const value = await result(await context.request.post('/api/v1/auth/sessions', { headers: { Origin: base }, data: { login: name, password } }))
  sessions.set(context, value)
  return value
}
const get = (path) => admin.request.get('/api/admin/v1' + path).then(result)
async function post(path, data = {}, status = 200) { return result(await admin.request.post('/api/admin/v1' + path, { headers: headers(admin), data }), status) }
async function load(kind) { return get('/settings/integrations/' + kind) }
async function save(kind, values, secrets = {}, status = 200, revision) {
  const doc = await load(kind)
  return result(await admin.request.patch('/api/admin/v1/settings/integrations/' + kind, { headers: headers(admin, { 'If-Match': `"${revision ?? doc.revision}"` }), data: { values, secrets } }), status)
}
async function control(path, data = {}) {
  return result(await admin.request.post('http://172.24.0.1:19581/control/' + path, { headers: { 'X-Fixture-Token': priv.fixtureToken }, data }))
}
async function payment(data, status = 200, context = customer) {
  return result(await context.request.post('/api/v1/payments', { headers: headers(context), data }), status)
}
async function notify(fields, status = 200) {
  const response = await anonymous.request.post('/api/payments/alipay/notify', { form: fields })
  assert.equal(response.status(), status)
  if (status === 200) assert.equal(await response.text(), 'success')
}
async function platform(path, data, status = 200) {
  const response = await admin.request.fetch('/api/admin/settings/backups' + path, { method: data === undefined ? 'GET' : 'POST', headers: headers(admin), data })
  return (await result(response, status)).data
}
async function mailFor(email, subject) {
  let message
  await expect.poll(async () => {
    const data = await control('messages')
    message = data.messages.findLast((m) => m.to.includes(email) && m.subject === subject)
    return !!message
  }, { timeout: 30000, intervals: [100, 500, 1000] }).toBe(true)
  assert.equal(message.authenticated, true)
  return message
}
async function main() {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disk-cache-size=33554432'] })
  const options = { baseURL: base, ignoreHTTPSErrors: true, locale: 'zh-CN', viewport: { width: 1440, height: 1000 } }
  admin = await browser.newContext(options); customer = await browser.newContext(options); anonymous = await browser.newContext(options)
  for (const context of [admin, customer, anonymous]) await context.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'))
  await login(admin, 'ovload_settings_verify', priv.administratorPassword)
  const security = await get('/security-settings')
  await result(await admin.request.patch('/api/admin/v1/security-settings', { headers: headers(admin, { 'If-Match': `"${security.revision}"` }), data: { values: { ...security.values, authRateLimit: 10000, invalidAuthThreshold: 1000, humanVerification: false, stepUpVerification: false }, secrets: {} } }))
  await result(await anonymous.request.get('/api/admin/v1/settings/integrations/mail'), 401)
  let mail = await load('mail')
  await result(await admin.request.patch('/api/admin/v1/settings/integrations/mail', { headers: { Origin: base, 'If-Match': `"${mail.revision}"` }, data: { values: mail.values, secrets: {} } }), 403)
  await save('mail', { ...mail.values, smtpPort: '0' }, {}, 400)
  const mailValues = { ...mail.values, smtpHost: '172.24.0.1', smtpPort: '19582', smtpUsername: 'fixture', smtpUseTls: false, senderEmail: 'no-reply@example.com', senderName: 'Settings Test', templates: {
    verification: { zh: { subject: 'Verify fixture', html: '<p>{{site_name}}</p><code>{{verification_code}}</code><p>{{expires_in_minutes}}</p>' } },
    passwordReset: { zh: { subject: 'Reset fixture', html: '<a href="{{reset_url}}">Reset</a>' } },
    rechargeSuccess: { zh: { subject: 'Recharge fixture', html: '<p>{{order_id}}</p><p>{{recharge_amount}}</p><p>{{current_balance}}</p>' } },
  } }
  mail = await save('mail', mailValues, { smtpPassword: priv.smtpPassword })
  assert.equal(mail.hasSecrets.smtpPassword, true); assert.ok(!JSON.stringify(mail).includes(priv.smtpPassword))
  await save('mail', mailValues, {}, 409, mail.revision - 1)
  await save('mail', mailValues, { smtpPassword: '' })
  await post('/settings/mail/test', { recipient: null })
  await post('/settings/mail/test', { recipient: 'smtp-test@example.com' })
  await mailFor('smtp-test@example.com', 'Verify fixture')
  mark('Mail settings persist, secrets stay write-only, CSRF/revision validation and authenticated SMTP tests pass')

  let policy = await get('/auth/settings')
  policy = { ...policy, registration_enabled: true, verification_required: true, recovery_enabled: true, allowed_domains: ['example.com'], gift_usd: '1', enabled_providers: [], agreement: { ...policy.agreement, enabled: false } }
  await result(await admin.request.patch('/api/admin/v1/auth/settings', { headers: headers(admin, { 'If-Match': `"${policy.revision}"` }), data: policy }))
  const email = 'settings-' + randomUUID() + '@example.com'
  await result(await anonymous.request.post('/api/v1/auth/registrations', { headers: { Origin: base }, data: { email, display_name: '<Test user>', password: priv.customerPassword } }), 202)
  const registration = await mailFor(email, 'Verify fixture')
  const token = registration.html.match(/<code>([^<]+)<\/code>/)[1]
  await result(await anonymous.request.post('/api/v1/auth/registrations/verify', { headers: { Origin: base }, data: { token } }), 204)
  await login(customer, email, priv.customerPassword)
  await result(await anonymous.request.post('/api/v1/auth/password-reset', { headers: { Origin: base }, data: { email } }), 202)
  const reset = await mailFor(email, 'Reset fixture')
  const resetUrl = reset.html.match(/href="([^"]+)"/)[1].replaceAll('&amp;', '&')
  assert.ok(resetUrl.startsWith(base + '/forgot-password#confirm&token='))
  const resetToken = new URLSearchParams(new URL(resetUrl).hash.split('&').slice(1).join('&')).get('token')
  const newPassword = priv.customerPassword + 'Changed'
  await result(await anonymous.request.post('/api/v1/auth/password-reset/confirm', { headers: { Origin: base }, data: { token: resetToken, new_password: newPassword } }), 204)
  const identity = await login(customer, email, newPassword)
  priv.customerEmail = email; priv.customerNewPassword = newPassword
  fs.writeFileSync('/test-runtime/private.json', JSON.stringify(priv), { mode: 0o600 })
  mark('Registration verification and password reset send configured templates and complete with single-use tokens')

  let p = (await load('payment')).values
  p = { ...p, enabled: true, minAmount: '1', maxAmount: '500', dailyLimit: '1000', maxPending: '3', rechargeMultiplier: '0.14', subscriptionRate: '7.15', feeRate: '2', alipayAppId: '2026110200000001', alipaySellerId: '2088000000000001', tiers: [{ id: randomUUID(), amount: '10', percent: '10' }] }
  await save('payment', p, { privateKey: 'invalid', publicKey: 'invalid' }, 400)
  let paidSettings = await save('payment', p, { privateKey: priv.merchantKey, publicKey: priv.alipayPublicKey })
  assert.equal(paidSettings.hasSecrets.privateKey, true); assert.ok(!JSON.stringify(paidSettings).includes('BEGIN PRIVATE KEY'))
  await save('payment', p, { privateKey: '', publicKey: '' })
  await result(await customer.request.get('/api/admin/v1/settings/integrations/payment'), 401)
  await payment({ action: 'quote', amount: '0.99' }, 400)
  await payment({ action: 'quote', amount: '500.01' }, 400)
  let quote = await payment({ action: 'quote', amount: '100' })
  assert.equal(quote.creditUsd, '15.400000'); assert.equal(quote.feeCny, '2.00'); assert.equal(quote.totalCny, '102.00')
  const profile = await result(await customer.request.get('/api/v1/profile'))
  p.userOffers = [{ id: randomUUID(), userId: profile.id, amount: '50', percent: '25' }]
  await save('payment', p)
  quote = await payment({ action: 'quote', amount: '100' }); assert.equal(quote.creditUsd, '17.500000')
  const idem = randomUUID()
  const order = await payment({ action: 'create', amount: '100', idempotencyKey: idem })
  assert.equal(order.checkout.mode, 'qrcode')
  assert.equal((await payment({ action: 'create', amount: '100', idempotencyKey: idem })).id, order.id)
  await payment({ action: 'create', amount: '101', idempotencyKey: idem }, 409)
  mark('Server calculates fee/credit/offers, creates RSA2-signed Alipay QR orders and enforces idempotency')

  const fields = await control('pay', { id: order.id })
  const rotatedPublicKey = createPublicKey(priv.merchantKey).export({ type: 'spki', format: 'pem' })
  await save('payment', p, { publicKey: rotatedPublicKey })
  await notify({ ...fields, sign: fields.sign.slice(1) }, 400)
  for (const overrides of [{ total_amount: '0.01' }, { app_id: '0000' }, { seller_id: '0000' }]) {
    await notify(await control('pay', { id: order.id, settle: false, overrides }), 400)
  }
  await Promise.all(Array.from({ length: 8 }, () => notify(fields)))
  assert.equal((await payment({ action: 'get', id: order.id })).status, 'paid')
  const balance = await result(await customer.request.get('/api/v1/billing/balance'))
  assert.equal(Number(balance.available_usd), 18.5)
  await mailFor(email, 'Recharge fixture')
  // Restore the current provider key after verifying the old order's snapshot.
  await save('payment', { ...p, feeRate: '3' }, { publicKey: priv.alipayPublicKey })
  await notify(fields)
  assert.equal(Number((await result(await customer.request.get('/api/v1/billing/balance'))).available_usd), 18.5)
  mark('Tampered signatures, amounts and recipients are rejected; concurrent duplicate callbacks credit the wallet once and send a recharge notice')

  const cancel = await payment({ action: 'create', amount: '20', idempotencyKey: randomUUID() })
  assert.equal((await payment({ action: 'cancel', id: cancel.id })).status, 'cancelled')
  const raced = await payment({ action: 'create', amount: '30', idempotencyKey: randomUUID() })
  await control('pay', { id: raced.id })
  assert.equal((await payment({ action: 'cancel', id: raced.id })).status, 'paid')
  p = { ...p, cancelLimitEnabled: true, cancelMax: '1', cancelWindow: '1', cancelUnit: 'day', cancelMode: 'rolling' }
  await save('payment', p)
  const limited = await payment({ action: 'create', amount: '10', idempotencyKey: randomUUID() })
  await payment({ action: 'cancel', id: limited.id }, 429)
  await save('payment', { ...p, dailyLimit: '100' })
  await payment({ action: 'create', amount: '1', idempotencyKey: randomUUID() }, 429)
  await save('payment', { ...p, maxPending: '1' })
  await payment({ action: 'create', amount: '2', idempotencyKey: randomUUID() }, 409)
  await save('payment', { ...p, cancelLimitEnabled: false })
  assert.ok((await result(await customer.request.get('/api/v1/payments/orders'))).length >= 4)
  mark('Order cancellation closes the provider trade, reconciles paid races, and honors cancellation, daily and pending-order limits')

  await save('payment', { ...p, cancelMax: '2', maxPending: '10' })
  const concurrent = await Promise.all(['7', '8'].map(amount => payment({ action: 'create', amount, idempotencyKey: randomUUID() })))
  const cancellations = await Promise.all(concurrent.map(o => customer.request.post('/api/v1/payments', { headers: headers(customer), data: { action: 'cancel', id: o.id } })))
  assert.deepEqual(cancellations.map(r => r.status()).sort(), [200, 429])
  await save('payment', { ...p, cancelLimitEnabled: false, maxPending: '10' })
  mark('Concurrent cancellations cannot exceed the configured cancellation allowance')

  const features = await get('/workspace/settings/features')
  const nodeId = randomUUID()
  const node = { id: nodeId, name: 'Fixture audit', baseUrl: 'http://172.24.0.1:19581', model: 'jev-latest', timeoutMs: '3000', stateCharLimit: '16000', proxyId: 'direct', enabled: true }
  await result(await admin.request.patch('/api/admin/v1/workspace/settings/features', { headers: headers(admin, { 'If-Match': `"${features.revision}"` }), data: { values: { ...features.values, audit: { ...features.values.audit, shared: { ...features.values.audit.shared, endpoints: [node] } } } } }))
  await save('audit', {}, { [nodeId]: priv.auditKey })
  assert.equal((await post(`/settings/audit/${nodeId}/test`)).ok, true)
  await save('audit', {}, { [nodeId]: '' })
  assert.equal((await post(`/settings/audit/${nodeId}/test`)).ok, true)
  const audit = await load('audit'); assert.equal(audit.hasSecrets[nodeId], true); assert.ok(!JSON.stringify(audit).includes(priv.auditKey))
  await save('audit', {}, { [nodeId]: null })
  assert.equal((await load('audit')).hasSecrets[nodeId] ?? false, false)
  await post(`/settings/audit/${nodeId}/test`, {}, 503)
  await save('audit', {}, { [nodeId]: priv.auditKey })
  mark('Audit nodes use encrypted per-node API keys and return measured connection results')

  // Configure a disposable S3 bucket, create a real database archive, then disable storage.
  await platform('/storage/update', { endpoint: base + '/s3', region: 'us-east-1', bucket: 'settings-fixture', accessKeyId: 'fixture', secretAccessKey: 'fixture', prefix: 'settings', forcePathStyle: true })
  assert.equal((await platform('/storage/test', {})).ok, true)
  let backup = await platform('')
  if (!backup.storageEnabled) {
    await result(await admin.request.patch('/api/admin/v1/settings/backups/state', { headers: headers(admin, { 'If-Match': `"${backup.storageRevision}"` }), data: { enabled: true } }))
  }
  let record = await platform('/create', { expiresInDays: 1 }, 202)
  const backupId = record.id
  await expect.poll(async () => { record = (await platform('/records?page=1&pageSize=20')).items.find((r) => r.id === backupId); if (record?.status === 'failed') throw Error(record.errorCode); return record?.status }, { timeout: 100000, intervals: [1000, 2000, 5000] }).toBe('completed')
  backup = await platform('')
  await result(await admin.request.patch('/api/admin/v1/settings/backups/state', { headers: headers(admin, { 'If-Match': `"${backup.storageRevision}"` }), data: { enabled: false } }))
  assert.equal((await platform('')).storageEnabled, false)
  await platform('/create', { expiresInDays: 1 }, 400)
  const url = await platform('/download-url', { backupId })
  assert.equal((await admin.request.get(url.url)).status(), 200)
  await platform('/delete', { backupId })
  mark('Backup storage enables/disables persistently, blocks new archives while disabled, and preserves download/delete access for existing archives')
  fs.writeFileSync(out + '/api-result.json', JSON.stringify({ checks, customerId: profile.id, orderId: order.id, auditNodeId: nodeId }, null, 2))
}
main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => { if (browser) await browser.close() })
