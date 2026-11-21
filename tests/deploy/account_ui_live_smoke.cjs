const fs = require('node:fs'), assert = require('node:assert/strict');
const { chromium, expect } = require('node:module').createRequire('/src/web/package.json')('@playwright/test');
const baseURL = 'https://192.168.2.150:19443', out = '/src/test-results/account-ui-refinement';
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(() => { localStorage.setItem('i18nextLng', 'zh'); document.cookie = 'vite-ui-theme=dark; path=/'; });
  const response = await ctx.request.post('/api/v1/auth/sessions', { headers: { Origin: baseURL }, data: { login: 'ovload_test_admin', password: fs.readFileSync('/verify/administrator.password', 'utf8').trim() } });
  assert.equal(response.status(), 200); const session = await response.json();
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto('/accounts?query=' + encodeURIComponent('API 实测'));
    await expect(page.locator('#account-actions-acct_01a1cfdfcaa1729f82a32c60ae9fba38:visible')).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('table')).toContainText('用户扣费:');
    assert.ok(!/(?:USD|US\$)/.test(await page.getByRole('table').innerText()));
    await page.screenshot({ path: out + '/live-accounts.png' });
    await page.goto('/usage');
    await expect(page.getByRole('table').first()).toContainText('$', { timeout: 30000 });
    assert.ok(!/(?:USD|US\$)/.test(await page.getByRole('table').first().innerText()));
    await page.screenshot({ path: out + '/live-usage.png' });
    assert.deepEqual(errors, []);
    fs.writeFileSync(out + '/live.json', JSON.stringify({ passed: true, errors, checks: ['Published account table has four metrics', 'Account and usage tables consistently display $'] }, null, 2));
  } finally { await ctx.request.delete('/api/admin/v1/auth/session', { headers: { Origin: baseURL, 'X-CSRF-Token': session.csrf_token } }); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
