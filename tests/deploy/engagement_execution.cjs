// End-to-end execution checks against a disposable database; never the regular test site.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { randomUUID } = require('node:crypto')
const webRequire = createRequire(path.resolve(__dirname, '../../web/package.json'))
const { chromium, expect } = webRequire('@playwright/test')
const baseURL = process.env.OVLOAD_TEST_URL
assert.equal(new URL(baseURL).port, '19444', 'Use the disposable verification site')
const privateFile = JSON.parse(fs.readFileSync(process.env.OVLOAD_TEST_PRIVATE_FILE, 'utf8'))
const output = path.resolve(__dirname, '../../test-results/engagement-execution')
fs.mkdirSync(output, { recursive: true })
const checks = [], sessions = new Map(), errors = []
let browser, admin, inviter, invitee, third
function checked(name) { checks.push(name); console.log('PASS ' + name) }
function headers(context, extra = {}) { return { Origin: baseURL, 'X-CSRF-Token': sessions.get(context)?.csrf_token ?? '', ...extra } }
async function result(response, status = 200) {
  assert.equal(response.status(), status, `${response.url()}: ${await response.text()}`)
  return status === 204 ? null : response.json()
}
async function login(context, login, password) {
  const value = await result(await context.request.post('/api/v1/auth/sessions', { headers: { Origin: baseURL }, data: { login, password } }))
  sessions.set(context, value)
}
async function view(context, kind, management = false) { return result(await context.request.get(`/api/${management ? 'admin/' : ''}v1/engagement/${kind}`)) }
async function command(context, body, status = 200, management = false) { return result(await context.request.post(`/api/${management ? 'admin/' : ''}v1/engagement`, { headers: headers(context), data: body }), status) }
async function feature(change) {
  const doc = await result(await admin.request.get('/api/admin/v1/workspace/settings/features'))
  change(doc.values)
  return result(await admin.request.patch('/api/admin/v1/workspace/settings/features', { headers: headers(admin, { 'If-Match': `"${doc.revision}"` }), data: { values: doc.values } }))
}
async function credit(user, amount, paid, key = randomUUID(), status = 200) {
  return result(await admin.request.post(`/api/admin/v1/billing/wallets/${user.tenant_id}/credits`, { headers: headers(admin, { 'Idempotency-Key': key }), data: { amount_usd: amount, reason: 'Engagement execution verification', ...(paid ? { paid_cny: paid } : {}) } }), status)
}
async function balance(context) { return (await result(await context.request.get('/api/v1/billing/balance'))).settled_usd }
async function main() {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-features=BackForwardCache', '--disk-cache-size=33554432'] })
  const options = { baseURL, ignoreHTTPSErrors: true, locale: 'zh-CN', viewport: { width: 1440, height: 1000 } }
  admin = await browser.newContext(options); inviter = await browser.newContext(options); invitee = await browser.newContext(options); third = await browser.newContext(options)
  for (const c of [admin, inviter, invitee, third]) await c.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'))
  await login(admin, 'ovload_verify_admin', privateFile.administratorPassword)
  await feature(v => { v.audit.prompt.enabled = false; v.audit.content.enabled = false; Object.assign(v.referral, { enabled: true, rate: '10', freezeHours: '0', cap: '8', eligibilityDays: '0', overrides: [] }) })
  const previous = (await view(admin, 'lottery', true)).current
  if (previous) await command(admin, { op: 'end_lottery', round_id: previous.id }, 200, true)
  const suffix = Date.now()
  const a = await result(await admin.request.post('/api/admin/v1/users', { headers: headers(admin), data: { email: `engagement-inviter-${suffix}@example.com`, display_name: '返利验证邀请人', password: privateFile.customerPassword, max_concurrency: 5, requests_per_minute: 1000, notes: 'Disposable verification' } }), 201)
  await login(inviter, a.email, privateFile.customerPassword)
  const code = (await view(inviter, 'referrals')).summary.code
  async function register(context, label) {
    const email = `engagement-${label}-${suffix}@example.com`
    await result(await context.request.post('/api/v1/auth/registrations', { headers: { Origin: baseURL }, data: { email, display_name: label, password: privateFile.customerPassword, invitation_code: code } }), 202)
    await login(context, email, privateFile.customerPassword)
    return result(await context.request.get('/api/v1/profile'))
  }
  const b = await register(invitee, 'invitee'), c = await register(third, 'third')
  assert.equal((await view(inviter, 'referrals')).summary.invited, 2)
  await view(invitee, 'referrals')
  assert.equal((await invitee.request.get(`/api/v1/engagement/referrals-${a.id}`)).status(), 403)
  assert.equal((await invitee.request.get('/api/v1/engagement/audit')).status(), 403)
  assert.equal((await admin.request.post('/api/admin/v1/engagement', { headers: { Origin: baseURL }, data: { op: 'end_lottery', round_id: 1 } })).status(), 403)
  checked('Registration binds invitations once; customer isolation and CSRF checks hold')
  const purchase = randomUUID()
  await credit(b, '100', '700', purchase)
  await credit(b, '100', '700', purchase)
  await credit(b, '101', '700', purchase, 409)
  await credit(b, '100', '700')
  await credit(b, '7', undefined)
  let referral = await view(inviter, 'referrals')
  assert.equal(Number(referral.summary.available), 8); assert.equal(referral.rebates.length, 1)
  assert.equal(Number(await balance(invitee)), 207)
  checked('Confirmed recharge is idempotent; per-invitee rebate cap holds; balance adjustments earn no rebate')
  const transfer = { op: 'transfer_referral', key: randomUUID() }
  const receipts = await Promise.all(Array.from({ length: 8 }, () => command(inviter, transfer)))
  assert.ok(receipts.every(r => r.id === receipts[0].id))
  assert.equal(Number(await balance(inviter)), 8)
  await command(inviter, { op: 'transfer_referral', key: randomUUID() }, 409)
  checked('Concurrent referral transfer retries credit the wallet exactly once')
  await feature(v => { v.referral.freezeHours = '1'; v.referral.rate = '20'; v.referral.cap = '0' })
  await credit(c, '10', '70')
  referral = await view(inviter, 'referrals')
  assert.equal(Number(referral.summary.frozen), 2); assert.equal(Number(referral.summary.available), 0)
  await command(inviter, { op: 'transfer_referral', key: randomUUID() }, 409)
  await result(await admin.request.post('http://172.24.0.1:19091/fixture/release', { headers: { 'X-Fixture-Token': privateFile.fixtureToken }, data: {} }))
  assert.equal(Number((await view(inviter, 'referrals')).summary.available), 2)
  await command(inviter, { op: 'transfer_referral', key: randomUUID() })
  assert.equal(Number(await balance(inviter)), 10)
  checked('Frozen earnings cannot transfer; elapsed freeze unlocks them without a background credit race')
  await command(invitee, { op: 'start_lottery', key: randomUUID(), reward_cents: 125, winner_count: 1, participant_target: 2, minimum_recharge_cents: 1, human_verification: false }, 403)
  const start = { op: 'start_lottery', key: randomUUID(), reward_cents: 125, winner_count: 1, participant_target: 2, minimum_recharge_cents: 1, human_verification: false }
  const starts = await Promise.all(Array.from({ length: 4 }, () => command(admin, start, 200, true)))
  let round = starts[0]
  assert.ok(starts.every(r => r.id === round.id))
  await command(admin, { ...start, reward_cents: 126 }, 409, true)
  await command(inviter, { op: 'join_lottery', round_id: round.id }, 403)
  await Promise.all(Array.from({ length: 6 }, () => command(invitee, { op: 'join_lottery', round_id: round.id })))
  assert.equal((await view(admin, 'lottery', true)).current.participants, 1)
  const before = Number(await balance(invitee)) + Number(await balance(third))
  await Promise.all([(async () => {
    const joined = await third.request.post('/api/v1/engagement', { headers: headers(third), data: { op: 'join_lottery', round_id: round.id } })
    assert.ok([200, 409].includes(joined.status()), 'Join either precedes the draw or observes its closed round')
  })(), command(admin, { op: 'end_lottery', round_id: round.id }, 200, true),
    ...Array.from({ length: 8 }, () => command(invitee, { op: 'join_lottery', round_id: round.id }))])
  await command(admin, { op: 'end_lottery', round_id: round.id }, 200, true)
  const lottery = await view(admin, 'lottery', true)
  assert.equal(lottery.current, null); assert.equal(lottery.winners.filter(w => w.round === round.id).length, 1)
  assert.equal(Number(await balance(invitee)) + Number(await balance(third)), before + 1.25)
  checked('Paid recharge eligibility, unique participation, concurrent draw/end and one ledger award hold')
  round = await command(admin, { op: 'start_lottery', key: randomUUID(), reward_cents: 100, winner_count: 2, participant_target: 3, minimum_recharge_cents: 0, human_verification: true }, 200, true)
  let challenge = await command(inviter, { op: 'lottery_challenge', round_id: round.id })
  assert.ok(challenge.image.startsWith('data:image/png;base64,'), 'The challenge contains pixels rather than an exposed answer')
  await command(inviter, { op: 'join_lottery', round_id: round.id, challenge_id: challenge.id, answer: 'WRONG!' }, 400)
  await command(inviter, { op: 'join_lottery', round_id: round.id, challenge_id: challenge.id, answer: 'ABC123' }, 400)
  challenge = await command(inviter, { op: 'lottery_challenge', round_id: round.id })
  const { answer: correct } = await result(await admin.request.post('http://172.24.0.1:19091/fixture/challenge', { headers: { 'X-Fixture-Token': privateFile.fixtureToken }, data: { id: challenge.id } }))
  await command(inviter, { op: 'join_lottery', round_id: round.id, challenge_id: challenge.id, answer: correct })
  await command(admin, { op: 'end_lottery', round_id: round.id }, 200, true)
  assert.equal((await view(admin, 'lottery', true)).rounds.find(r => r.id === round.id).status, 'cancelled')
  checked('Verification challenges expire after one attempt; insufficient eligible entries cancel without awards')
  const groupPage = await result(await admin.request.get('/api/admin/account-groups'))
  const groups = groupPage.data.items
  if (!groups.length) {
    const created = await result(await admin.request.post('/api/admin/account-groups/create', { headers: headers(admin), data: { name: 'Audit execution verification', description: 'Disposable verification group', color: '#3B82F6FF', visibility: 'private', retailMultiplierBps: 10000, modelRoutes: null, allowImageGeneration: false, fastMode: 'default' } }), 201)
    groups.push(created.data.record)
  }
  assert.ok(groups?.length, 'Audit UI verification needs a real configured account group')
  await feature(v => { v.audit.prompt.enabled = true; v.audit.prompt.mode = 'observe'; Object.assign(v.audit.shared, { keywordMode: 'keyword_only', keywords: 'forbidden', groupIds: [groups[0].id] }) })
  for (const [context, route, name] of [[admin, '/page-settings', 'lottery-settings'], [admin, '/referrals/rebates', 'referral-ledger'], [admin, '/security-audit', 'content-audit'], [inviter, '/user/referrals', 'personal-referrals'], [invitee, '/user/lottery', 'customer-lottery']]) {
    const page = await context.newPage()
    page.on('pageerror', e => errors.push(e.message))
    page.on('response', response => { if (response.url().includes('/engagement') && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`) })
    try {
      await page.goto(route); await page.locator('main').waitFor(); await page.waitForTimeout(500)
      await expect(page).toHaveURL(new RegExp(route.replaceAll('/', '\\/') + '/?$'))
      if (route === '/page-settings') {
        await page.getByRole('tab', { name: '抽奖活动', exact: true }).click()
        await page.getByRole('button', { name: '发起抽奖', exact: true }).click()
        await expect(page.locator('input[name="reward"]')).toBeEnabled()
        for (const [field, value] of [['reward', '0.50'], ['winnerCount', '1'], ['participantTarget', '2'], ['minimumRecharge', '0']]) await page.locator(`input[name="${field}"]`).fill(value)
        await page.getByRole('dialog').getByRole('button', { name: '发起抽奖', exact: true }).click()
        await expect(page.getByRole('dialog')).toHaveCount(0)
        assert.equal((await view(admin, 'lottery', true)).current.rewardCents, 50)
        await page.getByRole('button', { name: '结束活动', exact: true }).click()
        await page.getByRole('alertdialog').getByRole('button', { name: '继续', exact: true }).click()
        await expect(page.getByRole('alertdialog')).toHaveCount(0)
        assert.equal((await view(admin, 'lottery', true)).current, null)
        await command(admin, { op: 'start_lottery', key: randomUUID(), reward_cents: 100, winner_count: 1, participant_target: 3, minimum_recharge_cents: 0, human_verification: false }, 200, true)
      }
      if (route === '/user/lottery') {
        await page.getByRole('button', { name: '参与抽奖', exact: true }).click()
        await expect(page.getByText('已参与', { exact: true }).first()).toBeVisible()
        await expect(page.getByRole('button', { name: '参与抽奖', exact: true })).toBeDisabled()
        assert.equal((await view(invitee, 'lottery')).current.joined, true)
      }
      if (route === '/security-audit') {
        const before = await view(admin, 'audit', true)
        assert.ok(before.length, 'Audit samples must be present for the record operation check')
        const remove = page.getByRole('button', { name: `删除 ${before[0].id}`, exact: true })
        await expect(remove).toBeEnabled()
        await remove.click()
        await page.getByRole('alertdialog').getByRole('button', { name: '删除', exact: true }).click()
        await expect(page.getByRole('alertdialog')).toHaveCount(0)
        assert.ok(!(await view(admin, 'audit', true)).some(record => record.id === before[0].id))
      }
      await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route + ' overflow')
      if (route.startsWith('/user/')) {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.screenshot({ path: path.join(output, name + '-mobile.png'), fullPage: true })
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route + ' mobile overflow')
      }
    } catch (error) {
      await page.screenshot({ path: path.join(output, name + '-failed.png'), fullPage: true })
      console.error('Page check failed', route, page.url(), errors)
      throw error
    } finally { await page.close() }
  }
  assert.deepEqual(errors, [])
  checked('Original page layouts render with live records and enabled operations')
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ checks, errors, users: [a.id, b.id, c.id] }, null, 2))
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (browser) {
    for (const context of [admin, inviter, invitee, third]) {
      if (context && sessions.has(context)) await context.request.delete('/api/v1/auth/session', { headers: headers(context) }).catch(() => {})
    }
    await browser.close()
  }
})
