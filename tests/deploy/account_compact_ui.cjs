const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium, expect } = require('node:module').createRequire('/src/web/package.json')('@playwright/test');
const baseURL = 'https://192.168.2.150:19443', out = '/src/test-results/account-compact';
const id = 'acct_01a1daf7af217688b3e6a31c4a0ea9e2', live = process.argv.includes('--live');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
  const login = await ctx.request.post('/api/v1/auth/sessions', { headers: { Origin: baseURL }, data: { login: 'ovload_test_admin', password: fs.readFileSync('/verify/administrator.password', 'utf8').trim() } });
  assert.equal(login.status(), 200); const session = await login.json();
  if (!live) await ctx.route('**/*', r => {
    const u = new URL(r.request().url()); if (u.origin !== baseURL || u.pathname.startsWith('/api/')) return r.continue();
    let file = path.join('/src/web/dist-account-compact', u.pathname);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = '/src/web/dist-account-compact/index.html';
    return r.fulfill({ path: file });
  });
  const page = await ctx.newPage(), errors = [], checks = [];
  page.on('pageerror', e => errors.push(e.message));
  const actions = () => page.locator(`#account-actions-${id}:visible`);
  const dialog = () => page.getByRole('dialog');
  async function open(name) { await actions().click(); await page.getByRole('menuitem', { name, exact: true }).click(); await expect(dialog()).toBeVisible(); }
  async function shot(name) {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `${out}/${live ? 'live-' : ''}${name}.png` });
  }
  try {
    await page.goto('/accounts'); await expect(actions()).toBeVisible({ timeout: 30000 });
    for (const label of ['OpenAI', 'Claude', 'Gemini', 'Grok']) {
      const icon = page.getByRole('img', { name: label, exact: true }).first();
      await expect(icon).toBeVisible(); assert.equal(await icon.innerText(), '');
      assert.ok(await icon.locator('img').evaluate(img => img.complete && img.naturalWidth > 0));
      await icon.hover(); await expect(page.getByRole('tooltip', { name: label, exact: true })).toBeVisible();
    }
    await page.mouse.move(0, 0); await shot('icons');
    checks.push('All four provider icons load; no visible provider/auth text; tooltip names');
    for (const [name, slug] of [['用量详情', 'usage'], ['个人信息', 'profile'], ['额度预测', 'forecast'], ['额度重置', 'reset'], ['模型', 'models'], ['连接测试', 'connection'], ['编辑账号', 'editor']]) {
      await open(name);
      // Queries use the real saved OAuth account; wait for transient loading to settle.
      await expect(dialog().getByText('加载中…', { exact: true })).toHaveCount(0, { timeout: 45000 });
      await expect(dialog().locator('[data-slot="skeleton"]')).toHaveCount(0, { timeout: 45000 });
      if (slug === 'connection') {
        await expect(dialog().getByRole('button', { name: '开始测试', exact: true })).toBeEnabled({ timeout: 45000 });
        if (!live) {
          await dialog().getByRole('combobox').click();
          await page.getByRole('option', { name: 'gpt-6-luna', exact: true }).click();
          await dialog().getByRole('button', { name: '开始测试', exact: true }).click();
          await expect(dialog().getByRole('status')).toContainText('测试通过', { timeout: 180000 });
          checks.push('Real OAuth account text test succeeds through browser SSE handling');
        }
      }
      await expect.poll(async () => (await dialog().boundingBox()).width).toBeLessThanOrEqual(900);
      const rect = await dialog().boundingBox(); assert.ok(rect.height < 970);
      if (slug === 'usage') assert.ok(rect.height < 760);
      await shot(slug);
      if (slug === 'usage' || slug === 'profile' || slug === 'connection') {
        await page.setViewportSize({ width: 390, height: 844 });
        await expect.poll(async () => { const rect = await dialog().boundingBox(); return rect.width <= 360 && rect.height <= 814; }).toBe(true);
        await shot(slug + '-mobile'); await page.setViewportSize({ width: 1440, height: 1000 });
      }
      await page.keyboard.press('Escape'); await expect(dialog()).toHaveCount(0);
      checks.push(name + ' opens independently and fits viewport');
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(`${out}/${live ? 'live' : 'browser'}.json`, JSON.stringify({ passed: true, checks, errors }, null, 2));
  } catch (error) { await page.screenshot({ path: out + '/failure.png' }); throw error; }
  finally { await ctx.request.delete('/api/admin/v1/auth/session', { headers: { Origin: baseURL, 'X-CSRF-Token': session.csrf_token } }); await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
