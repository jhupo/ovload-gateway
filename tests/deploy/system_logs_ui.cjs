const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const { chromium, expect } = createRequire('/src/web/package.json')('@playwright/test')
const live = process.argv.includes('live'), baseURL = 'https://192.168.2.150:19443'
const out = '/src/test-results/system-logs'

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
    const file = path.join('/src/web/dist-system-logs', route.request().resourceType() === 'document' ? 'index.html' : url.pathname)
    return fs.existsSync(file) && fs.statSync(file).isFile() ? route.fulfill({ path: file }) : route.continue()
  })
  const page = await context.newPage(), errors = [], failed = [], checks = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('response', r => { if (r.url().includes('/api/') && r.status() >= 500) failed.push(r.url()) })
  try {
    await page.goto('/monitoring'); await page.waitForLoadState('networkidle')
    const section = page.getByTestId('system-logs')
    await expect(section).toHaveCount(1)
    await expect(page.getByRole('heading',{name:'运行错误历史',exact:true})).toHaveCount(0)
    await expect(page.getByTestId('alert-events')).toHaveCount(0)
    await expect(section.getByRole('table')).toBeVisible()
    await expect(section.getByRole('button',{name:'清理当前筛选结果'})).toHaveCount(0)
    const responsePromise = page.waitForResponse(r => r.url().includes('/operations/errors') && r.status() === 200)
    await section.getByRole('button',{name:'刷新',exact:true}).click()
    const payload = (await (await responsePromise).json()).data
    assert.ok(payload.total > 0, 'Use existing operational logs to verify rendered records')
    await expect(section.getByRole('button',{name:'日志详情'}).first()).toBeVisible()
    await section.getByRole('button',{name:'日志详情'}).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('dialog')).toContainText(payload.items[0].failureClass)
    await page.screenshot({path:`${out}/${live ? 'live' : 'candidate'}-detail.png`})
    await page.keyboard.press('Escape')
    const search = section.getByRole('textbox',{name:'搜索日志',exact:true})
    const searchResponse = page.waitForResponse(r => r.url().includes('/operations/errors') && new URL(r.url()).searchParams.get('search') === 'no-log-match-1234567')
    await search.fill('no-log-match-1234567')
    assert.equal((await (await searchResponse).json()).data.total,0)
    await expect(section.getByRole('table')).toContainText('无结果')
    await section.getByRole('button',{name:'重置',exact:true}).click()
    await expect(section.getByRole('button',{name:'日志详情'}).first()).toBeVisible()
    const idResponse = page.waitForResponse(r => r.url().includes('/operations/errors') && new URL(r.url()).searchParams.get('requestId') === 'missing-request-1234567')
    await section.getByRole('textbox',{name:'请求 ID',exact:true}).fill('missing-request-1234567')
    assert.equal((await (await idResponse).json()).data.total,0)
    await section.getByRole('button',{name:'重置',exact:true}).click()
    await expect(section.getByRole('button',{name:'日志详情'}).first()).toBeVisible()
    await section.scrollIntoViewIfNeeded()
    await page.screenshot({path:`${out}/${live ? 'live' : 'candidate'}-desktop.png`})
    await page.setViewportSize({width:390,height:844})
    await section.scrollIntoViewIfNeeded()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await expect(section.getByRole('table')).not.toBeVisible()
    await expect(section.locator('article').first()).toBeVisible()
    await page.screenshot({path:`${out}/${live ? 'live' : 'candidate'}-mobile.png`})
    checks.push('One system log section; obsolete error/alert sections removed; real refresh, keyword/request-ID filters, details and responsive cards verified')
    assert.deepEqual(errors, []); assert.deepEqual(failed, [])
    fs.writeFileSync(`${out}/${live ? 'live' : 'candidate'}.json`, JSON.stringify({ passed: true, checks }, null, 2))
    console.log(checks.map(c => 'PASS ' + c).join('\n'))
  } finally {
    await context.request.delete('/api/admin/v1/auth/session', { headers: { Origin: baseURL, 'X-CSRF-Token': auth.csrf_token } }).catch(() => {})
    await browser.close()
  }
}
main().catch(e => { console.error(e); process.exitCode = 1 })
