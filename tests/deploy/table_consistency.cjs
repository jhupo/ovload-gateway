// Run on the test server; reads existing records and intercepts only synthetic proxy writes.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { chromium, expect } = createRequire('/src/web/package.json')('@playwright/test');
const base = 'https://192.168.2.150:19443';
const out = '/src/test-results/table-consistency';
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ baseURL: base, ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1000 }, colorScheme: 'dark' });
  const errors = [], checks = [];
  let page, session;
  try {
    await ctx.addInitScript(() => { localStorage.setItem('i18nextLng', 'zh'); document.cookie = 'vite-ui-theme=dark; path=/'; });
    const response = await ctx.request.post('/api/v1/auth/sessions', { headers: { Origin: base }, data: { login: 'ovload_test_admin', password: fs.readFileSync('/test-runtime/administrator.password', 'utf8').trim() } });
    assert.equal(response.status(), 200); session = await response.json();
    page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    async function toolbarCheck(path) {
      console.log('CHECK', path);
      await page.goto(path);
      if (path === '/data-backup') await page.getByRole('tab', {name:'定时备份',exact:true}).click();
      if (path === '/gateway-settings') await page.getByRole('tab', {name:'模型定价',exact:true}).click();
      await expect(page.locator('[data-slot=table-toolbar]').first()).toBeVisible();
      const toolbars = page.locator('[data-slot=table-toolbar]');
      for (const bar of await toolbars.all()) {
        if (!await bar.isVisible()) continue;
        const left = bar.locator('[data-slot=table-filters]');
        const right = bar.locator('[data-slot=table-actions]');
        await expect(left).toBeVisible();
        const view = bar.getByRole('button', { name: '视图', exact: true });
        if (await view.isVisible()) {
          await expect(right.getByRole('button', { name: '视图', exact: true })).toBeVisible();
          const l = await left.boundingBox(), r = await right.boundingBox(), outer = await bar.boundingBox();
          assert(r.x >= l.x + l.width - 1, path + ': filter/action overlap');
          assert(Math.abs(r.x + r.width - outer.x - outer.width) <= 2, path + ': view must align right');
        }
      }
      checks.push(path + ': shared left filters/right view');
    }
    for (const path of ['/groups','/accounts','/users','/announcements','/redemption-codes','/subscriptions','/orders/records','/orders/plans','/usage','/monitoring','/data-backup','/gateway-settings','/proxies']) {
      await toolbarCheck(path);
      if (['/groups','/accounts','/announcements','/proxies'].includes(path)) await page.screenshot({ path: out + '/' + path.slice(1).replaceAll('/', '-') + '-desktop.png' });
    }
    // The common view control changes actual visible columns, preserving selection and server search.
    await page.getByRole('button', { name: '视图', exact: true }).click();
    await page.getByRole('menuitemcheckbox', { name: '地区', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: '地区', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '视图', exact: true }).click();
    await page.getByRole('menuitemcheckbox', { name: '地区', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: '地区', exact: true })).toBeVisible();
    const search = page.getByRole('textbox', { name: '搜索名称 / 地址', exact: true });
    await search.fill('东京'); await expect(page.locator('tbody tr')).toHaveCount(1); await search.fill('');
    checks.push('proxy column visibility and real server search');
    await page.getByRole('button', { name: '添加代理', exact: true }).click();
    let dialog = page.getByRole('dialog').last();
    await expect(dialog.locator('#proxy-auto-location')).toHaveCount(0);
    const single = await dialog.boundingBox();
    await dialog.getByRole('tab', { name: '批量', exact: true }).click();
    const batch = await dialog.boundingBox();
    assert.deepEqual(batch, single, 'single/batch dialog geometry must remain fixed');
    await page.screenshot({ path: out + '/proxy-batch-desktop.png' });
    await dialog.getByRole('tab', { name: '单条', exact: true }).click();
    await dialog.evaluate(async el => { await Promise.all(el.getAnimations({subtree:true}).map(a => a.finished.catch(() => {}))); });
    await page.screenshot({ path: out + '/proxy-single-desktop.png' });
    let probes = 0, payloads = [];
    await page.route('**/api/admin/proxies/probe', async route => {
      assert.equal(route.request().postDataJSON().detectLocation, true);
      probes++;
      await route.fulfill({ json: { code: 200, data: { success: true, latencyMs: 20, exitIp: '192.0.2.240', location: { status: 'detected', location: { country: 'JP', region: 'Tokyo', city: 'Tokyo', timezone: 'Asia/Tokyo' } } } } });
    });
    await page.route('**/api/admin/proxies/create', async route => {
      const data = route.request().postDataJSON(); payloads.push(data);
      await route.fulfill({ json: { code: 200, data: data.map(() => ({ status: 'succeeded', data: {} })) } });
    });
    await dialog.locator('#proxy-name').fill('Synthetic detection verification');
    await dialog.locator('#proxy-url').fill('http://192.0.2.240:8080');
    await dialog.getByRole('button', { name: '连接测试', exact: true }).click();
    await expect(page.locator('[data-sonner-toast]').last()).toContainText('连接测试通过');
    assert.equal(probes, 1);
    await dialog.getByRole('button', { name: '保存代理', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
    assert.equal(payloads[0][0].autoLocation, true);
    await page.getByRole('button', { name: '添加代理', exact: true }).click(); dialog = page.getByRole('dialog').last();
    await dialog.getByRole('tab', { name: '批量', exact: true }).click(); await dialog.locator('#proxy-batch').fill('http://192.0.2.241:8080\nsocks5h://192.0.2.242:1080');
    await dialog.getByRole('button', { name: '批量添加', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
    assert(payloads[1].every(item => item.autoLocation === true));
    checks.push('stable single/batch geometry; position detection always requested; automatic location in single/batch writes (controlled responses)');
    await page.getByRole('button', { name: /查看 .* 的关联账号/ }).first().click();
    await page.getByRole('dialog').last().getByRole('button', { name: '分配账号', exact: true }).click();
    dialog = page.getByRole('dialog').last();
    const bar = dialog.locator('[data-slot=table-toolbar]');
    const assign = bar.getByRole('button', { name: /分配所选账号/ });
    await expect(assign).toBeVisible();
    const inputRect = await bar.getByRole('textbox').boundingBox(), buttonRect = await assign.boundingBox();
    assert(buttonRect.x > inputRect.x + inputRect.width && Math.abs(buttonRect.y - inputRect.y) < 4);
    await expect(dialog.locator('tbody tr').first()).toBeVisible();
    await dialog.evaluate(async el => { await Promise.all(el.getAnimations({subtree:true}).map(a => a.finished.catch(() => {}))); });
    await page.screenshot({ path: out + '/proxy-assign-desktop.png' });
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    checks.push('assign action beside search, no duplicate footer action');
    // Mobile route checks and both editor tabs, including custom-location scrolling.
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      for (const path of ['/groups','/accounts','/announcements','/proxies']) {
        await page.goto(path); await expect(page.locator('[data-slot=table-toolbar]').first()).toBeVisible();
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), path + ': mobile overflow');
      }
      await page.getByRole('button', { name: '添加代理', exact: true }).click(); dialog = page.getByRole('dialog').last();
      await dialog.evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished.catch(() => {}))); });
      const rect = await dialog.boundingBox();
      await dialog.getByRole('tab', { name: '批量', exact: true }).click(); assert.deepEqual(await dialog.boundingBox(), rect);
      await dialog.getByRole('tab', { name: '单条', exact: true }).click(); await dialog.locator('#proxy-custom-location').click();
      assert.deepEqual(await dialog.boundingBox(), rect);
      await dialog.locator('#proxy-timezone').scrollIntoViewIfNeeded();
      await expect(dialog.getByRole('button', { name: '保存代理', exact: true })).toBeInViewport();
      assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
      await page.screenshot({ path: out + '/proxy-custom-mobile-' + width + '.png' });
      await page.keyboard.press('Escape'); await page.getByRole('alertdialog').getByRole('button', { name: '放弃修改', exact: true }).click();
    }
    assert.deepEqual(errors, []); checks.push('390px/320px: no page overflow, stable dialog, reachable fields/footer, no page exceptions');
    fs.writeFileSync(out + '/browser.json', JSON.stringify({ passed: true, checks, errors }, null, 2));
    console.log('PASS ' + checks.join('; '));
  } catch (e) {
    if (page) { await page.screenshot({ path: out + '/failure.png' }).catch(() => {}); fs.writeFileSync(out + '/failure.txt', await page.locator('body').innerText().catch(() => '')); }
    console.error(e); process.exitCode = 1;
  } finally {
    if (session) await ctx.request.delete('/api/admin/v1/auth/session', { headers: { Origin: base, 'X-CSRF-Token': session.csrf_token } });
    await browser.close();
  }
})();
