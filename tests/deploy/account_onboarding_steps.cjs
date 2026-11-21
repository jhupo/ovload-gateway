// Server-only browser regression; real OAuth link generation, mocked credential exchange/import.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium, expect } = require('node:module').createRequire('/src/web/package.json')('@playwright/test');
const live = process.argv.includes('--live');
const baseURL = 'https://192.168.2.150:19443', out = '/src/test-results/account-onboarding';
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript(() => { localStorage.setItem('i18nextLng', 'zh'); });
  const login = await ctx.request.post('/api/v1/auth/sessions', { headers: { Origin: baseURL }, data: { login: 'ovload_test_admin', password: fs.readFileSync('/verify/administrator.password', 'utf8').trim() } });
  assert.equal(login.status(), 200); const session = await login.json();
  if (!live) await ctx.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.origin !== baseURL || u.pathname.startsWith('/api/')) return r.continue();
    let file = path.join('/src/web/dist-onboarding', u.pathname);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = '/src/web/dist-onboarding/index.html';
    return r.fulfill({ path: file });
  });
  const page = await ctx.newPage(), errors = [], checks = [];
  page.on('pageerror', e => errors.push(e.message));
  const dialog = () => page.getByRole('dialog').first();
  const reply = (r, data) => r.fulfill({ json: { code: 200, data } });
  async function shot(name) { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await page.screenshot({ path: `${out}/${name}.png` }); }
  const id = 'acct_01a1cfdfcaa1729f82a32c60ae9fba38';
  let completed = 0, updates = 0, previews = 0, imports = 0;
  try {
    const realDetail = await ctx.request.get('/api/admin/accounts/detail?accountId=' + id); assert.equal(realDetail.status(), 200);
    const detail = await realDetail.json();
    await ctx.route('**/api/admin/accounts/oauth/complete', r => {
      completed++; assert.equal(r.request().postDataJSON().settings.enabled, false);
      return reply(r, { accountId: id });
    });
    await ctx.route('**/api/admin/accounts/detail?*', r => r.fulfill({ json: detail }));
    await ctx.route('**/api/admin/accounts/models?*', r => r.fulfill({ status: 502, json: { message: 'Catalog temporarily unavailable' } }));
    await ctx.route('**/api/admin/accounts/models/refresh', r => reply(r, { models: [{ id: 'gpt-5.6-luna', label: 'gpt-5.6-luna' }, { id: 'gpt-image-2', label: 'gpt-image-2' }] }));
    await ctx.route('**/api/admin/accounts/batch-update', r => {
      updates++; const data = r.request().postDataJSON();
      assert.deepEqual(data.accountIds, [id]); assert.equal(data.enabled, true);
      assert.deepEqual(data.modelAccess, { mode: 'allowlist', models: ['gpt-5.6-luna'] });
      return updates === 1 ? r.fulfill({ status: 409, json: { message: 'Revision conflict' } }) : reply(r, {});
    });
    await page.goto('/accounts?status=normal&query=API');
    await page.getByRole('button', { name: '添加账号', exact: true }).click();
    await expect(dialog().getByText('模型策略', { exact: true })).toHaveCount(0);
    await dialog().getByLabel('账号', { exact: true }).fill('Onboarding UI verification');
    await dialog().getByRole('switch', { name: '启用', exact: true }).click();
    await shot('details-desktop');
    const started = page.waitForResponse(r => new URL(r.url()).pathname === '/api/admin/accounts/oauth/start');
    await dialog().getByRole('button', { name: '下一步', exact: true }).click();
    const startResponse = await started; assert.equal(startResponse.status(), 201);
    const link = dialog().getByLabel('授权链接', { exact: true }); await expect(link).toBeVisible();
    assert.equal(new URL(await link.inputValue()).protocol, 'https:');
    await expect(dialog().getByLabel('并发上限', { exact: true })).toHaveCount(0);
    await expect(dialog().getByText('模型策略', { exact: true })).toHaveCount(0);
    await dialog().getByRole('button', { name: '复制链接', exact: true }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), await link.inputValue());
    await shot('authorization-desktop');
    await page.setViewportSize({ width: 390, height: 844 }); await shot('authorization-mobile');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await dialog().getByLabel('授权回调', { exact: true }).fill('http://127.0.0.1:1455/auth/callback?code=' + 'a'.repeat(4000) + '&scope=openid+profile&state=fixture');
    assert.ok((await dialog().getByLabel('授权回调', { exact: true }).boundingBox()).height < 60);
    await shot('long-callback-desktop');
    await dialog().getByRole('button', { name: '完成授权', exact: true }).click();
    await expect(dialog().getByRole('button', { name: '保存模型策略', exact: true })).toBeVisible();
    await expect(dialog().getByLabel('授权回调', { exact: true })).toHaveCount(0);
    await dialog().getByRole('button', { name: '同步模型', exact: true }).click();
    await expect(dialog().getByRole('checkbox', { name: 'gpt-5.6-luna', exact: true })).toBeVisible();
    await dialog().getByRole('checkbox', { name: '全部支持模型', exact: true }).uncheck();
    await dialog().getByRole('checkbox', { name: 'gpt-5.6-luna', exact: true }).check();
    await shot('models-desktop');
    await dialog().getByRole('button', { name: '保存模型策略', exact: true }).click();
    await expect(dialog().getByRole('button', { name: '保存模型策略', exact: true })).toBeEnabled();
    await dialog().getByRole('button', { name: '保存模型策略', exact: true }).click();
    await expect(page).toHaveURL(url => url.searchParams.get('status') === 'all' && url.searchParams.get('query') === ''); await expect(dialog()).toHaveCount(0); await expect(page.getByRole('alertdialog')).toHaveCount(0); assert.equal(completed, 1); assert.equal(updates, 2);
    checks.push('Real OAuth link generation and copy; isolated authorization step; failed model fetch/save retries do not redeem OAuth twice (exchange and save mocked)');
    await ctx.route('**/api/admin/accounts/models/preview', r => {
      previews++; const data = r.request().postDataJSON();
      assert.equal(data.provider, 'openai_api'); assert.equal(data.data.base_url, 'https://api.openai.com/v1');
      assert.equal(data.data.api_key, previews <= 3 ? 'sk-fixture-first-key' : 'sk-fixture-replaced-key');
      return previews === 1 ? r.fulfill({ status: 502, json: { message: 'Upstream unavailable' } }) : reply(r, { models: [{ id: previews <= 3 ? 'gpt-5.6-luna' : 'gpt-5.6-sol', label: 'Model' }] });
    });
    await ctx.route('**/api/admin/accounts/import', r => {
      imports++; const data = r.request().postDataJSON(); assert.equal(data.data.api_key, 'sk-fixture-replaced-key');
      assert.deepEqual(data.settings.modelAccess, { mode: 'all', models: [] });
      return reply(r, { importedCount: 1, accountIds: ['fixture-imported'] });
    });
    await page.getByRole('button', { name: '添加账号', exact: true }).click();
    await dialog().getByRole('tab', { name: 'API Key', exact: true }).click();
    await dialog().getByLabel('账号', { exact: true }).fill('API onboarding verification');
    await dialog().getByLabel('API Key', { exact: true }).fill('sk-fixture-first-key');
    await expect(dialog().getByText('模型策略', { exact: true })).toHaveCount(0);
    await dialog().getByRole('button', { name: '下一步', exact: true }).click();
    await expect(dialog().getByRole('button', { name: '下一步', exact: true })).toBeEnabled();
    await expect(dialog().getByLabel('API Key', { exact: true })).toHaveValue('sk-fixture-first-key');
    await dialog().getByRole('button', { name: '下一步', exact: true }).click();
    await expect(dialog().getByRole('checkbox', { name: 'gpt-5.6-luna', exact: true })).toBeVisible();
    await dialog().getByRole('checkbox', { name: '全部支持模型', exact: true }).uncheck();
    await dialog().getByRole('button', { name: '上一步', exact: true }).click();
    await dialog().getByRole('button', { name: '下一步', exact: true }).click();
    await expect(dialog().getByRole('checkbox', { name: 'gpt-5.6-luna', exact: true })).toBeVisible();
    await dialog().getByRole('button', { name: '上一步', exact: true }).click();
    await dialog().getByLabel('API Key', { exact: true }).fill('sk-fixture-replaced-key');
    await dialog().getByRole('button', { name: '下一步', exact: true }).click();
    await expect(dialog().getByRole('checkbox', { name: 'gpt-5.6-sol', exact: true })).toBeVisible();
    await expect(dialog().getByRole('checkbox', { name: 'gpt-5.6-luna', exact: true })).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 }); await shot('models-mobile');
    await dialog().getByRole('button', { name: '创建账号', exact: true }).click();
    await expect(dialog()).toHaveCount(0); assert.equal(imports, 1); assert.equal(previews, 4);
    checks.push('API model discovery gates the model step; errors preserve credentials; back/edit refetches; import runs once (upstream and import mocked)');
    assert.deepEqual(errors, []);
    fs.writeFileSync(out + (live ? '/live.json' : '/browser.json'), JSON.stringify({ passed: true, checks, errors }, null, 2));
  } catch (error) { await page.screenshot({ path: out + '/failure.png' }); throw error; }
  finally { await ctx.request.delete('/api/admin/v1/auth/session', { headers: { Origin: baseURL, 'X-CSRF-Token': session.csrf_token } }); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
