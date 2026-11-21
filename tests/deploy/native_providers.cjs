const fs = require('node:fs');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { chromium, expect } = createRequire('/src/web/package.json')('@playwright/test');
const z = require('/src/web/src/i18n/locales/zh.json');
const p = require('/src/web/src/i18n/locales/zh-gateway-profiles.json');
const a = require('/src/web/src/i18n/locales/zh-upstream-accounts.json');
const base = 'https://192.168.2.150:19444';
const out = '/src/test-results/native-providers';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ baseURL: base, ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
  const errors = [], checks = [];
  let session, page;
  try {
    await context.addInitScript(() => localStorage.setItem('i18nextLng', 'zh'));
    const login = await context.request.post('/api/v1/auth/sessions', { headers: { Origin: base }, data: { login: 'ovload_gateway_ui_verify', password: fs.readFileSync('/test-runtime/administrator.password', 'utf8').trim() } });
    assert.equal(login.status(), 200);
    session = await login.json();
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/gateway-settings');
    for (const [provider, label] of [['gemini', 'Gemini'], ['claude', 'Claude']]) {
      await page.getByRole('tab', { name: label, exact: true }).click();
      const preset = page.getByRole('combobox', { name: p.preset, exact: true });
      await expect(preset).toBeEnabled();
      const chosen = (await preset.innerText()).includes('macOS') ? 'Windows · x64' : 'macOS · ARM64';
      await preset.click();
      await page.getByRole('option', { name: chosen, exact: true }).click();
      await page.getByRole('button', { name: p.preview, exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(provider === 'gemini' ? 'GeminiCLI/' : 'claude-cli/');
      await expect(dialog).not.toContainText('authorization');
      await page.screenshot({ animations: 'disabled', path: `${out}/${provider}-preview.png` });
      await page.keyboard.press('Escape');
      const saved = page.waitForResponse(response => response.url().endsWith('/settings/update'));
      await page.getByRole('button', { name: z.gatewaySettings.save, exact: true }).click();
      const savedResponse = await saved;
      assert.equal(savedResponse.status(), 200, await savedResponse.text());
      await page.reload();
      await page.getByRole('tab', { name: label, exact: true }).click();
      await expect(preset).toContainText(chosen);
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(preset).toBeVisible();
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        if (width === 1440) {
          const selectBox = await preset.boundingBox();
          const buttonBox = await page.getByRole('button', { name: p.preview, exact: true }).boundingBox();
          assert(Math.abs(selectBox.y - buttonBox.y) < 1 && Math.abs(selectBox.height - buttonBox.height) < 1, 'preset and buttons aligned');
        }
        await page.screenshot({ animations: 'disabled', path: `${out}/${provider}-${width}.png` });
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      checks.push(`${provider}: preset preview, save, reload and responsive layout`);
    }
    const pricing = await context.request.get('/api/admin/settings/pricing');
    assert.equal(pricing.status(), 200);
    const catalog = (await pricing.json()).data;
    assert('claude' in catalog.defaults && 'gemini' in catalog.defaults);
    checks.push('new providers available in centralized model pricing');

    for (const [provider, label, endpoint] of [['claude', 'Claude', 'https://api.anthropic.com/v1'], ['gemini', 'Gemini', 'https://generativelanguage.googleapis.com/v1beta']]) {
      await page.goto('/accounts');
      await page.getByRole('button', { name: a.add, exact: true }).click();
      await page.locator('#account-provider').click();
      await page.getByRole('option', { name: label, exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('tab', { name: 'API Key', exact: true }).click();
      await expect(page.locator('#account-baseUrl')).toHaveValue(endpoint);
      await expect(page.locator('#account-apiKey')).toBeVisible();
      await page.screenshot({ animations: 'disabled', path: `${out}/${provider}-key-account.png` });
      await page.locator('#account-name').fill(`Fixture ${label} API`);
      await page.locator('#account-apiKey').fill('fixture-disabled-native-key');
      const imported = page.waitForResponse(response => response.url().endsWith('/accounts/import'));
      await dialog.getByRole('button', { name: a.create, exact: true }).click();
      const importedResponse = await imported;
      assert.equal(importedResponse.status(), 201, await importedResponse.text());
      const importedData = (await importedResponse.json()).data;
      assert.equal(importedData.importedCount, 1);
      const accountId = importedData.accountIds[0];
      assert(accountId.startsWith('acct_'));
      const detail = await context.request.get(`/api/admin/accounts/detail?accountId=${accountId}`);
      assert.equal(detail.status(), 200);
      const storedAccount = (await detail.json()).data.account;
      assert.equal(storedAccount.provider, provider);
      assert.equal(storedAccount.enabled, false);
      assert.equal(storedAccount.authenticationKind, 'api_key');
      await expect(dialog).toHaveCount(0);
      await page.getByRole('button', { name: a.add, exact: true }).click();
      await page.locator('#account-provider').click();
      await page.getByRole('option', { name: label, exact: true }).click();
      await dialog.getByRole('tab', { name: 'OAuth', exact: true }).click();
      await expect(page.locator('#account-apiKey')).toHaveCount(0);
      await page.locator('#account-name').fill(`Fixture ${label} OAuth`);
      const started = page.waitForResponse(response => response.url().endsWith('/accounts/oauth/start'));
      await dialog.getByRole('button', { name: a.startAuthorization, exact: true }).click();
      const startResponse = await started;
      assert.equal(startResponse.status(), 201, await startResponse.text());
      const link = dialog.getByRole('link', { name: a.openAuthorization, exact: true });
      const authorization = new URL(await link.getAttribute('href'));
      assert.equal(authorization.hostname, provider === 'claude' ? 'claude.ai' : 'accounts.google.com');
      assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
      const target = new URL(authorization.searchParams.get('redirect_uri'));
      target.search = 'code=invalid-fixture-code&state=wrong-state';
      await page.locator('#account-callback').fill(target.toString());
      const completed = page.waitForResponse(response => response.url().endsWith('/accounts/oauth/complete'));
      await dialog.getByRole('button', { name: a.completeAuthorization, exact: true }).click();
      assert.equal((await completed).status(), 400);
      await expect(page.locator('[data-sonner-toast][data-type=error]').last()).toBeVisible();
      await dialog.getByRole('button', { name: a.cancel, exact: true }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: z.confirm_dialog.continue, exact: true }).click();
      checks.push(`${provider}: disabled API key account persisted, separate OAuth/key forms, server PKCE flow, wrong-state rejection`);
    }
    await page.route('**/api/admin/settings/client-profiles/gemini', route => route.abort('failed'));
    await page.goto('/gateway-settings');
    await page.reload();
    await page.getByRole('tab', { name: 'Gemini', exact: true }).click();
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: p.loadFailed })).toBeVisible();
    await expect(page.locator('main').getByText(p.loadFailed, { exact: true })).toHaveCount(0);
    checks.push('profile request failures appear in toast rather than occupying the settings form');
    assert.deepEqual(errors, []);
    fs.writeFileSync(`${out}/browser.json`, JSON.stringify({ passed: true, checks, errors }, null, 2));
    console.log('PASS ' + checks.join('; '));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
    await page?.screenshot({ path: `${out}/browser-failure.png` }).catch(() => {});
  } finally {
    if (session) await context.request.delete('/api/admin/v1/auth/session', { headers: { Origin: base, 'X-CSRF-Token': session.csrf_token } });
    await browser.close();
  }
})();
