const assert = require('node:assert/strict')
const fs = require('node:fs')
const { createRequire } = require('node:module')
const { chromium, expect } = createRequire('/src/web/package.json')('@playwright/test')
const base = 'https://192.168.2.150:19444'
const out = '/src/test-results/storage-extensions'
const privateConfig = JSON.parse(fs.readFileSync('/test-runtime/private.json', 'utf8'))
const checks = []
const imagePrefix = 'ui-images-' + Date.now()
let browser, context, csrf
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const mark = name => { checks.push(name); console.log('PASS ' + name) }
async function parse(response, expected = 200) {
  assert.equal(response.status(), expected, `${response.url()} ${await response.text()}`)
  return expected === 204 ? null : response.json()
}
async function platform(path, body, status = 200) {
  return (await parse(await context.request.fetch('/api/admin/settings/backups' + path, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: base, 'X-CSRF-Token': csrf }, data: body }), status)).data
}
async function control(path, data = {}) {
  return parse(await context.request.post('http://172.24.0.1:19093/fixture/' + path, { headers: { 'X-Fixture-Token': privateConfig.fixtureToken }, data }))
}
async function login() {
  const value = await parse(await context.request.post('/api/v1/auth/sessions', { headers: { Origin: base }, data: { login: 'ovload_storage_verify', password: privateConfig.administratorPassword } }))
  csrf = value.csrf_token
  await parse(await context.request.post('/api/admin/v1/auth/step-up', { headers: { Origin: base, 'X-CSRF-Token': csrf }, data: { password: privateConfig.administratorPassword } }))
}
async function restore(id, expected) {
  const job = await platform('/restore', { backupId: id, confirmation: 'RESTORE' }, 202)
  let result
  for (let attempt = 0; attempt < 150; attempt++) {
    try {
      const response = await context.request.get('/api/backup-restore/status?id=' + job.id, { headers: { 'X-Restore-Ticket': job.ticket }, timeout: 5000 })
      if (response.ok()) {
        result = (await response.json()).data
        if (['completed', 'failed'].includes(result.status)) break
      }
    } catch {}
    await pause(2000)
  }
  assert.equal(result?.status, expected, JSON.stringify(result))
  await parse(await context.request.get('/api/backup-restore/status?id=' + job.id, { headers: { 'X-Restore-Ticket': '0'.repeat(64) } }), 404)
  return result
}
async function main() {
  fs.mkdirSync(out, { recursive: true })
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  context = await browser.newContext({ baseURL: base, ignoreHTTPSErrors: true, locale: 'zh-CN', viewport: { width: 1440, height: 1000 } })
  await context.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'))
  await login()
  const anonymous = await browser.newContext({ baseURL: base, ignoreHTTPSErrors: true })
  await parse(await anonymous.request.get('/api/admin/settings/backups/images'), 401)
  await parse(await context.request.post('/api/admin/settings/backups/restore', { headers: { Origin: base }, data: { backupId: 'anything', confirmation: 'RESTORE' } }), 403)
  await platform('/restore', { backupId: 'anything', confirmation: 'incorrect' }, 400)
  mark('Restore and image settings require management authority, CSRF and explicit confirmation')
  await platform('/storage/update', { endpoint: 'https://192.168.2.150:19445', region: 'auto', bucket: 'verification', prefix: 'restore', accessKeyId: 'fixture-backup-access', secretAccessKey: 'fixture-backup-secret', forcePathStyle: true })
  assert.equal((await platform('/storage/test', {})).ok, true)
  await platform('/schedule/update', { scheduleEnabled: false, cronExpression: '0 2 * * *', retentionDays: 0, retentionCount: 0 })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/data-backup')
  await expect(page.locator('#image-endpoint')).toBeEnabled()
  await page.locator('#image-endpoint').fill('https://192.168.2.150:19445')
  await page.locator('#image-region').fill('auto')
  await page.locator('#image-bucket').fill('verification')
  await page.locator('#image-prefix').fill(imagePrefix)
  await page.locator('#image-public-domain').fill('')
  await page.locator('#image-expiry').fill('2')
  const imageSection = page.locator('[data-slot="card"]').filter({ has: page.locator('#image-endpoint') })
  await imageSection.getByRole('button', { name: '保存', exact: true }).click()
  await expect(imageSection.getByRole('button', { name: '保存', exact: true })).toBeDisabled()
  await imageSection.getByRole('button', { name: '测试连接', exact: true }).click()
  const testDialog = page.getByRole('alertdialog')
  await expect(testDialog).toBeVisible()
  await testDialog.getByRole('button', { name: '执行测试', exact: true }).click()
  await expect(testDialog).toHaveCount(0)
  const settings = await platform('/images')
  assert.equal(settings.verified, true)
  assert.equal(settings.prefix, imagePrefix)
  assert.equal(settings.hasSecret, true)
  assert.equal(settings.secretAccessKey, undefined)
  await page.locator('#image-endpoint').scrollIntoViewIfNeeded()
  await page.screenshot({ path: out + '/image-storage-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('#image-endpoint').scrollIntoViewIfNeeded()
  await page.waitForTimeout(4500)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await page.screenshot({ path: out + '/image-storage-mobile.png' })
  await imageSection.getByRole('button', { name: '测试连接', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: out + '/image-storage-mobile-bottom.png' })
  await page.setViewportSize({ width: 1440, height: 1000 })
  mark('Original image storage form saves, tests, preserves credentials and fits desktop/mobile')
  await control('marker/create')
  const backup = await platform('/create', { expiresInDays: 1 }, 202)
  let record
  for (let attempt = 0; attempt < 70; attempt++) {
    const records = await platform('/records?page=1&pageSize=100')
    record = records.items.find(value => value.id === backup.id)
    if (record?.status === 'completed') break
    assert.notEqual(record?.status, 'failed', JSON.stringify(record))
    await pause(2000)
  }
  assert.equal(record?.status, 'completed')
  await control('marker/change')
  await page.getByRole('tab', { name: '定时备份', exact: true }).click()
  const row = page.getByRole('row').filter({ hasText: backup.id })
  await row.getByRole('button', { name: '恢复', exact: true }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog.getByRole('button', { name: '恢复', exact: true })).toBeDisabled()
  await dialog.locator('#backup-restore-confirm').fill('RESTORE')
  await expect(dialog.getByRole('button', { name: '恢复', exact: true })).toBeEnabled()
  await page.screenshot({ path: out + '/restore-confirmation.png', fullPage: true })
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  mark('A real backup completes and overwrite confirmation requires the exact phrase')
  await control('corrupt', { id: backup.id })
  const corrupt = await restore(backup.id, 'failed')
  assert.match(corrupt.message, /SHA-256/)
  assert.equal((await control('marker/read')).value, 'after')
  mark('Corrupted object is rejected by SHA-256 before changing data')
  await control('repair', { id: backup.id })
  await control('poison', { id: backup.id })
  const poison = await restore(backup.id, 'failed')
  assert.match(poison.message, /SQL|回滚/)
  assert.equal((await control('marker/read')).value, 'after')
  mark('SQL failure after schema replacement rolls the entire transaction back')
  await control('repair', { id: backup.id })
  await page.reload()
  await page.getByRole('tab', { name: '定时备份', exact: true }).click()
  const current = page.getByRole('row').filter({ hasText: backup.id })
  await current.getByRole('button', { name: '恢复', exact: true }).click()
  await page.getByRole('alertdialog').locator('#backup-restore-confirm').fill('RESTORE')
  await page.getByRole('alertdialog').getByRole('button', { name: '恢复', exact: true }).click()
  await expect(page.getByRole('heading', { name: '数据库恢复成功', exact: true })).toBeVisible({ timeout: 180000 })
  await page.screenshot({ path: out + '/restore-completed.png', fullPage: true })
  assert.equal((await control('marker/read')).value, 'before')
  await parse(await context.request.get('/api/admin/v1/session'), 401)
  await page.getByRole('button', { name: '重新登录', exact: true }).click()
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
  await login()
  assert.equal((await platform('/images')).prefix, imagePrefix)
  assert.deepEqual(errors, [])
  mark('Browser restores real data, follows runtime restart, revokes old sessions and signs in again')
  fs.writeFileSync(out + '/result.json', JSON.stringify({ checks, errors }, null, 2))
}
main().catch(error => {
  console.error(String(error.stack || error).replaceAll(privateConfig.fixtureToken, '[REDACTED]').replaceAll(privateConfig.administratorPassword, '[REDACTED]'))
  process.exitCode = 1
}).finally(async () => { if (browser) await browser.close() })
