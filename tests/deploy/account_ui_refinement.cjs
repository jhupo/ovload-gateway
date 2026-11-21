// Server-only UI regression. OAuth statistics and media/error replies below are browser fixtures.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium, expect } = require('node:module').createRequire('/src/web/package.json')('@playwright/test');
const baseURL = 'https://192.168.2.150:19443', out = '/src/test-results/account-ui-refinement';
const live = process.argv.includes('live');
const fixtures = process.argv.includes('--fixtures');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(() => { localStorage.setItem('i18nextLng', 'zh'); document.cookie = 'vite-ui-theme=dark; path=/'; });
  const login = await ctx.request.post('/api/v1/auth/sessions', { headers: { Origin: baseURL }, data: { login: 'ovload_test_admin', password: fs.readFileSync('/verify/administrator.password', 'utf8').trim() } });
  assert.equal(login.status(), 200); const session = await login.json();
  if (!live) await ctx.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.origin !== baseURL || u.pathname.startsWith('/api/')) return route.continue();
    let file = path.join('/src/web/dist-account-ui', u.pathname);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = '/src/web/dist-account-ui/index.html';
    return route.fulfill({ path: file });
  });
  const page = await ctx.newPage(), errors = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', r => { if (new URL(r.url()).pathname === '/api/admin/accounts/connection-test/models') console.log('Model catalog HTTP', r.status()); });
  const id = 'acct_01a1cfdfcaa1729f82a32c60ae9fba38';
  const action = () => page.locator('#account-actions-' + id + ':visible');
  async function open(name) { await action().click(); await page.getByRole('menuitem', { name, exact: true }).click(); return page.getByRole('dialog').first(); }
  async function shot(name) { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await page.screenshot({ path: `${out}/${name}.png` }); }
  let models = 0;
  page.on('request', req => { if (new URL(req.url()).pathname === '/api/admin/accounts/connection-test/models') models++; });
  if (fixtures) {
    await ctx.route('**/api/admin/accounts/connection-test/models', r => r.fulfill({ json: { code: 200, data: { models: [{ id: 'gpt-5.6-luna', label: 'gpt-5.6-luna', kind: 'text' }] } } }));
    await ctx.route('**/api/admin/accounts/connection-test', r => r.fulfill({ contentType: 'text/event-stream', body: [{ type: 'test_start' }, { type: 'request' }, { type: 'content', text: 'OK' }, { type: 'test_complete', success: true }].map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') }));
  }
  try {
    await page.goto('/accounts?query=' + encodeURIComponent('API 实测'));
    await expect(action()).toBeVisible({ timeout: 30000 });
    const row = action().locator('xpath=ancestor::tr');
    for (const label of ['请求:', 'Token:', '账号计费:', '用户扣费:', 'API Key']) await expect(row).toContainText(label);
    await expect(row.locator('img[src="/images/providers/openai.svg"]')).toBeVisible();
    await shot('accounts-desktop'); checks.push('Live account table four metrics, provider/auth icons and API plan');
    let dialog = await open('用量详情');
    await expect(dialog).toContainText('用户扣费');
    await shot('usage-desktop');
    await page.setViewportSize({ width: 390, height: 844 }); await shot('usage-mobile');
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    dialog = await open('连接测试');
    await expect(dialog.getByRole('combobox')).toBeEnabled({ timeout: 50000 });
    await shot('connection-ready');
    const initial = models;
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    dialog = await open('连接测试');
    await expect(dialog.getByRole('combobox')).toBeEnabled();
    assert.equal(models, initial); checks.push('Reopening connection dialog reuses frontend catalog cache');
    await dialog.getByRole('combobox').click();
    await page.getByRole('option', { name: 'gpt-5.6-luna', exact: true }).click();
    await dialog.getByRole('button', { name: '开始测试', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText('连接测试通过', { timeout: 150000 });
    await expect(dialog).toContainText('发送请求');
    await shot('connection-success'); checks.push(fixtures ? 'Text test state/event timeline (browser fixture)' : 'Real OpenAI API model test and event timeline');
    await page.setViewportSize({ width: 390, height: 844 }); await shot('connection-mobile');
    await page.evaluate(() => document.documentElement.classList.remove('dark')); await shot('connection-light-mobile');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    let manualSyncs = 0, imagePrompt;
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0WQAAAAASUVORK5CYII=';
    await ctx.route('**/api/admin/accounts/models/refresh', r => { manualSyncs++; return r.fulfill({ json: { code: 200, data: { models: [] } } }); });
    await ctx.route('**/api/admin/accounts/connection-test/models', r => r.fulfill({ json: { code: 200, data: { models: [{ id: 'gpt-image-2', label: 'gpt-image-2', kind: 'image' }] } } }));
    await ctx.route('**/api/admin/accounts/connection-test', r => { imagePrompt = r.request().postDataJSON().prompt; return r.fulfill({ contentType: 'text/event-stream', body: [{ type: 'image', image_url: png }, { type: 'test_complete', success: true }].map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') }); });
    await dialog.getByRole('button', { name: '同步模型', exact: true }).click();
    await expect(dialog.getByRole('combobox')).toHaveText('gpt-image-2');
    assert.equal(manualSyncs, 1); assert.equal(models, initial + 1);
    await dialog.getByLabel('图片提示词').fill('橙色小猫');
    await dialog.getByRole('button', { name: '开始测试', exact: true }).click();
    await expect(dialog.getByRole('img')).toHaveAttribute('src', png);
    assert.equal(imagePrompt, '橙色小猫');
    await dialog.getByRole('button', { name: '查看图片 1', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(2);
    await page.keyboard.press('Escape');
    await ctx.route('**/api/admin/accounts/connection-test', r => r.fulfill({ contentType: 'text/event-stream', body: 'data: {"type":"error","error":"模拟上游错误"}\n\n' }));
    await dialog.getByRole('button', { name: '开始测试', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText('测试失败');
    await expect(dialog.getByRole('img')).toHaveCount(0);
    checks.push('Manual catalog sync and image preview/error states (browser fixtures)');
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();

    // Fixtures exercise OAuth-only layout without writing invented statistics to the database.
    const res = await ctx.request.get('/api/admin/accounts/detail?accountId=' + id); assert.equal(res.status(), 200);
    const detail = await res.json(); const account = detail.data.account;
    account.authenticationKind = 'oauth'; account.provider = 'openai'; account.planType = 'enterprise'; account.planTypeDisplay = 'Enterprise';
    account.capabilities.profile = true; account.capabilities.subscription = true;
    await ctx.route('**/api/admin/accounts?*', async r => { const rr = await r.fetch(); const data = await rr.json(); data.data.items = data.data.items.map(a => a.id === id ? account : a); await r.fulfill({ json: data }); });
    await ctx.route('**/api/admin/accounts/detail?*', r => r.fulfill({ json: detail }));
    const weeks = Array.from({ length: 52 }, (_, w) => ({ key: `week-${w}`, monthLabel: null, cells: Array.from({ length: 7 }, (_, day) => ({ date: new Date(Date.UTC(2025, 10, 17 + w * 7 + day)).toISOString().slice(0, 10), tokens: (w * 17 + day * 31) % 240 * 1000, isFuture: false })) }));
    await ctx.route('**/api/admin/accounts/personal-info?*', r => r.fulfill({ json: { code: 200, data: { profileError: null, subscription: null, profile: { displayName: account.name, summary: { totalTextTokens: 23000000, peakTokens: 1200000, longestTaskDurationMs: 5400000, currentStreakDays: 8, longestStreakDays: 31 }, activityCalendar: { rangeLabel: '2025–2026', weeks }, activityInsights: { fastModePercent: 20, reasoningEffort: 'high', reasoningEffortPercent: 80, skillsExplored: 12, totalSkillsUsed: 62, totalThreads: 148, invocations: [{ type: 'skill', skillName: '代码审查', usageCount: 45 }] }, hasStatsError: false } } } }));
    await page.reload(); await expect(action()).toBeVisible();
    dialog = await open('个人信息'); await expect(dialog).toContainText('23,000,000');
    await shot('profile-fixture-desktop');
    await page.setViewportSize({ width: 390, height: 844 }); await shot('profile-fixture-mobile');
    checks.push('OAuth profile fixture: summary, activity calendar, insights, responsive layout');
    assert.deepEqual(errors, []);
    fs.writeFileSync(`${out}/${live ? 'live' : 'candidate'}.json`, JSON.stringify({ passed: true, fixtures, checks, errors }, null, 2));
  } catch (error) { await page.screenshot({ path: out + '/failure.png' }); throw error; }
  finally { await ctx.request.delete('/api/admin/v1/auth/session', { headers: { Origin: baseURL, 'X-CSRF-Token': session.csrf_token } }); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
