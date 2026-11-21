const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium, expect } = require('node:module').createRequire('/src/web/package.json')('@playwright/test');
const baseURL = 'https://192.168.2.150:19443';
const out = '/src/test-results/api-live';
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } });
  const cookies = fs.readFileSync('/verify/api-live-cookies.txt', 'utf8').split('\n').filter(line => line && (!line.startsWith('#') || line.startsWith('#HttpOnly_'))).map(line => {
    const [domain, , path, secure, expires, name, value] = line.replace('#HttpOnly_', '').split('\t');
    return { domain, path, secure: secure === 'TRUE', expires: +expires || -1, name, value, httpOnly: line.startsWith('#HttpOnly_') };
  });
  await context.addCookies(cookies);
  await context.addInitScript(() => { localStorage.setItem('i18nextLng', 'zh'); document.cookie = 'vite-ui-theme=dark; path=/'; });
  const state = JSON.parse(fs.readFileSync(out + '/accounts.json', 'utf8'));
  const page = await context.newPage();
  const errors = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', async response => {
    if (response.url().includes('/accounts/connection-test')) console.log('connection API',response.status(),await response.text().catch(()=>'<unfinished>'));
  });
  page.on('requestfailed', request => console.log('request failed',new URL(request.url()).pathname,request.failure()?.errorText));
  try {
    for (const [provider, model] of [['openai_api', 'gpt-5.6-luna'], ['xai_api', 'grok-4.5'], ['claude', 'claude-haiku-4-5-20251001']].filter(([provider]) => !process.argv[2] || process.argv[2] === provider)) {
      await page.goto('/accounts?query=' + encodeURIComponent('API 实测'));
      const action = page.locator('#account-actions-' + state[provider].account + ':visible');
      await expect(action).toBeVisible({ timeout: 30000 });
      let synchronized = false;
      const synchronization = [];
      for (let attempt = 0; attempt < 3 && !synchronized; attempt++) {
        await action.click();
        for (const name of ['个人信息', '额度重置', '重新授权', '刷新配额']) await expect(page.getByRole('menuitem', { name, exact: true })).toHaveCount(0);
        const responsePromise = page.waitForResponse(r => new URL(r.url()).pathname === '/api/admin/accounts/connection-test/models', { timeout: 50000 });
        await page.getByRole('menuitem', { name: '连接测试', exact: true }).click();
        const response = await responsePromise;
        const data = await response.json();
        synchronized = response.ok() && data.data?.models?.some(m => m.id === model);
        synchronization.push({ status: response.status(), passed: synchronized });
        if (!synchronized) await page.keyboard.press('Escape');
      }
      assert.ok(synchronized, provider + ' model sync failed after bounded retries');
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('combobox')).toBeEnabled({ timeout: 45000 });
      await dialog.getByRole('combobox').click();
      await expect(page.getByRole('option', { name: model, exact: true })).toBeVisible({ timeout: 45000 });
      await page.getByRole('option', { name: model, exact: true }).click();
      let passed = false;
      const attempts = [];
      for (let attempt = 0; attempt < 3 && !passed; attempt++) {
        const responsePromise = page.waitForResponse(r => new URL(r.url()).pathname === '/api/admin/accounts/connection-test', { timeout: 150000 });
        await dialog.getByRole('button', { name: '连接测试', exact: true }).click();
        const response = await responsePromise;
        // The UI cancels the reader after a terminal error; Chromium then may
        // discard the response body. Keep that attempt as a failure and retry.
        const body = await response.text().catch(() => '');
        passed = body.includes('"success":true') && body.includes('"type":"test_complete"');
        attempts.push({ status: response.status(), passed });
        await expect(dialog.getByRole('button', { name: '连接测试', exact: true })).toBeEnabled({ timeout: 150000 });
      }
      assert.ok(passed, provider + ' connection test failed after bounded retries');
      await expect(dialog.getByRole('status')).toContainText('OK', { timeout: 10000 });
      await expect(dialog.getByRole('button', { name: '连接测试', exact: true })).toBeEnabled({ timeout: 150000 });
      await page.screenshot({ path: `${out}/${provider}-desktop.png` });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: `${out}/${provider}-mobile.png` });
      await page.keyboard.press('Escape');
      await page.setViewportSize({ width: 1440, height: 1000 });
      checks.push({ provider, model, passed: true, attempts, synchronization });
      fs.writeFileSync(out + '/ui' + (process.argv[2] ? '-' + process.argv[2] : '') + '.json', JSON.stringify({ checks, errors }, null, 2));
    }
    assert.deepEqual(errors, []);
  } catch (error) {
    await page.screenshot({ path: out + '/ui-failure.png' });
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
