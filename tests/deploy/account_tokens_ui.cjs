const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium, expect } = require('node:module').createRequire('/src/web/package.json')('@playwright/test');
const baseURL = 'https://192.168.2.150:19443', out = '/src/test-results/account-tokens';
const oauth = 'acct_01a1daf7af217688b3e6a31c4a0ea9e2', api = 'acct_01a1cfdfcaa1729f82a32c60ae9fba38';
const live = process.argv.includes('--live');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, timezoneId: 'Asia/Shanghai', viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  const login = await ctx.request.post('/api/v1/auth/sessions', { headers: { Origin: baseURL }, data: { login: 'ovload_test_admin', password: fs.readFileSync('/verify/administrator.password', 'utf8').trim() } });
  assert.equal(login.status(), 200); const session = await login.json();
  const get = async route => { const res = await ctx.request.get('/api/admin/accounts/' + route); assert.equal(res.status(), 200); return (await res.json()).data; };
  if (!live) await ctx.route('**/*', r => {
    const u = new URL(r.request().url()); if (u.origin !== baseURL || u.pathname.startsWith('/api/')) return r.continue();
    let file = path.join('/src/web/dist-account-tokens', u.pathname);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = '/src/web/dist-account-tokens/index.html';
    return r.fulfill({ path: file });
  });
  const page = await ctx.newPage(), errors = [], checks = [];
  page.on('pageerror', e => errors.push(e.message));
  const dialog = () => page.getByRole('dialog');
  async function open(id, name) {
    await page.locator(`#account-actions-${id}:visible`).click();
    await page.getByRole('menuitem', { name, exact: true }).click();
    await expect(dialog()).toBeVisible();
    await expect(dialog().locator('[data-slot="skeleton"]')).toHaveCount(0, { timeout: 45000 });
  }
  async function shot(name) {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `${out}/${live ? 'live-' : ''}${name}.png` });
  }
  async function close() { await page.keyboard.press('Escape'); await expect(dialog()).toHaveCount(0); }
  try {
    const usage = (await get('detail?accountId=' + api)).account.usage;
    await page.goto('/accounts'); await expect(page.locator(`#account-actions-${oauth}:visible`)).toBeVisible({ timeout: 30000 });
    await open(api, '用量详情');
    for (const text of ['60.94K', '60.82K', '25.03K']) await expect(dialog().getByText(text, { exact: true }).first()).toBeVisible();
    await expect(dialog().getByText('证据不完整', { exact: true })).toHaveCount(0);
    await expect(dialog().getByText(/^最近调用\s+/)).toHaveCount(0);
    const hint = `${usage.knownCostCount} 笔已有成本，${usage.unknownCostCount} 笔缺少成本数据；金额仅包含已知部分`;
    await dialog().getByRole('img', { name: hint, exact: true }).first().hover();
    await expect(page.getByRole('tooltip', { name: hint, exact: true })).toBeVisible();
    await page.mouse.move(0, 0);
    const date = new Intl.DateTimeFormat('zh', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Shanghai' }).format(new Date(usage.models[0].lastUsedAt));
    await expect(dialog().getByRole('cell', { name: date, exact: true })).toBeVisible();
    await shot('usage');
    await page.setViewportSize({ width: 390, height: 844 }); await shot('usage-mobile');
    await close(); await page.setViewportSize({ width: 1440, height: 1000 });
    checks.push('Usage compact tokens, accurate cost coverage tooltip, no recent-call footer, local timezone');
    await open(oauth, '个人信息');
    await expect(dialog().getByText('66.46B', { exact: true })).toBeVisible({ timeout: 45000 });
    await expect(dialog().getByText('6.08B', { exact: true })).toBeVisible();
    assert.equal(await dialog().getByText('66.46B', { exact: true }).getAttribute('title'), '66,459,730,901');
    await shot('profile');
    await page.setViewportSize({ width: 390, height: 844 }); await shot('profile-mobile');
    await close(); await page.setViewportSize({ width: 1440, height: 1000 });
    checks.push('Upstream profile uses B suffix, full original number preserved, desktop and mobile layouts');
    await open(oauth, '用量详情');
    await expect(dialog().getByText('暂无用量数据', { exact: true }).first()).toBeVisible();
    await shot('empty-usage'); await close();
    assert.equal((await get('detail?accountId=' + api)).account.usage.totalTokens, usage.totalTokens);
    assert.deepEqual(errors, []);
    fs.writeFileSync(`${out}/${live ? 'live' : 'browser'}.json`, JSON.stringify({ passed: true, checks, errors }, null, 2));
  } catch (error) { await page.screenshot({ path: out + '/failure.png' }); throw error; }
  finally { await ctx.request.delete('/api/admin/v1/auth/session', { headers: { Origin: baseURL, 'X-CSRF-Token': session.csrf_token } }); await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
